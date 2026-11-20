/**
 * 체크락 — 판매 중인 마크 계정을 30분마다 공개 정보로 점검한다 (로그인은 하지 않는다).
 *  - 닉네임이 사라졌는지 / 다른 계정 것이 됐는지 (원래 주인이 회수해 닉을 바꾼 경우)
 *  - 처음 본 UUID 의 현재 닉네임이 상품 닉네임과 다른지
 *  - 보유 망토가 줄었는지 (경고만)
 * 같은 문제가 두 번 연속 보이면 그 상품 판매를 멈추고 관리자 로그 채널 · 사이트 관리자 알림으로 알린다.
 * 관리자가 상품을 다시 켜면 그때 상태를 새 기준으로 삼는다.
 */
import { getShopSettings, getStoreForRead, persistAsync, updateProduct } from "@/lib/store";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

type Entry = {
  name: string;
  uuid: string | null;
  capes: string[];
  firstAt: string;
  lastAt: string;
  strikes: number;
  issue: string | null;
  flaggedAt: string | null;
  /** 판매를 멈춘 상품을 관리자가 다시 켰으면 기준을 새로 잡는다 */
  stopped: boolean;
  /** DOES 가 본 닉네임 기록 (계정 여권용) */
  names?: string[];
};
type Db = { entries: Record<string, Entry>; lastRun: string | null; cursor: number };

const key = (shopId: string) => `checklock:v1:${shopId}`;
const RUN_EVERY_MS = 30 * 60_000;
const BATCH = 12;
const UA = { "User-Agent": "DOES-checklock/1.0" };

type Look = { status: "ok"; id: string; name: string } | { status: "missing" } | { status: "error" };

async function lookOne(url: string, pick: (j: Record<string, unknown>) => { id?: string; name?: string } | null): Promise<Look> {
  try {
    const r = await fetch(url, { headers: UA });
    if (r.status === 204 || r.status === 404) return { status: "missing" };
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    // playerdb 는 없는 닉네임에 400 + code: minecraft.invalid_username 으로 답한다
    if (!r.ok) return /invalid_username|not_found/i.test(String(j?.code ?? "")) ? { status: "missing" } : { status: "error" };
    const got = j ? pick(j) : null;
    return got?.id ? { status: "ok", id: got.id.replace(/-/g, ""), name: got.name ?? "" } : { status: "missing" };
  } catch {
    return { status: "error" };
  }
}

/**
 * 닉네임 → UUID. Mojang 이 일부 Cloudflare IP 를 막는 일이 있어 여러 곳에 물어보고,
 * '없음' 은 두 곳 이상이 없다고 할 때만 믿는다 (하나라도 찾으면 있음).
 */
async function byName(name: string): Promise<Look> {
  const enc = encodeURIComponent(name);
  const results = await Promise.all([
    lookOne(`https://api.mojang.com/users/profiles/minecraft/${enc}`, (j) => ({ id: j.id as string, name: j.name as string })),
    lookOne(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${enc}`, (j) => ({ id: j.id as string, name: j.name as string })),
    lookOne(`https://playerdb.co/api/player/minecraft/${enc}`, (j) => {
      const p = (j.data as { player?: { raw_id?: string; id?: string; username?: string } } | undefined)?.player;
      return p ? { id: p.raw_id || p.id, name: p.username } : null;
    }),
  ]);
  const ok = results.find((r) => r.status === "ok");
  if (ok) return ok;
  return results.filter((r) => r.status === "missing").length >= 2 ? { status: "missing" } : { status: "error" };
}

async function byUuid(uuid: string): Promise<string | null> {
  const a = await lookOne(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, (j) => ({ id: j.id as string, name: j.name as string }));
  if (a.status === "ok") return a.name || null;
  const b = await lookOne(`https://playerdb.co/api/player/minecraft/${uuid}`, (j) => {
    const p = (j.data as { player?: { raw_id?: string; id?: string; username?: string } } | undefined)?.player;
    return p ? { id: p.raw_id || p.id, name: p.username } : null;
  });
  return b.status === "ok" ? b.name || null : null;
}

async function capeHashes(name: string) {
  try {
    const { resolveMcProfile } = await import("@/lib/mc-profile-server");
    const p = await resolveMcProfile(name);
    return (p?.capes ?? []).filter((c) => c.source === "minecraft" && c.hash).map((c) => c.hash as string);
  } catch {
    return null;
  }
}

export async function getChecklockDb(shopId: string) {
  return (await kvGetJson<Db>(key(shopId))) ?? { entries: {}, lastRun: null, cursor: 0 };
}

