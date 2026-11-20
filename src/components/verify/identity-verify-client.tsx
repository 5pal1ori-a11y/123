"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

/* 토스 본인인증 SDK (v2) — CDN 로드. window.TossPayments 로 노출된다. */
const TOSS_SDK_SRC = "https://js.tosspayments.com/v2/standard";

type Status = {
  required: boolean;
  verified: boolean;
  configured: boolean;
  clientKey: string | null;
  name: string | null;
  verifiedAt: string | null;
};

type Phase = "loading" | "idle" | "running" | "confirming" | "done" | "error";

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      identity: (opts: { customerKey: string }) => {
        requestIdentityVerification: (opts: {
          redirectUrl?: string;
          successUrl?: string;
          failUrl?: string;
        }) => Promise<{ identityVerificationId?: string } | void>;
      };
    };
  }
}

function loadTossSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.TossPayments) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TOSS_SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("토스 SDK 로드 실패")));
      return;
    }
    const s = document.createElement("script");
    s.src = TOSS_SDK_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("토스 SDK 로드 실패"));
    document.head.appendChild(s);
  });
}

export function IdentityVerifyClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const confirming = useRef(false);

  const confirm = useCallback(async (verificationId: string) => {
    if (confirming.current) return;
    confirming.current = true;
    setPhase("confirming");
    try {
      const res = await fetch("/api/identity-verify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ verificationId }),
      });
      const data = (await res.json().catch(() => null)) as { verified?: boolean; name?: string; duplicate?: boolean; error?: string } | null;
      if (!res.ok || !data?.verified) {
        setPhase("error");
        setMessage(data?.error || "인증 확인에 실패했어요. 다시 시도해 주세요.");
        return;
      }
      setPhase("done");
      setMessage(data.duplicate ? "인증 완료! (참고: 같은 명의로 가입된 다른 계정이 있어요)" : "본인인증이 완료됐어요.");
    } catch {
      setPhase("error");
      setMessage("네트워크 오류로 확인하지 못했어요.");
    } finally {
      confirming.current = false;
    }
  }, []);

  // 상태 조회 + 리다이렉트 복귀 처리
  useEffect(() => {
    (async () => {
      // 토스 팝업이 ?identityVerificationId=... 로 돌아온 경우 바로 확정
      const params = new URLSearchParams(window.location.search);
      const returned = params.get("identityVerificationId");
      try {
        const res = await fetch("/api/identity-verify/status", { credentials: "include" });
        if (res.status === 401) {
          setPhase("error");
          setMessage("먼저 사이트에 로그인해 주세요.");
          return;
        }
        const data = (await res.json()) as Status;
        setStatus(data);
        if (data.verified) {
          setPhase("done");
          setMessage("이미 본인인증이 완료된 계정이에요.");
          return;
        }
        if (returned) {
          // URL 정리 후 확정
          window.history.replaceState(null, "", window.location.pathname);
          await confirm(returned);
          return;
        }
        setPhase("idle");
      } catch {
        setPhase("error");
        setMessage("상태를 불러오지 못했어요.");
      }
    })();
  }, [confirm]);

  const start = useCallback(async () => {
    if (!status?.clientKey) {
      setPhase("error");
      setMessage("본인인증이 아직 설정되지 않았어요. 관리자에게 문의해 주세요.");
      return;
    }
    setPhase("running");
    setMessage("");
    try {
      await loadTossSdk();
      const toss = window.TossPayments?.(status.clientKey);
      if (!toss) throw new Error("토스 SDK 초기화 실패");
      // customerKey: 계정마다 고유해야 함 (추적 불가능한 랜덤값 권장)
      const customerKey = `cust_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const identity = toss.identity({ customerKey });
      // 인증 후 이 페이지로 돌아온다 (?identityVerificationId=...)
      const redirectUrl = `${window.location.origin}${window.location.pathname}`;
      const result = await identity.requestIdentityVerification({ redirectUrl, successUrl: redirectUrl, failUrl: redirectUrl });
      // 리다이렉트 없이 promise 로 바로 결과가 오는 경우
      const id = result && typeof result === "object" ? result.identityVerificationId : undefined;
      if (id) await confirm(id);
    } catch (e) {
      // 사용자가 팝업을 닫으면 여기로 올 수 있음
      setPhase("idle");
      const msg = e instanceof Error ? e.message : "";
      if (msg && !/cancel|close|사용자/i.test(msg)) setMessage(msg);
    }
  }, [status, confirm]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">
          {phase === "done" ? <ShieldCheck className="size-8" /> : phase === "error" ? <ShieldAlert className="size-8" /> : <BadgeCheck className="size-8" />}
        </div>
        <h1 className="text-xl font-bold text-white">본인인증</h1>
        <p className="text-sm text-slate-400">
          안전한 거래를 위해 토스로 본인확인을 진행해요.
          <br />
          토스 공식 인증 창에서 직접 진행되며, 정보는 안전하게 처리됩니다.
        </p>
      </div>

      {phase === "loading" && (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </div>
      )}

      {phase === "done" && (
        <div className="w-full rounded-2xl bg-emerald-500/10 p-5 text-center text-sm text-emerald-200 ring-1 ring-emerald-400/30">
          <ShieldCheck className="mx-auto mb-2 size-6" />
          {message || "본인인증이 완료됐어요."}
          {status?.name ? <div className="mt-1 text-emerald-300/80">{status.name} 님</div> : null}
        </div>
      )}

      {(phase === "idle" || phase === "running" || phase === "confirming") && (
        <button
          onClick={start}
          disabled={phase !== "idle"}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-6 py-4 font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
        >
          {phase === "idle" ? (
            <>토스로 본인인증 시작</>
          ) : (
            <>
              <Loader2 className="size-4 animate-spin" /> {phase === "confirming" ? "확인 중…" : "인증 창 여는 중…"}
            </>
          )}
        </button>
      )}

      {phase === "error" && (
        <div className="w-full rounded-2xl bg-rose-500/10 p-4 text-center text-sm text-rose-200 ring-1 ring-rose-400/30">
          {message || "오류가 발생했어요."}
        </div>
      )}

      {message && phase !== "error" && phase !== "done" ? <p className="text-center text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
