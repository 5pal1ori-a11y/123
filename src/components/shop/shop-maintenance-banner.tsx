"use client";

import { AlertTriangle } from "lucide-react";

export function ShopMaintenanceBanner({
  message,
}: {
  message?: string | null;
}) {
  return (
    <div
      role="alert"
      className="border-b border-amber-500/30 bg-amber-500/15 px-4 py-3 text-center text-sm text-amber-100"
    >
      <p className="inline-flex items-center justify-center gap-2 font-medium">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {message?.trim() || "잠시 점검 중이에요. 곧 다시 열려요."}
      </p>
    </div>
  );
}
