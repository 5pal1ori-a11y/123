import { VerifyTurnstileGate } from "@/components/verify/verify-turnstile-gate";

export const dynamic = "force-dynamic";

export default async function VerifyCaptchaPage({
  searchParams,
}: {
  searchParams: Promise<{ guild?: string; state?: string }>;
}) {
  const sp = await searchParams;
  const guildId = sp.guild?.trim() || "";
  const state = sp.state?.trim() || "";
  if (!/^\d{5,30}$/.test(guildId) || !state) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#05070b] text-neutral-400">
        잘못된 요청입니다.
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#05070b] px-4">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
        <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/70">
          DOES Verify
        </p>
        <h1 className="mb-6 text-center text-xl font-semibold text-white">보안 확인</h1>
        <VerifyTurnstileGate guildId={guildId} state={state} />
      </div>
    </div>
  );
}
