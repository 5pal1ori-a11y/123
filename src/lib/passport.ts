/**
 * 계정 여권 — 판매하는 마크 계정마다 서명된 여권 번호를 발급하고, 공개 정보로 이력을 보여 준다.
 *
 * 번호: DP-XXXX-XXXX (상품 id 를 서버 비밀키로 HMAC 한 값) → KV 에 번호 → 상품 매핑을 남긴다.
 * 진위: 번호로 상품을 찾고, 같은 비밀키로 다시 계산한 번호와 같아야 '정품'.
 *
 * 담는 정보 (모두 공개 정보 · DOES 기록 기준 — 로그인 없이 확인 가능한 것만)
 *  - 닉네임(가림) · UUID 앞자리 · 망토
 *  - 하이픽셀: 등급 · 레벨 · 베드워즈 별 · 첫 접속(계정 나이의 근거) · 마지막 접속
 *  - 닉네임: 마지막 변경일 · DOES 가 본 닉 기록
 *  - 점검: 관리자 밴 점검(하이픽셀 · 도넛) · 체크락 상태
 *  - 보증: 판매 중이면 '구매 후 30일', 팔렸으면 남은 보증 기간
 */
import { MFA_SITE_ORIGIN } from "@/lib/domain";
import { createHmac } from "crypto";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";
import { CAPE_BY_TYPE, capeTypesFromHashes } from "@/lib/capes-data";
import type { Product } from "@/lib/types";

export const WARRANTY_DAYS = 30;
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const mapKey = (no: string) => `passport:v1:${no}`;
const dataKey = (productId: string) => `passport:data:v1:${productId}`;
const DATA_TTL_MS = 30 * 60_000;

async function secret() {
  const { expectedSecret } = await import("@/lib/internal-secret");
  return (await expectedSecret()) || "does-passport";
}

