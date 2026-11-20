import { PassportView } from "@/components/passport/passport-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return { title: `계정 여권 ${decodeURIComponent(no).toUpperCase()} · DOES`, description: "DOES 계정 여권 — 공개 정보로 확인한 계정 이력" };
}

export default async function PassportPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return <PassportView no={decodeURIComponent(no)} />;
}
