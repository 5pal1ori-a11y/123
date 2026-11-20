/** 대리판매 — 클라이언트 · 서버 공용 (외부 의존 없음) */
import { CAPES } from "@/lib/capes-data";
import { MC_ACCOUNT_CATEGORIES, MC_RESALE_CATEGORY } from "@/lib/mc-account";

export const RESALE_DEFAULT_FEE_PERCENT = 10;
/** 신청 폼의 보유 망토 선택지 (capes-data 의 type) */
// 모든 망토 — 많이 찾는 마인콘 · 마이그레이터 등을 앞에 둔다
const CAPE_FIRST = ["2011", "2012", "2013", "2015", "2016", "migrator_cape", "vanilla_cape", "cherry"];
const CAPE_SHORT: Record<string, string> = { migrator_cape: "Migrator", vanilla_cape: "Vanilla", cherry: "Cherry" };
export const RESALE_CAPE_CHOICES: { type: string; label: string; hash: string }[] = [
  ...CAPE_FIRST.map((t) => CAPES.find((c) => c.type === t)).filter((c): c is (typeof CAPES)[number] => Boolean(c)),
  ...CAPES.filter((c) => !CAPE_FIRST.includes(c.type)),
].map((c) => ({ type: c.type, label: CAPE_SHORT[c.type] ?? (/^20\d\d$/.test(c.type) ? c.type : c.title), hash: c.hash }));
/** 신청 폼의 상품 유형 (대리판매 탭 안에서도 어떤 계정인지 표시) */
export const RESALE_TYPES: string[] = MC_ACCOUNT_CATEGORIES.filter((c) => c !== MC_RESALE_CATEGORY);

export type ResaleStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ResaleRequest = {
  id: string;
  shopId: string;
  userId: string;
  userName: string;
  discordId: string | null;
  accountType: string;
  ign: string;
  showName: boolean;
  capes: string[];
  description: string;
  /** 희망 판매 가격 (상점에 올라가는 가격) */
  price: number;
  feePercent: number;
  /** 판매되면 신청자에게 정산할 금액 */
  payout: number;
  status: ResaleStatus;
  createdAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  productId: string | null;
  /** 판매되면 정산받을 계좌 (디스코드 /프록시등록 신청 · 관리자만 봄) */
  payoutAccount?: string | null;
  /** 어디서 신청했는지 */
  source?: "web" | "discord";
  /** 판매 완료 시각 · 주문 */
  soldAt?: string | null;
  soldOrderUuid?: string | null;
  /** 도스마켓 — 판매자가 웹에서 낸 로그인 정보 (암호화 · 승인하면 지급 코드로 옮기고 지운다) */
  credEnc?: string | null;
  hasCred?: boolean;
  /** 정산 방법 — points: 보호 기간이 끝나면 자동 지급 / bank: 관리자가 계좌로 송금 */
  payoutMethod?: "points" | "bank";
  /** holding: 구매자 보호 중 · ready: 송금 대기 · held: 신고로 보류 · paid: 정산 완료 · refunded: 구매자 환불 */
  payoutState?: "holding" | "ready" | "held" | "paid" | "refunded" | null;
  holdUntil?: string | null;
  paidAt?: string | null;
  disputeReason?: string | null;
  payoutCard?: { channelId: string; messageId: string } | null;
};

/** 도스마켓 구매자 보호 — 팔린 뒤 이 시간 동안은 정산하지 않고 문제 신고를 받는다 */
export const DOSMARKET_HOLD_HOURS = 24;

export function resalePayout(price: number, feePercent: number) {
  return Math.max(0, Math.floor(price * (1 - feePercent / 100)));
}
