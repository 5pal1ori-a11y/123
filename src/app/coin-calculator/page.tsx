import { CoinCalculator } from "@/components/shop/coin-calculator";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return {
    title: "코인 계산기 · DOES",
    description: "실시간 시세로 코인대행 금액을 계산해요",
  };
}

export default function CoinCalculatorPage() {
  return <CoinCalculator />;
}
