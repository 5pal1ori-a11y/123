import { NameMcProfile } from "@/components/namemc/namemc-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const n = decodeURIComponent(name);
  return { title: `${n} · 마크 닉네임 조회 · DOES`, description: `${n}의 마인크래프트 스킨 · 망토 · 닉네임 이력 · 하이픽셀 정보` };
}

export default async function NameMcProfilePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <NameMcProfile q={decodeURIComponent(name)} />;
}
