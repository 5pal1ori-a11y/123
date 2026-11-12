"use client";

import { ShieldOff } from "lucide-react";

export function ShopAccessBlocked({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0a0c] px-6 text-center text-white">
      <ShieldOff className="mb-4 size-10 text-amber-400" aria-hidden />
      <h1 className="text-xl font-semibold tracking-tight">접근이 제한되었어요</h1>
      <p className="mt-3 max-w-md text-sm text-neutral-400">{message}</p>
      <p className="mt-6 text-xs text-neutral-600">
        한국 IP · VPN/프록시 미사용 환경에서만 이용할 수 있도록 상점이 설정되어 있습니다.
      </p>
    </div>
  );
}
