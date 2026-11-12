"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { verifyEase } from "@/components/verify/verify-motion";

const ERRORS: Record<string, string> = {
  denied: "Discord 인증이 취소되었어요.",
  state: "인증 세션이 만료되었어요. 다시 시도해 주세요.",
  config: "인증봇 설정이 아직 완료되지 않았어요.",
  token: "토큰 교환에 실패했어요.",
  user: "계정 정보를 가져오지 못했어요.",
  email: "이메일 공개가 필요해요. Discord에서 이메일을 허용해 주세요.",
  join: "서버 참가(초대)에 실패했어요. 봇에 '초대 만들기' 권한이 있는지, 봇이 서버에 있는지 확인해 주세요.",
  role: "역할 부여에 실패했어요. 봇 역할이 대상 역할보다 위에 있는지 확인해 주세요.",
  disabled: "이 서버의 인증이 비활성화되어 있어요.",
  guild: "서버 정보가 올바르지 않아요.",
  vpn: "VPN 접속은 이 서버에서 허용되지 않아요.",
  proxy: "프록시·데이터센터 IP는 이 서버에서 허용되지 않아요.",
  mobile: "모바일 데이터 접속은 이 서버에서 허용되지 않아요.",
  foreign: "허용되지 않은 국가의 IP예요.",
  banned: "이 계정 또는 IP는 차단되어 있어요.",
  whitelist: "허용된 IP에서만 인증할 수 있어요.",
  age: "계정 생성 기간이 너무 짧아요.",
  cooldown: "재인증 대기 시간이 지나지 않았어요.",
  rate: "이 IP의 오늘 인증 한도를 초과했어요.",
  dupip: "동일 IP로 이미 다른 계정이 인증되어 있어요.",
  captcha: "보안 확인(캡차)에 실패했어요.",
  phone: "Discord 인증(전화/이메일 인증) 계정만 허용됩니다.",
};

export function VerifyDoneClient() {
  const sp = useSearchParams();
  const ok = sp.get("ok") === "1";
  const error = sp.get("error") || "";
  const user = sp.get("user") || "";
  const [phase, setPhase] = useState<"loading" | "done">(ok ? "loading" : "done");

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setPhase("done"), 1400);
    return () => clearTimeout(t);
  }, [ok]);

  const title = useMemo(() => {
    if (!ok) return "인증 실패";
    return phase === "loading" ? "인증중" : "인증완료!";
  }, [ok, phase]);

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#05060a] px-4">
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(52,211,153,0.12), transparent 60%)",
        }}
      />
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[28%] size-64 -translate-x-1/2 rounded-full border border-emerald-300/20"
        animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.12, 0.35] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[28%] size-96 -translate-x-1/2 rounded-full border border-white/5"
        animate={{ scale: [1, 1.08, 1], opacity: [0.2, 0.05, 0.2] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
      />

      <motion.div
        className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] p-10 text-center shadow-2xl backdrop-blur-xl"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: verifyEase }}
          >
            <div className="relative mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
              {ok && phase === "loading" ? (
                <motion.span
                  className="absolute inset-0 rounded-full border border-emerald-300/40"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                />
              ) : null}
              {!ok ? (
                <motion.span
                  initial={{ rotate: -20, scale: 0.6 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 14 }}
                >
                  <X className="size-7 text-rose-300" />
                </motion.span>
              ) : phase === "loading" ? (
                <Loader2 className="size-7 animate-spin text-white/80" />
              ) : (
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 16 }}
                >
                  <Check className="size-7 text-emerald-300" />
                </motion.span>
              )}
            </div>

            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500">
              MFA MARKET
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">{title}</h1>

            {ok ? (
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                {phase === "loading"
                  ? "Discord 계정과 서버 역할을 확인하고 있어요…"
                  : user
                    ? `${user} 님, 인증이 완료되었어요. Discord로 돌아가 역할을 확인해 주세요.`
                    : "인증이 완료되었어요. Discord로 돌아가 역할을 확인해 주세요."}
              </p>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                {ERRORS[error] || "알 수 없는 오류가 발생했어요."}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {ok && phase === "done" ? (
          <motion.div
            className="mt-8 h-1 overflow-hidden rounded-full bg-white/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="h-full rounded-full bg-emerald-400/80"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.8, ease: verifyEase }}
            />
          </motion.div>
        ) : null}
      </motion.div>
    </div>
  );
}
