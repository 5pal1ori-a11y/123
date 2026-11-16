/**
 * 예전에 등록한 마크 계정(DOES 재고에 계정 정보가 직접 들어 있음)을 MFA MARKET 재고로 옮긴다.
 * 옮긴 뒤에는 구매하면 계정 정보 대신 16자리 코드가 간다. 원래 재고 줄은 KV 에 30일 백업해 둔다.
 * 한 번에 몇 개씩만 처리하고(요청 시간 제한), 이미 MFA 에 있는 계정은 다시 만들지 않는다.
 */
import { getMfaConfig, mfaAdminRaw, refreshMfaStock } from "@/lib/mfa";
import { deleteInventoryItems, getStoreForRead, listInventories, persistAsync, updateProduct } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

const KEYS: Record<string, "nickname" | "email" | "password" | "recoveryEmail" | "recoveryCode" | "memo"> = {
  닉네임: "nickname",
  이메일: "email",
  비밀번호: "password",
  "복구 이메일": "recoveryEmail",
  "복구 코드": "recoveryCode",
  메모: "memo",
};

function parse(code: string) {
  const out: Partial<Record<(typeof KEYS)[string], string>> = {};
  for (const part of code.split(" | ")) {
    const i = part.indexOf(": ");
    if (i < 0) continue;
    const k = KEYS[part.slice(0, i).trim()];
    if (k) out[k] = part.slice(i + 2).trim();
  }
  return out;
}

export type MigrateResult = { moved: string[]; skipped: { product: string; reason: string }[]; remaining: number };

function pending(shopId: string) {
  return getStoreForRead().products.filter((p) => {
    if (p.shopId !== shopId || p.productKind !== "mc_account") return false;
    const local = listInventories(shopId, p.id).filter((i) => i.status === "available").length;
    return local === 1;
  });
}

export async function migrateMcAccountsToMfa(shopId: string, batch = 6): Promise<MigrateResult> {
  if (!getMfaConfig(shopId)) return { moved: [], skipped: [{ product: "-", reason: "MFA MARKET 연동 설정이 없어요" }], remaining: 0 };
  return withLock(`mfa-migrate:${shopId}`, async () => {
    const todo = pending(shopId);
    const result: MigrateResult = { moved: [], skipped: [], remaining: todo.length };
    const backupKey = `mfa-migrate-backup:${shopId}`;
    for (const p of todo.slice(0, batch)) {
      const item = listInventories(shopId, p.id).find((i) => i.status === "available")!;
      const f = parse(item.codeValue);
      const nickname = (f.nickname || p.mcNickname || "").trim();
      if (!nickname || !f.email || !f.password) {
        result.skipped.push({ product: p.name, reason: "계정 정보 형식을 읽지 못함" });
        continue;
      }
      const mfaName = p.mfaProduct || `DOES ${p.slug}`.slice(0, 40);
      // 지난번에 MFA 에 이미 만들어졌는지 먼저 본다 (중복 등록 방지)
      const found = await mfaAdminRaw(shopId, "GET", "accounts", `?q=${encodeURIComponent(nickname)}`);
      const exists = Array.isArray(found.data.accounts) && (found.data.accounts as { product?: string | null }[]).some((a) => (a.product ?? "") === mfaName);
      if (!exists) {
        const { status, data } = await mfaAdminRaw(shopId, "POST", "accounts", "", {
          nickname,
          email: f.email,
          password: f.password,
          recoveryEmail: f.recoveryEmail || null,
          recoveryCode: f.recoveryCode || null,
          memo: f.memo || null,
          product: mfaName,
        });
        if (status >= 400) {
          result.skipped.push({ product: p.name, reason: String(data.error || `MFA 등록 실패 (${status})`) });
          continue;
        }
        const backup = (await kvGetJson<{ productId: string; code: string; at: string }[]>(backupKey)) ?? [];
        backup.push({ productId: p.id, code: item.codeValue, at: new Date().toISOString() });
        await kvPutJson(backupKey, backup, 30 * 86_400);
      }
      if (p.mfaProduct !== mfaName) updateProduct(shopId, p.id, { mfaProduct: mfaName });
      deleteInventoryItems(shopId, [item.id], "mfa-migrate");
      await persistAsync();
      result.moved.push(p.name);
      result.remaining -= 1;
    }
    await refreshMfaStock(shopId).catch(() => null);
    return result;
  });
}
