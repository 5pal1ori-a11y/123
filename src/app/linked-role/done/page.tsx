import Link from "next/link";
import { PlatformHeader } from "@/components/layout/platform-header";
import { QuartzShell } from "@/components/ui/quartz-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Discord 연결 역할",
  description: "DOES Discord 연결 역할 인증 결과",
};

export default async function LinkedRoleDonePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = String(sp.ok ?? "") === "1";
  const error = typeof sp.error === "string" ? sp.error : "";
  const user = typeof sp.user === "string" ? sp.user : "";
  const linked = String(sp.linked ?? "") === "1";

  const errorMessage: Record<string, string> = {
    denied: "Discord 인증이 취소되었어요.",
    state: "인증 세션이 만료되었거나 유효하지 않아요. 다시 시도해 주세요.",
    config: "Discord 앱 설정이 아직 완료되지 않았어요.",
    token: "Discord 토큰 교환에 실패했어요.",
    user: "Discord 계정 정보를 가져오지 못했어요.",
    push: "연결 역할 메타데이터 등록에 실패했어요.",
  };

  return (
    <QuartzShell>
      <div className="flex min-h-dvh flex-col">
        <PlatformHeader />
        <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-20">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
            {ok ? (
              <>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400/80">
                  Linked Role
                </p>
                <h1 className="mt-3 text-2xl font-extrabold text-white">인증 완료</h1>
                <p className="mt-3 text-sm leading-6 text-neutral-400">
                  {user ? (
                    <>
                      <span className="text-neutral-200">{user}</span> 계정으로 DOES 연결
                      역할 인증이 완료되었어요.
                    </>
                  ) : (
                    "DOES 연결 역할 인증이 완료되었어요."
                  )}
                  {linked
                    ? " 상점 계정 연동도 확인되었습니다."
                    : " 상점 계정은 아직 연동되지 않았어요. `/연동` 후 다시 인증하면 연동 조건 역할에 맞출 수 있어요."}
                </p>
                <p className="mt-4 text-sm text-neutral-500">
                  Discord로 돌아가 역할이 부여되었는지 확인해 주세요.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-rose-400/80">
                  Linked Role
                </p>
                <h1 className="mt-3 text-2xl font-extrabold text-white">인증 실패</h1>
                <p className="mt-3 text-sm leading-6 text-neutral-400">
                  {errorMessage[error] || "알 수 없는 오류가 발생했어요."}
                </p>
                <Link
                  href="/linked-role"
                  className="mt-6 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-200"
                >
                  다시 시도
                </Link>
              </>
            )}
            <div className="mt-8 flex justify-center gap-4 text-sm text-neutral-500">
              <Link href="/" className="hover:text-neutral-300">
                홈
              </Link>
              <Link href="/terms" className="hover:text-neutral-300">
                이용약관
              </Link>
              <Link href="/privacy" className="hover:text-neutral-300">
                개인정보
              </Link>
            </div>
          </div>
        </main>
      </div>
    </QuartzShell>
  );
}
