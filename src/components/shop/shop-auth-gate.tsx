"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useShopUser } from "@/components/shop/user-context";
import { UserAuthPanel } from "@/components/shop/user-auth-panel";
import { LoginRequiredNotice } from "@/components/shop/login-required-notice";
import { VendixLogo } from "@/components/ui/vendix-logo";
import type { SubscriptionStatus } from "@/lib/types";
import { formatPlanLabel } from "@/lib/plans";
import { formatDate } from "@/lib/utils";
import { guestAllowedPath, isGuestMode, isLandingPath, publicBrowsePath } from "@/lib/guest-mode";
import type { LicensePlan } from "@/lib/types";

export function ShopAuthGate({
  shopSlug,
  shopName,
  subscription,
  plan,
  expiresAt,
  graceUntil,
  children,
}: {
  shopSlug: string;
  shopName: string;
  subscription: SubscriptionStatus;
  plan: LicensePlan;
  expiresAt: string;
  graceUntil: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, loading } = useShopUser();
  const isAdminRoute = pathname?.includes("/admin");
  // 게스트 선택은 브라우저에만 저장돼 있어서 마운트 후에 읽는다 (서버 렌더와 어긋나지 않게)
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    setGuest(isGuestMode(shopSlug));
  }, [shopSlug]);

  if (isAdminRoute) {
    return <>{children}</>;
  }

  if (subscription === "expired") {
    return (
      <div className="auth-stage flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="auth-panel w-full max-w-md space-y-5 p-8 text-center">
          <VendixLogo size={48} priority className="mx-auto" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            구독이 만료되었습니다
          </h1>
          <p className="text-sm text-neutral-400">
            {shopName} ({formatPlanLabel(plan)}) 상점의 이용 기간이 끝났고, 7일 유예 기간도 지났어요.
          </p>
          <p className="text-xs text-neutral-500">
            관리자는{" "}
            <Link href="/admin" className="underline underline-offset-2">
              관리자 패널
            </Link>
            에서 새 라이선스 키로 연장할 수 있어요.
          </p>
          <Link href="/activate" className="auth-submit inline-flex w-full justify-center no-underline">
            상점 등록
          </Link>
        </div>
      </div>
    );
  }

  if (isLandingPath(pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f4f4f5]">
        <Loader2 className="size-7 animate-spin text-[#a1a1aa]" />
      </div>
    );
  }

  if (!user && ((guest && guestAllowedPath(pathname)) || publicBrowsePath(pathname))) {
    return <>{children}</>;
  }

  if (!user) {
    return (
      <div className="auth-stage relative min-h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain">
        <div className="auth-stage__glow" aria-hidden />
        <div className="auth-stage__grain" aria-hidden />

        <div className="relative mx-auto grid min-h-dvh w-full max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="relative hidden flex-col justify-center px-6 pb-8 pt-4 sm:px-10 lg:flex lg:px-14 lg:py-16"
          >
            <div>
              <VendixLogo size={36} priority />
              <p className="mt-6 font-[family-name:var(--font-jetbrains)] text-[10px] uppercase tracking-[0.28em] text-neutral-500 sm:mt-8">
                Digital shop
              </p>
              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.55 }}
                className="mt-2 max-w-md font-[family-name:var(--font-display)] text-[clamp(1.85rem,7vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:mt-3"
              >
                {shopName}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22, duration: 0.45 }}
                className="mt-3 hidden max-w-sm text-sm leading-relaxed text-neutral-400 sm:mt-4 sm:block"
              >
                구매·충전은 Discord 로그인이 필요해요. 로그인 없이 게스트로 상점을 둘러볼 수도 있어요.
              </motion.p>
              {subscription === "active" && (
                <p className="mt-2 font-[family-name:var(--font-jetbrains)] text-[11px] text-neutral-400 sm:mt-3">
                  {formatPlanLabel(plan)} · {new Date(expiresAt).getUTCFullYear() >= 9999 ? "만료 없음" : `~${formatDate(expiresAt)}`}
                </p>
              )}
            </div>
          </motion.aside>

          <div className="flex items-start px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pt-8 lg:items-center lg:px-10 lg:py-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.5 }}
              className="auth-panel mb-6 w-full max-w-md lg:mb-0 lg:ml-auto"
            >
              <div className="mb-5 flex items-center gap-2.5 lg:hidden">
                <VendixLogo size={28} priority />
                <p className="truncate font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-white">
                  {shopName}
                </p>
              </div>
              {subscription === "grace" && (
                <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-2.5 text-center text-xs text-amber-100/90">
                  유예 기간 · {formatDate(graceUntil)}까지 연장 시 부활
                </div>
              )}
              <LoginRequiredNotice className="mb-5 text-white" />
              <UserAuthPanel shopSlug={shopSlug} />
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {subscription === "grace" && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          구독 만료 · {formatDate(graceUntil)}까지 라이선스를 연장하면 상점이 다시 열려요.
        </div>
      )}
      {children}
    </>
  );
}
