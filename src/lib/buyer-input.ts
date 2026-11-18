/**
 * 구매할 때 손님에게 받는 추가 정보 (예: 서버부스트 → 서버 초대 링크, 유튜브 프리미엄 → 받을 이메일).
 * 상품마다 관리자가 켜고, 받은 값은 주문에 저장해 관리자 주문 화면 · 디스코드 관리자 로그에 보여 준다.
 */
import type { Product } from "@/lib/types";

export type BuyerInputKind = "url" | "email" | "text";
export type BuyerInputSpec = { kind: BuyerInputKind; label: string };

export const BUYER_INPUT_PRESETS: { id: string; label: string; spec: BuyerInputSpec | null }[] = [
  { id: "none", label: "받지 않음", spec: null },
  { id: "invite", label: "디스코드 서버 초대 링크 (서버부스트)", spec: { kind: "url", label: "부스트 받을 서버 초대 링크" } },
  { id: "email", label: "이메일 주소 (유튜브 프리미엄 등)", spec: { kind: "email", label: "프리미엄 받을 이메일 주소" } },
  { id: "text", label: "직접 입력 (자유 글)", spec: { kind: "text", label: "요청 사항" } },
];

export function placeholderFor(spec: BuyerInputSpec) {
  if (spec.kind === "url") return "https://discord.gg/xxxxxxx";
  if (spec.kind === "email") return "example@gmail.com";
  return "내용을 적어 주세요";
}

/** 손님이 넣은 값 확인 — 맞으면 다듬은 값, 아니면 오류 문구 */
export function checkBuyerInput(
  product: Pick<Product, "buyerInput" | "name">,
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const spec = product.buyerInput;
  if (!spec) return { ok: true, value: null };
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { ok: false, error: `「${product.name}」 구매에는 ${spec.label}이(가) 필요해요. 상품 페이지의 구매하기에서 적어 주세요.` };
  if (v.length > 300) return { ok: false, error: `${spec.label}이(가) 너무 길어요.` };
  if (spec.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
    return { ok: false, error: "이메일 주소 형식을 확인해 주세요." };
  }
  if (spec.kind === "url") {
    const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    if (!/^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[A-Za-z0-9-]{2,}/i.test(url)) {
      return { ok: false, error: "디스코드 서버 초대 링크(discord.gg/…)를 넣어 주세요." };
    }
    return { ok: true, value: url };
  }
  return { ok: true, value: v };
}
