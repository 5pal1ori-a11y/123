/**
 * 계정 렌탈 — 비싼 망토 · 랭크 계정을 기간 단위로 빌려준다.
 *
 * - 관리자가 렌탈 상품 등록 (제목 · 하루 가격 · 보증금 · 로그인 정보는 암호화 보관)
 * - 손님: 1 · 3 · 7 · 30일 대여 (7일 10% · 30일 20% 할인) → 포인트로 대여료 + 보증금 결제 → 로그인 정보 즉시 전달
 * - 대여 중 연장 · 조기 반납 가능 (조기 반납은 남은 기간 환불 없음)
 * - 끝나기 1시간 전 DM → 끝나면 '반납 대기' → 관리자가 비밀번호를 바꾸고 [반납 완료] → 보증금 환불(차감 가능) · 다시 대여 가능
 * - 시즌패스 보상인 '렌탈 1일권' 은 대여료 하루치를 대신한다 (보증금은 따로)
 */
import { decryptSecret, encryptSecret } from "@/lib/verify-bot/crypto";
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

export const RENTAL_DAYS = [1, 3, 7, 30] as const;
export type RentalDays = (typeof RENTAL_DAYS)[number];
const DISCOUNT: Record<number, number> = { 1: 0, 3: 0, 7: 0.1, 30: 0.2 };

export type RentalItem = {
  id: string;
  title: string;
  description: string;
  capes: string[];
  dailyPrice: number;
  deposit: number;
  credEnc: string | null;
  status: "available" | "rented" | "returning" | "hidden";
  rentalId: string | null;
  rentCount: number;
  createdAt: string;
  adminCard?: { channelId: string; messageId: string } | null;
};

export type Rental = {
  id: string;
  itemId: string;
  itemTitle: string;
  userId: string;
  userName: string;
  discordId: string | null;
  from: string;
  until: string;
  paid: number;
  ticketsUsed: number;
  deposit: number;
  status: "active" | "returning" | "done";
  warned: boolean;
  returnedAt: string | null;
  depositBack: number | null;
  card?: { channelId: string; messageId: string } | null;
};

type Db = { items: RentalItem[]; rentals: Rental[]; tickets: Record<string, number> };
const key = (shopId: string) => `rental:v1:${shopId}`;
const rid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

export async function getRentalDb(shopId: string): Promise<Db> {
  const d = await kvGetJson<Db>(key(shopId));
  return { items: d?.items ?? [], rentals: d?.rentals ?? [], tickets: d?.tickets ?? {} };
}
async function mutate<T>(shopId: string, fn: (db: Db) => T | Promise<T>) {
  return withLock(key(shopId), async () => {
    const db = await getRentalDb(shopId);
    const out = await fn(db);
    // 끝난 대여는 최근 300건만
    const done = db.rentals.filter((r) => r.status === "done");
    if (done.length > 300) {
      const drop = new Set(done.slice(300).map((r) => r.id));
      db.rentals = db.rentals.filter((r) => !drop.has(r.id));
    }
    await kvPutJson(key(shopId), db);
    return out;
  });
}

export function rentalQuote(item: Pick<RentalItem, "dailyPrice" | "deposit">, days: number, tickets = 0) {
  const use = Math.min(Math.max(0, Math.floor(tickets)), days);
  const base = item.dailyPrice * days;
  const disc = Math.floor(base * (DISCOUNT[days] ?? 0));
  const fee = Math.max(0, Math.round(((base - disc) * (days - use)) / days));
  return { base, discount: disc, ticketsUsed: use, fee, deposit: item.deposit, total: fee + item.deposit };
}

/** 손님에게 보여줄 상품 (로그인 정보 빼고) */
export function publicItem(i: RentalItem, now = Date.now(), db?: Db) {
  const r = i.rentalId && db ? db.rentals.find((x) => x.id === i.rentalId) : null;
  return {
    id: i.id,
    title: i.title,
    description: i.description,
    capes: i.capes,
    dailyPrice: i.dailyPrice,
    deposit: i.deposit,
    status: i.status,
    rentCount: i.rentCount,
    availableAt: i.status === "rented" && r ? r.until : null,
    quotes: RENTAL_DAYS.map((d) => ({ days: d, ...rentalQuote(i, d) })),
    _now: now,
  };
}

