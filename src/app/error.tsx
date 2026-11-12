"use client";

import { useEffect } from "react";

function redirectFromDigest(digest: string | undefined) {
  if (!digest?.startsWith("NEXT_REDIRECT")) return null;
  const parts = digest.split(";");
  return parts[2] ?? null;
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const redirectTo = redirectFromDigest(error.digest);

  useEffect(() => {
    if (redirectTo) window.location.replace(redirectTo);
  }, [redirectTo]);

  if (redirectTo) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black text-white">
        <p className="text-sm text-neutral-400">이동 중…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-black px-6 text-center text-white">
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-bold">페이지를 불러오지 못했어요</h1>
        <p className="text-sm text-neutral-400">잠시 후 다시 시도해 주세요.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
