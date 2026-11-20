import { PassportSearch } from "@/components/passport/passport-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "계정 여권 진위 확인 · DOES", description: "DOES 계정 여권 번호로 진위와 계정 이력을 확인해요" };

export default function PassportIndexPage() {
  return <PassportSearch />;
}