export function itemCred(i: Pick<RentalItem, "credEnc">) {
  const t = i.credEnc ? decryptSecret(i.credEnc) : null;
  if (!t) return null;
  try {
    return JSON.parse(t) as { email: string; password: string; extra?: string };
  } catch {
    return null;
  }
}
const credEnc = (c: { email: string; password: string; extra?: string }) =>
  encryptSecret(JSON.stringify({ email: c.email.trim().slice(0, 120), password: c.password.slice(0, 200), extra: (c.extra ?? "").trim().slice(0, 500) }));

export function credText(c: { email: string; password: string; extra?: string } | null) {
  if (!c) return "로그인 정보가 아직 없어요. 관리자에게 문의해 주세요.";
  return [`이메일: ${c.email}`, `비밀번호: ${c.password}`, c.extra ? `추가 정보: ${c.extra}` : ""].filter(Boolean).join("\n");
}

/** 1줄 이메일 · 2줄 비밀번호 · 3줄~ 추가 정보 */
export function parseCredLines(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(이메일|email|아이디|id|비밀번호|비번|password|pw)\s*[:：]\s*/i, "").trim())
    .filter(Boolean);
  return lines.length >= 2 ? { email: lines[0]!, password: lines[1]!, extra: lines.slice(2).join("\n") } : null;
}

/* ───────── 관리자 ───────── */

export async function addRentalItem(shopId: string, input: { title: string; description: string; capes?: string[]; dailyPrice: number; deposit: number; cred: { email: string; password: string; extra?: string } | null }) {
  const title = input.title.trim().slice(0, 60);
  if (title.length < 2) throw new Error("제목을 2자 이상 적어 주세요.");
  if (!(input.dailyPrice >= 100 && input.dailyPrice <= 1_000_000)) throw new Error("하루 가격은 100 ~ 1,000,000원 사이로 적어 주세요.");
  if (!(input.deposit >= 0 && input.deposit <= 5_000_000)) throw new Error("보증금을 확인해 주세요.");
  return mutate(shopId, (db) => {
    const item: RentalItem = {
      id: rid("rt"),
      title,
      description: input.description.trim().slice(0, 800),
      capes: (input.capes ?? []).slice(0, 8),
      dailyPrice: Math.round(input.dailyPrice),
      deposit: Math.round(input.deposit),
      credEnc: input.cred ? credEnc(input.cred) : null,
      status: "available",
      rentalId: null,
      rentCount: 0,
      createdAt: new Date().toISOString(),
    };
    db.items.unshift(item);
    return item;
  });
}

export async function setItemCard(shopId: string, id: string, card: RentalItem["adminCard"]) {
  return mutate(shopId, (db) => {
    const i = db.items.find((x) => x.id === id);
    if (i) i.adminCard = card;
  });
}
export async function setRentalCard(shopId: string, id: string, card: Rental["card"]) {
  return mutate(shopId, (db) => {
    const r = db.rentals.find((x) => x.id === id);
    if (r) r.card = card;
  });
}

export async function toggleItemHidden(shopId: string, id: string) {
  return mutate(shopId, (db) => {
    const i = db.items.find((x) => x.id === id);
    if (!i) throw new Error("상품을 찾을 수 없어요.");
    if (i.status === "hidden") i.status = "available";
    else if (i.status === "available") i.status = "hidden";
    else throw new Error("대여 중인 상품은 숨길 수 없어요. 반납 뒤에 해 주세요.");
    return { ...i };
  });
}

export async function deleteItem(shopId: string, id: string) {
  return mutate(shopId, (db) => {
    const i = db.items.find((x) => x.id === id);
    if (!i) throw new Error("상품을 찾을 수 없어요.");
    if (i.status === "rented" || i.status === "returning") throw new Error("대여 중인 상품은 지울 수 없어요.");
    db.items = db.items.filter((x) => x.id !== id);
    return i;
  });
}

