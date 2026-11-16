/** 대리판매 — 클라이언트 · 서버 공용 (외부 의존 없음) */
import { MC_ACCOUNT_CATEGORIES, MC_RESALE_CATEGORY, type McAccountCategory } from "@/lib/mc-account";

export const RESALE_DEFAULT_FEE_PERCENT = 10;
/** 신청 폼의 보유 망토 선택지 (capes-data 의 type) */
export const RESALE_CAPE_CHOICES: { type: string; label: string }[] = [
  { type: "2011", label: "2011" },
  { type: "2012", label: "2012" },
  { type: "2013", label: "2013" },
  { type: "2015", label: "2015" },
  { type: "2016", label: "2016" },
  { type: "migrator_cape", label: "Migrator" },
  { type: "vanilla_cape", label: "Vanilla" },
  { type: "cherry", label: "Cherry" },
];
/** 신청 폼의 상품 유형 (대리판매 탭 안에서도 어떤 계정인지 표시) */
export const RESALE_TYPES = MC_ACCOUNT_CATEGORIES.filter((c) => c !== MC_RESALE_CATEGORY);

export type ResaleStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ResaleRequest = {
  id: string;
  shopId: string;
  userId: string;
  userName: string;
  discordId: string | null;
  accountType: McAccountCategory;
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
};

export function resalePayout(price: number, feePercent: number) {
  return Math.max(0, Math.floor(price * (1 - feePercent / 100)));
}
