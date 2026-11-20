import { CoinTradeClient } from "@/components/shop/coin-trade-client";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return {
    title: "코인대행 · DOES",
    description: "포인트로 코인을 사서 내 지갑으로 받아요",
  };
}

export default function CoinTradePage() {
  return <CoinTradeClient />;
}