/** 관리자 — 반납 확인: 새 로그인 정보로 바꾸고 보증금 환불(차감 가능) */
export async function completeReturn(shopId: string, rentalId: string, opts: { cred: { email: string; password: string; extra?: string } | null; deduct: number }) {
  const { changeUserPoints, persistAsync } = await import("@/lib/store");
  const out = await mutate(shopId, (db) => {
    const r = db.rentals.find((x) => x.id === rentalId);
    if (!r || r.status === "done") throw new Error("이미 처리된 대여예요.");
    const i = db.items.find((x) => x.id === r.itemId);
    const deduct = Math.min(r.deposit, Math.max(0, Math.round(opts.deduct)));
    const back = r.deposit - deduct;
    if (back > 0) {
      const res = changeUserPoints(shopId, r.userId, back, "rental.deposit_back", { rentalId: r.id, item: r.itemTitle, deduct });
      if (!res.ok) throw new Error(res.error);
    }
    r.status = "done";
    r.returnedAt = new Date().toISOString();
    r.depositBack = back;
    if (i) {
      if (opts.cred) i.credEnc = credEnc(opts.cred);
      i.status = "available";
      i.rentalId = null;
    }
    return { r: { ...r }, back, deduct };
  });
  await persistAsync().catch(() => null);
  return out;
}

/* ───────── 손님 ───────── */

export async function myTickets(shopId: string, userId: string) {
  return (await getRentalDb(shopId)).tickets[userId] ?? 0;
}

/** 시즌패스 보상 — 렌탈 1일권 지급 */
export async function grantTickets(shopId: string, userId: string, n: number) {
  return mutate(shopId, (db) => {
    db.tickets[userId] = (db.tickets[userId] ?? 0) + Math.max(0, Math.floor(n));
    return db.tickets[userId];
  });
}

export async function rentItem(shopId: string, user: { id: string; name: string; discordId: string | null }, itemId: string, days: number, useTickets: boolean) {
  if (!RENTAL_DAYS.includes(days as RentalDays)) throw new Error("대여 기간을 골라 주세요.");
  const { changeUserPoints, persistAsync } = await import("@/lib/store");
  const out = await mutate(shopId, (db) => {
    const i = db.items.find((x) => x.id === itemId);
    if (!i || i.status === "hidden") throw new Error("없는 렌탈 상품이에요.");
    if (i.status !== "available") throw new Error("지금 다른 분이 빌리고 있어요.");
    if (!i.credEnc) throw new Error("아직 준비 중인 계정이에요. 잠시 뒤에 다시 시도해 주세요.");
    if (db.rentals.some((r) => r.userId === user.id && r.status === "active" && r.itemId === itemId)) throw new Error("이미 빌린 계정이에요.");
    const have = useTickets ? (db.tickets[user.id] ?? 0) : 0;
    const q = rentalQuote(i, days, have);
    if (q.total > 0) {
      const res = changeUserPoints(shopId, user.id, -q.total, "rental.rent", { item: i.title, days, fee: q.fee, deposit: q.deposit, tickets: q.ticketsUsed });
      if (!res.ok) throw new Error(res.error === "포인트가 부족해요." ? `포인트가 부족해요. ${q.total.toLocaleString("ko-KR")}P 필요` : res.error);
    }
    if (q.ticketsUsed) db.tickets[user.id] = have - q.ticketsUsed;
    const now = Date.now();
    const r: Rental = {
      id: rid("rn"),
      itemId: i.id,
      itemTitle: i.title,
      userId: user.id,
      userName: user.name.slice(0, 40),
      discordId: user.discordId,
      from: new Date(now).toISOString(),
      until: new Date(now + days * 86_400_000).toISOString(),
      paid: q.fee,
      ticketsUsed: q.ticketsUsed,
      deposit: q.deposit,
      status: "active",
      warned: false,
      returnedAt: null,
      depositBack: null,
    };
    db.rentals.unshift(r);
    i.status = "rented";
    i.rentalId = r.id;
    i.rentCount += 1;
    return { rental: r, quote: q, cred: itemCred(i) };
  });
  await persistAsync().catch(() => null);
  return out;
}

