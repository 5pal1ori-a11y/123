import { redirect } from "next/navigation";

export const metadata = { title: "상점 등록" };

/**
 * 상점 개설은 Discord 로그인 → 소유 서버 선택만 허용.
 * 라이선스 키(?key=)는 /admin/discord 로 넘긴다.
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = new URLSearchParams();
  const key = params.key;
  if (typeof key === "string" && key.trim()) q.set("key", key.trim());
  const intent = params.intent;
  if (typeof intent === "string" && intent.trim()) q.set("intent", intent.trim());
  const qs = q.toString();
  redirect(qs ? `/admin/discord?${qs}` : "/admin/discord");
}
