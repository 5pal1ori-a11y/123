import type { ChargeStatus, OrderStatus } from "@/lib/types";

export type UserOrder = {
  id: string;
  orderUuid: string;
  amount: number;
  status: OrderStatus;
  paymentMethod: string;
  dispensedCode: string | null;
  paidAt: string | null;
  createdAt: string;
  productName: string;
  canReview?: boolean;
};

export type UserCharge = {
  id: string;
  amount: number;
  status: ChargeStatus;
  reference: string;
  failReason?: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type UserTab =
  | "main"
  | "products"
  | "charge"
  | "history"
  | "account"
  | "leaderboard"
  | "attendance"
  | "reviews"
  | "island";