export async function extendRental(shopId: string, userId: string, rentalId: string, days: number) {
  if (!RENTAL_DAYS.includes(days as RentalDays)) throw new Error("연장 기간을 골라 주세요.");
  const { changeUserPoints, persistAsync } = await import("@/lib/store");
  const out = await mutate(shopId, (db) => {
    const r = db.rentals.find((x) => x.id === rentalId && x.userId === userId);
    if (!r || r.status !== "active") throw new Error("대여 중일 때만 연장할 수 있어요.");
    const i = db.items.find((x) => x.id === r.itemId);
    if (!i) throw new Error("상품을 찾을 수 없어요.");
    const q = rentalQuote({ dailyPrice: i.dailyPrice, deposit: 0 }, days);
    const res = changeUserPoints(shopId, userId, -q.fee, "rental.extend", { item: i.title, days, fee: q.fee });
    if (!res.ok) throw new Error(res.error === "포인트가 부족해요." ? `포인트가 부족해요. ${q.fee.toLocaleString("ko-KR")}P 필요` : res.error);
    r.until = new Date(Date.parse(r.until) + days * 86_400_000).toISOString();
    r.paid += q.fee;
    r.warned = false;
    return { rental: { ...r }, fee: q.fee };
  });
  await persistAsync().catch(() => null);
  return out;
}

/** 조기 반납 (남은 기간 환불 없음) → 반납 대기 */
export async function returnEarly(shopId: string, userId: string, rentalId: string) {
  const r = await mutate(shopId, (db) => {
    const r = db.rentals.find((x) => x.id === rentalId && x.userId === userId);
    if (!r || r.status !== "active") throw new Error("대여 중인 계정이 아니에요.");
    r.status = "returning";
    r.until = new Date().toISOString();
    const i = db.items.find((x) => x.id === r.itemId);
    if (i) i.status = "returning";
    return { ...r };
  });
  await notifyReturning(shopId, r, "early").catch(() => null);
  return r;
}

export async function myRentals(shopId: string, userId: string) {
  const db = await getRentalDb(shopId);
  return db.rentals
    .filter((r) => r.userId === userId)
    .slice(0, 20)
    .map((r) => {
      const i = db.items.find((x) => x.id === r.itemId);
      return { ...r, card: undefined, cred: r.status === "active" && i ? itemCred(i) : null, dailyPrice: i?.dailyPrice ?? 0 };
    });
}

/* ───────── 알림 · 크론 ───────── */

async function notifyReturning(shopId: string, r: Rental, why: "early" | "expired") {
  const { postReturnCard } = await import("@/lib/discord/rental");
  await postReturnCard(shopId, r, why).catch(() => null);
  if (r.discordId) {
    const { sendDiscordDm } = await import("@/lib/discord/dm");
    await sendDiscordDm(
      r.discordId,
      {
        content: [
          `**[DOES 렌탈] ${r.itemTitle} 대여가 끝났어요**`,
          why === "early" ? "조기 반납을 접수했어요." : "대여 기간이 끝났어요. 지금 바로 접속을 종료해 주세요.",
          `관리자가 계정을 확인하면 보증금 ${r.deposit.toLocaleString("ko-KR")}P를 돌려드려요.`,
        ].join("\n"),
      },
      shopId,
    ).catch(() => null);
  }
}

/** 크론 — 끝나기 1시간 전 알림 · 기간 끝난 대여를 반납 대기로 */
export async function runRentalSweep(shopId: string) {
  const now = Date.now();
  const db0 = await getRentalDb(shopId);
  if (!db0.rentals.some((r) => r.status === "active" && Date.parse(r.until) - now < 3_600_000)) return { warned: 0, expired: 0 };
  const { warn, expired } = await mutate(shopId, (db) => {
    const warn: Rental[] = [];
    const expired: Rental[] = [];
    for (const r of db.rentals) {
      if (r.status !== "active") continue;
      const left = Date.parse(r.until) - now;
      if (left <= 0) {
        r.status = "returning";
        const i = db.items.find((x) => x.id === r.itemId);
        if (i) i.status = "returning";
        expired.push({ ...r });
      } else if (left < 3_600_000 && !r.warned) {
        r.warned = true;
        warn.push({ ...r });
      }
    }
    return { warn, expired };
  });
  const { sendDiscordDm } = await import("@/lib/discord/dm");
  for (const r of warn) {
    if (!r.discordId) continue;
    await sendDiscordDm(
      r.discordId,
      { content: `**[DOES 렌탈] ${r.itemTitle} 대여가 1시간 안에 끝나요** (<t:${Math.floor(Date.parse(r.until) / 1000)}:R>)\n더 쓰려면 사이트나 디스코드 \`/렌탈\` → 내 대여에서 연장해 주세요.` },
      shopId,
    ).catch(() => null);
  }
  for (const r of expired) await notifyReturning(shopId, r, "expired").catch(() => null);
  return { warned: warn.length, expired: expired.length };
}
