import type { ChargeMethod } from "@/lib/types";

const BANK_KEYWORDS = ["입금", "송금", "이체"] as const;

const CULTURE_GIFT_KEYWORDS = [
  "문화상품권",
  "컬쳐랜드",
  "컬처랜드",
  "cultureland",
  "culture",
  "문화",
  "기프트카드",
  "상품권",
] as const;

const COIN_KEYWORDS = [
  "코인",
  "업비트",
  "upbit",
  "빗썸",
  "bithumb",
  "바이낸스",
  "binance",
  "코인원",
  "coinone",
  "crypto",
  "deposit",
  "입금완료",
  "원화 입금",
  "krw",
] as const;

const AMOUNT_KRW_RE = /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:원|KRW|krw)/i;
const AMOUNT_COIN_KRW_RE = /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:원화|원)/i;

export function detectChargeMethod(text: string): ChargeMethod | null {
  const upper = text.toUpperCase();
  if (CULTURE_GIFT_KEYWORDS.some((kw) => upper.includes(kw.toUpperCase()))) return "culture_gift";
  if (COIN_KEYWORDS.some((kw) => upper.includes(kw.toUpperCase()))) return "coin";
  if (BANK_KEYWORDS.some((kw) => text.includes(kw))) return "bank";
  return null;
}

export function isAutoChargeNotification(
  text: string,
  opts: { bank?: boolean; cultureGift?: boolean; coin?: boolean },
) {
  const method = detectChargeMethod(text);
  if (!method) return false;
  if (method === "bank") return opts.bank !== false;
  if (method === "culture_gift") return opts.cultureGift !== false;
  if (method === "coin") return opts.coin !== false;
  return false;
}

/** 입금·충전 알림 본문에서 금액(원) 추출 */
export function parseAutoChargeAmount(text: string): number | null {
  const krw = text.match(AMOUNT_KRW_RE);
  if (krw?.[1]) {
    const n = Number(krw[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  const coinKrw = text.match(AMOUNT_COIN_KRW_RE);
  if (coinKrw?.[1]) {
    const n = Number(coinKrw[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export const CHARGE_METHOD_LABELS: Record<ChargeMethod, string> = {
  bank: "계좌이체",
  culture_gift: "문화상품권",
  coin: "코인",
};
