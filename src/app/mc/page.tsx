import { NameMcHome } from "@/components/namemc/namemc-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "마크 닉네임 조회 · DOES", description: "마인크래프트 닉네임 · UUID로 스킨, 망토, 닉네임 이력, 하이픽셀 정보를 한 번에" };

export default function NameMcPage() {
  return <NameMcHome />;
}
