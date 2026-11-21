import { BoardClient } from "@/components/board/board-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "DOES 거래소 전광판", description: "마인크래프트 계정 실시간 체결 · 오늘 거래액 · 시세 등락" };

export default function BoardPage() {
  return <BoardClient />;
}
