/**
 * 예전에 등록한 마크 계정(DOES 재고에 계정 정보가 직접 들어 있음)을 MFA MARKET 재고로 옮긴다.
 * 옮긴 뒤에는 구매하면 계정 정보 대신 16자리 코드가 간다. 원래 재고 줄은 KV 에 30일 백업해 둔다.
 */
import { getMfaConfig, mfaAdmin, refreshMfaStock } from "@/lib/mfa";
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

export type MigrateResult = { moved: string[]; skipped: { product: string; reason: string }[] };

export async function migrateMcAccountsToMfa(shopId: string): Promise<MigrateResult> {
  if (!getMfaConfig(shopId)) return { moved: [], skipped: [{ product: "-", reason: "MFA MARKET 연동 설정이 없어요" }] };
  return withLock(`mfa-migrate:${shopId}`, async () => {
    const products = getStoreForRead().products.filter((p) => p.shopId === shopId && p.productKind === "mc_account" && !p.mfaProduct);
    const result: MigrateResult = { moved: [], skipped: [] };
    const backupKey = `mfa-migrate-backup:${shopId}`;
    const backup = (await kvGetJson<{ productId: string; code: string; at: string }[]>(backupKey)) ?? [];
    for (const p of products) {
      const items = listInventories(shopId, p.id).filter((i) => i.status === "available");
      if (items.length !== 1) {
        result.skipped.push({ product: p.name, reason: items.length ? `판매 가능한 재고가 ${items.length}개` : "판매 가능한 재고 없음" });
        continue;
      }
      const item = items[0]!;
      const f = parse(item.codeValue);
      const nickname = (f.nickname || p.mcNickname || "").trim();
      if (!nickname || !f.email || !f.password) {
        result.skipped.push({ product: p.name, reason: "계정 정보 형식을 읽지 못함" });
        continue;
      }
      const mfaName = `DOES ${p.slug}`.slice(0, 40);
      const { status, data } = await mfaAdmin(shopId, "POST", "accounts", "", {
        nickname,
        email: f.email,
        password: f.password,
        recoveryEmail: f.recoveryEmail || null,
        recoveryCode: f.recoveryCode || null,
        memo: f.memo || null,
        product: mfaName,
      });
      if (status >= 400) {
        result.skipped.push({ product: p.name, reason: (data as { error?: string })?.error || `MFA 등록 실패 (${status})` });
        continue;
      }
      backup.push({ productId: p.id, code: item.codeValue, at: new Date().toISOString() });
      await kvPutJson(backupKey, backup, 30 * 86_400);
      updateProduct(shopId, p.id, { mfaProduct: mfaName });
      deleteInventoryItems(shopId, [item.id], "mfa-migrate");
      result.moved.push(p.name);
    }
    await persistAsync();
    await refreshMfaStock(shopId).catch(() => null);
    return result;
  });
}