/** 상품 id → 여권 번호 (같은 상품은 항상 같은 번호) */
export async function passportNo(productId: string) {
  const mac = createHmac("sha256", await secret()).update(`passport:${productId}`).digest();
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHA[mac[i]! % ALPHA.length];
  return `DP-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizePassportNo(raw: string) {
  const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = t.startsWith("DP") ? t.slice(2) : t;
  return body.length === 8 ? `DP-${body.slice(0, 4)}-${body.slice(4)}` : null;
}

/** 여권 발급 (이미 있으면 그대로) — 번호 → 상품 매핑을 남긴다 */
export async function issuePassport(product: Pick<Product, "id" | "shopId">) {
  const no = await passportNo(product.id);
  const k = mapKey(no);
  const had = await kvGetJson<{ productId: string; shopId: string; issuedAt: string }>(k);
  if (!had) await kvPutJson(k, { productId: product.id, shopId: product.shopId, issuedAt: new Date().toISOString() });
  return { no, issuedAt: had?.issuedAt ?? new Date().toISOString() };
}

/** 번호로 여권을 찾고 진위를 확인한다 */
export async function lookupPassport(rawNo: string) {
  const no = normalizePassportNo(rawNo);
  if (!no) return null;
  const rec = await kvGetJson<{ productId: string; shopId: string; issuedAt: string }>(mapKey(no));
  if (!rec) return { no, genuine: false as const, productId: null, shopId: null, issuedAt: null };
  const genuine = (await passportNo(rec.productId)) === no;
  return { no, genuine, productId: rec.productId, shopId: rec.shopId, issuedAt: rec.issuedAt };
}

export type PassportData = {
  no: string;
  issuedAt: string;
  checkedAt: string;
  productId: string;
  productSlug: string;
  productName: string;
  price: number;
  name: string;
  uuidShort: string | null;
  capes: { type: string; title: string }[];
  hypixel: {
    rank: string | null;
    level: number;
    bedwarsStars: number;
    firstLogin: string | null;
    lastLogin: string | null;
  } | null;
  nameChange: { lastChangedAt: string | null } | null;
  doesSeen: { since: string | null; names: string[] };
  bans: { hypixel: boolean | null; donut: boolean | null; checkedBy: "admin" | null };
  checklock: { status: "ok" | "warning" | "stopped" | "unknown"; issue: string | null };
  warranty: { state: "on_sale" | "active" | "expired" | "none"; until: string | null; daysLeft: number | null };
};

/** 여권 내용 만들기 — 30분 캐시 (공개 API 를 너무 자주 부르지 않게) */
export async function buildPassport(productId: string, fresh = false): Promise<PassportData | null> {
  const { getProductById, getStoreForRead } = await import("@/lib/store");
  const p = getProductById(productId);
  if (!p || p.productKind !== "mc_account" || !p.mcNickname) return null;
  if (!fresh) {
    const cached = await kvGetJson<PassportData>(dataKey(productId)).catch(() => null);
    if (cached && Date.now() - Date.parse(cached.checkedAt) < DATA_TTL_MS) return cached;
  }
  const { no, issuedAt } = await issuePassport(p);

  const [{ resolveMcProfile }, { getChecklockDb }] = await Promise.all([import("@/lib/mc-profile-server"), import("@/lib/checklock")]);
  const profile = await resolveMcProfile(p.mcNickname).catch(() => null);
  const uuid = profile?.uuid ?? null;

  let hypixel: PassportData["hypixel"] = null;
  if (uuid) {
    try {
      const { hypixelConfigured, hypixelStats } = await import("@/lib/world/minecraft");
      if (await hypixelConfigured()) {
        const h = await hypixelStats(uuid);
        if (h) hypixel = { rank: h.rank, level: h.level, bedwarsStars: h.bedwars?.stars ?? 0, firstLogin: h.firstLogin, lastLogin: h.lastLogin };
      }
    } catch {
      hypixel = null;
    }
  }

  let nameChange: PassportData["nameChange"] = null;
  if (uuid) {
    const { lookupNameChange } = await import("@/lib/mc-extra-lookup");
    const nc = await lookupNameChange(uuid).catch(() => null);
    nameChange = nc ? { lastChangedAt: nc.lastChangedAt } : null;
  }

  const lock = (await getChecklockDb(p.shopId).catch(() => null))?.entries?.[p.id] as
    | { name: string; capes: string[]; firstAt: string; issue: string | null; stopped: boolean; strikes: number; names?: string[] }
    | undefined;

  const capeTypes = Array.isArray(p.mcCapes) && p.mcCapes.length ? p.mcCapes : capeTypesFromHashes(lock?.capes ?? []);
  const capes = capeTypes.map((t) => ({ type: t, title: CAPE_BY_TYPE[t]?.title ?? t }));
  if (!capes.length && profile?.capes?.length) {
    for (const c of profile.capes) if (c.title) capes.push({ type: c.title.toLowerCase(), title: c.title });
  }

  // 보증 — 팔렸으면 지급 시점부터 30일
  const order = getStoreForRead()
    .orders.filter((o) => o.productId === p.id && o.paidAt && ["paid", "dispensed", "awaiting_fulfillment"].includes(o.status))
    .sort((a, b) => Date.parse(b.paidAt!) - Date.parse(a.paidAt!))[0];
  let warranty: PassportData["warranty"];
  // 아직 재고가 남아 판매 중이면 '구매 후 30일' (예전 주문이 있어도 지금 파는 건 새 계정)
  const { listProducts } = await import("@/lib/store");
  const onSale = p.active && listProducts(p.shopId).some((x) => x.id === p.id && x.availableCount > 0);
  if (onSale) {
    warranty = { state: "on_sale", until: null, daysLeft: WARRANTY_DAYS };
  } else if (order?.paidAt) {
    const until = Date.parse(order.paidAt) + WARRANTY_DAYS * 86_400_000;
    const left = Math.ceil((until - Date.now()) / 86_400_000);
    warranty = { state: left > 0 ? "active" : "expired", until: new Date(until).toISOString(), daysLeft: Math.max(0, left) };
  } else {
    warranty = p.active ? { state: "on_sale", until: null, daysLeft: WARRANTY_DAYS } : { state: "none", until: null, daysLeft: null };
  }

  const st = p.mcStatus ?? null;
  const data: PassportData = {
    no,
    issuedAt,
    checkedAt: new Date().toISOString(),
    productId: p.id,
    productSlug: p.slug,
    productName: p.name,
    price: p.price,
    name: p.mcShowName ? p.mcNickname : (p.mcMaskedName ?? `${p.mcNickname.slice(0, 2)}${"*".repeat(Math.max(1, p.mcNickname.length - 3))}${p.mcNickname.slice(-1)}`),
    uuidShort: uuid ? uuid.replace(/-/g, "").slice(0, 8) : null,
    capes,
    hypixel,
    nameChange,
    doesSeen: { since: lock?.firstAt ?? p.createdAt, names: lock?.names ?? [] },
    bans: {
      hypixel: st?.hypixelBanned ?? null,
      donut: st?.donutBanned ?? null,
      checkedBy: st && (st.hypixelBanned !== undefined || st.donutBanned !== undefined) ? "admin" : null,
    },
    checklock: lock ? { status: lock.stopped ? "stopped" : lock.issue ? "warning" : "ok", issue: lock.issue } : { status: "unknown", issue: null },
    warranty,
  };
  await kvPutJson(dataKey(productId), data).catch(() => null);
  return data;
}

/** 여권 이미지 주소 (이미지 워커가 없으면 null) */
export async function passportImageUrl(shopSlug: string, d: PassportData) {
  const { hasRankImage, signedDataImageUrl } = await import("@/lib/discord/rank-image");
  if (!(await hasRankImage())) return null;
  return signedDataImageUrl(shopSlug, {
    kind: "passport",
    no: d.no,
    name: d.name,
    uuid: d.uuidShort,
    skin: `${MFA_SITE_ORIGIN}/api/mc-account/${d.productId}?asset=skin`,
    capes: d.capes.map((c) => c.title).slice(0, 4),
    hypixel: d.hypixel ? { rank: d.hypixel.rank, level: d.hypixel.level, bw: d.hypixel.bedwarsStars, first: d.hypixel.firstLogin } : null,
    lastNameChange: d.nameChange?.lastChangedAt ?? null,
    bans: { hypixel: d.bans.hypixel, donut: d.bans.donut },
    lock: d.checklock.status,
    warranty: d.warranty,
    issued: d.issuedAt,
    checked: d.checkedAt,
    url: `${MFA_SITE_ORIGIN}/passport/${d.no}`,
  });
}