async function notify(shopId: string, productId: string, productName: string, issue: string, stopped: boolean) {
  const { pushAdminNotification } = await import("@/lib/store-ext");
  pushAdminNotification(shopId, "checklock", stopped ? "체크락: 판매 중지" : "체크락: 확인 필요", `${productName} — ${issue}`, { productId });
  const channelId = getShopSettings(shopId).discordAdminLogChannelId;
  if (!channelId) return;
  const { getShopById } = await import("@/lib/store");
  const slug = getShopById(shopId)?.slug;
  const card = slug
    ? await import("@/lib/discord/rank-image")
        .then((m) =>
          m.cardImageUrl(slug, {
            theme: "red",
            eyebrow: "CHECKLOCK",
            title: stopped ? "판매를 멈췄어요" : "확인이 필요해요",
            subtitle: productName,
            chips: [issue.slice(0, 30)],
            note: stopped ? "확인 후 관리자 페이지에서 상품을 다시 켜면 새 기준으로 점검해요" : "망토 변화는 판매를 멈추지 않아요",
          }),
        )
        .catch(() => null)
    : null;
  const { postChannelMessage } = await import("@/lib/discord/rest");
  const { container, mediaGallery, MessageFlags, textDisplay } = await import("@/lib/discord/components");
  await postChannelMessage(
    channelId,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [container([...(card ? [mediaGallery([card])] : []), textDisplay(`**체크락** · ${productName}\n${issue}${stopped ? "\n-# 상품 판매를 자동으로 멈췄어요" : ""}`)], 0xef4444)],
      allowed_mentions: { parse: [] },
    },
    shopId,
  ).catch(() => null);
}

/** 한 번 점검 (BATCH 개씩 돌아가며). force 면 30분 간격을 무시한다 */
export async function runChecklock(shopId: string, force = false) {
  return withLock(key(shopId), async () => {
    const db = await getChecklockDb(shopId);
    if (!force && db.lastRun && Date.now() - new Date(db.lastRun).getTime() < RUN_EVERY_MS - 30_000) return { skipped: true as const };
    const store = getStoreForRead();
    const products = store.products.filter((p) => p.shopId === shopId && p.productKind === "mc_account" && p.mcNickname);
    // 재고가 남아 있는(아직 안 팔린) 판매 중 상품만
    const { listProducts } = await import("@/lib/store");
    const avail = new Set(listProducts(shopId).filter((p) => p.availableCount > 0).map((p) => p.id));
    const live = products.filter((p) => p.active && avail.has(p.id));
    const now = new Date().toISOString();
    const checked: string[] = [];
    const flagged: { name: string; issue: string }[] = [];
    // 판매 중인 것만, 돌아가며
    const start = live.length ? db.cursor % live.length : 0;
    const batch = [...live.slice(start), ...live.slice(0, start)].slice(0, force ? Math.min(40, live.length) : BATCH);
    for (const p of batch) {
      const nick = p.mcNickname!.trim();
      const prev = db.entries[p.id];
      // 멈췄던 상품을 관리자가 다시 켰으면 새로 기준을 잡는다
      const fresh = !prev || prev.stopped;
      const n = await byName(nick);
      if (n.status === "error") continue;
      const seenNames = new Set<string>([...(prev?.names ?? []), nick]);
      let issue: string | null = null;
      let uuid = prev && !fresh ? prev.uuid : null;
      if (n.status === "missing") {
        issue = "닉네임이 더 이상 존재하지 않아요 (닉 변경 · 회수 의심)";
      } else if (uuid && n.id !== uuid) {
        issue = "같은 닉네임이 다른 계정 것이 됐어요 (회수 의심)";
      } else {
        uuid = n.id;
        if (prev && !fresh && prev.uuid) {
          const cur = await byUuid(prev.uuid);
          if (cur && cur.toLowerCase() !== nick.toLowerCase()) {
            issue = `닉네임이 ${cur} 으로 바뀌었어요 (회수 의심)`;
            seenNames.add(cur);
          }
        }
      }
      const capes = issue ? null : await capeHashes(nick);
      let warn: string | null = null;
      if (!issue && capes && prev && !fresh && prev.capes.length) {
        const lost = prev.capes.filter((h) => !capes.includes(h));
        if (lost.length) warn = `보유 망토 ${lost.length}개가 사라졌어요`;
      }
      const entry: Entry = {
        name: nick,
        uuid,
        capes: capes ?? prev?.capes ?? [],
        firstAt: fresh ? now : prev!.firstAt,
        lastAt: now,
        strikes: issue ? (fresh ? 1 : (prev?.strikes ?? 0) + 1) : 0,
        issue: issue ?? warn,
        flaggedAt: prev?.flaggedAt && !fresh ? prev.flaggedAt : null,
        stopped: false,
        names: [...seenNames].slice(-10),
      };
      // 같은 문제가 두 번 연속이면 판매 중지
      if (issue && entry.strikes >= 2) {
        updateProduct(shopId, p.id, { active: false });
        entry.stopped = true;
        entry.flaggedAt = now;
        flagged.push({ name: p.name, issue });
        await notify(shopId, p.id, p.name, issue, true);
      } else if (warn && prev?.issue !== warn) {
        await notify(shopId, p.id, p.name, warn, false);
      }
      db.entries[p.id] = entry;
      checked.push(p.id);
    }
    db.cursor = (start + batch.length) % Math.max(1, live.length);
    db.lastRun = now;
    // 지워진 상품 기록 정리
    const ids = new Set(products.map((p) => p.id));
    for (const id of Object.keys(db.entries)) if (!ids.has(id)) delete db.entries[id];
    await kvPutJson(key(shopId), db);
    if (flagged.length) await persistAsync();
    return { skipped: false as const, checked: checked.length, flagged };
  });
}
