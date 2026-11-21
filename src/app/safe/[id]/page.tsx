import { SafeTradeView } from "@/components/safe/safe-trade-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `안전거래 ${decodeURIComponent(id).toUpperCase()} · DOES`, description: "DOES 안전거래 — 결제한 돈은 DOES가 보관하고, 계정이 문제없을 때만 정산해요" };
}

export default async function SafeTradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SafeTradeView id={decodeURIComponent(id).toUpperCase()} />;
}
