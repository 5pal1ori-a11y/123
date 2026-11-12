"use client";

import { useEffect } from "react";

export function ClientRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-black text-white">
      <p className="text-sm text-neutral-400">이동 중…</p>
    </div>
  );
}
