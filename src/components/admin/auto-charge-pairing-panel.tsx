"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radio, Zap } from "lucide-react";
import { getAutoChargeBank } from "@/lib/auto-charge-banks";
import {
  BANK_PUSH_SAMPLES,
  defaultPackageForBank,
  parseBankPush,
} from "@/lib/auto-charge-push-parse";
import { fadeUp, vxTransition } from "@/lib/motion";

type AutoChargePairingPanelProps = {
  shopSlug: string;
  bankName: string;
  pushbulletToken: string;
  pushbulletSaved?: boolean;
  pushbulletHint?: string | null;
  pushbulletWrongKind?: boolean;
  autoChargeEnabled: boolean;
  onPushbulletTokenChange: (token: string) => void;
  onAutoChargeEnabledChange: (enabled: boolean) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
};

export function AutoChargePairingPanel({
  shopSlug,
  bankName,
  pushbulletToken,
  pushbulletSaved = false,
  pushbulletHint = null,
  pushbulletWrongKind = false,
  autoChargeEnabled,
  onPushbulletTokenChange,
  onAutoChargeEnabledChange,
  onSave,
  saving,
}: AutoChargePairingPanelProps) {
  const [samplePush, setSamplePush] = useState({
    title: "입금 10,000원",
    body: "홍길동",
    package_name: "com.kakaobank.channel",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const bank = getAutoChargeBank(bankName);
  const apiUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/charges/auto`
      : `/api/charges/auto`;

  const parsedPush = parseBankPush(samplePush);
  const parsedAmount = parsedPush?.amount ?? null;
  const parsedName = parsedPush?.depositorName ?? null;
  const tokenReady =
    pushbulletToken.trim().length >= 8 || (pushbulletSaved && !pushbulletWrongKind);
  const active = autoChargeEnabled && tokenReady;

  async function runTest() {
    const token = pushbulletToken.trim();
    if (token.length < 8) {
      setTestResult("테스트를 위해 Pushbullet 토큰을 다시 입력해 주세요.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-orel-shop": shopSlug,
        },
        body: JSON.stringify({
          push: samplePush,
          pushbulletToken: token,
        }),
      });
      const json = (await res.json()) as {
        matched?: boolean;
        ok?: boolean;
        error?: string;
      };
      if (res.ok && (json.matched || json.ok)) {
        setTestResult("매칭 성공 · 충전이 승인됐어요.");
      } else if (res.status === 404) {
        setTestResult(json.error ?? "대기 중인 충전과 맞지 않아요.");
      } else {
        setTestResult(json.error ?? `요청 실패 (${res.status})`);
      }
    } catch {
      setTestResult("네트워크 오류");
    } finally {
      setTesting(false);
    }
  }

  return (
    <motion.div
      className="space-y-5"
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      transition={vxTransition}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
          <Zap className="size-5" />
        </span>
        <div>
          <h3 className="toss-admin-title text-lg">계좌 자동충전 (AOS)</h3>
          <p className="toss-admin-hint text-xs">
            {bank ? `${bank.name} · ` : ""}
            Pushbullet으로 입금 알림이 오면 대기 충전을 자동 승인합니다
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-500">
            Pushbullet Access Token
            <span className="ml-1 font-normal text-neutral-600">(비우면 수동 승인)</span>
          </span>
          <input
            type="text"
            value={pushbulletToken}
            onChange={(e) => onPushbulletTokenChange(e.target.value)}
            placeholder={
              pushbulletSaved && pushbulletHint
                ? `저장됨 · 끝자리 ${pushbulletHint} · 바꿀 때만 입력`
                : "Pushbullet Access Token (o. 으로 시작)"
            }
            className="toss-admin-field font-mono text-xs"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="vendix-pushbullet-access-token"
            data-1p-ignore="true"
            data-lpignore="true"
          />
          {pushbulletWrongKind ? (
            <p className="text-[11px] text-amber-300/95">
              저장된 값이 Pushbullet 토큰이 아닌 것 같아요. Access Token(o. …)을 다시 넣어
              주세요.
            </p>
          ) : (
            <p className="text-[11px] text-neutral-600">
              Pushbullet 앱 → Settings → Access Tokens
              {pushbulletSaved && pushbulletHint ? ` · 현재 끝자리 ${pushbulletHint}` : ""}
            </p>
          )}
        </label>

        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Radio className="size-4 text-emerald-400/80" />
            <div>
              <p className="text-sm font-medium text-white">자동충전</p>
              <p className="text-xs text-neutral-500">켜면 입금 시 바로 반영</p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving || !tokenReady}
            onClick={() => onAutoChargeEnabledChange(!autoChargeEnabled)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${
              autoChargeEnabled && tokenReady ? "bg-emerald-500" : "bg-neutral-700"
            } disabled:opacity-40`}
            aria-pressed={autoChargeEnabled}
          >
            <span
              className={`absolute top-1 size-6 rounded-full bg-white shadow transition ${
                autoChargeEnabled && tokenReady ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>

        <motion.button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || !tokenReady}
          className="toss-admin-primary vx-btn-press w-full disabled:opacity-35"
          whileTap={{ scale: 0.98 }}
        >
          {saving ? "저장 중…" : "저장"}
        </motion.button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <StatusChip label="상태" value={active ? "켜짐" : "꺼짐"} ok={active} />
        <StatusChip label="인증" value={tokenReady ? "토큰 준비됨" : "토큰 필요"} ok={tokenReady} />
      </div>

      {tokenReady ? (
        <div className="toss-admin-test">
          <p className="toss-admin-test-label">입금 알림 테스트</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 sm:col-span-3">
              <span className="text-xs text-neutral-500">알림 제목</span>
              <input
                value={samplePush.title}
                onChange={(e) => setSamplePush((p) => ({ ...p, title: e.target.value }))}
                className="toss-admin-field text-sm"
              />
            </label>
            <label className="block space-y-1 sm:col-span-3">
              <span className="text-xs text-neutral-500">알림 내용</span>
              <input
                value={samplePush.body}
                onChange={(e) => setSamplePush((p) => ({ ...p, body: e.target.value }))}
                className="toss-admin-field text-sm"
              />
            </label>
            <label className="block space-y-1 sm:col-span-3">
              <span className="text-xs text-neutral-500">앱 패키지명</span>
              <input
                value={samplePush.package_name}
                onChange={(e) => setSamplePush((p) => ({ ...p, package_name: e.target.value }))}
                className="toss-admin-field font-mono text-xs"
              />
            </label>
          </div>
          <p className="toss-admin-test-meta">
            {parsedAmount || parsedName
              ? [
                  parsedAmount ? `금액 ${parsedAmount.toLocaleString("ko-KR")}원` : "금액 미확인",
                  parsedName ? `입금자 ${parsedName}` : "입금자명 미확인",
                ].join(" · ")
              : "은행 입금 알림처럼 입력해 보세요"}
          </p>
          {bank && BANK_PUSH_SAMPLES[bank.name] ? (
            <button
              type="button"
              className="toss-admin-ghost mt-2 text-xs"
              onClick={() => {
                const sample = BANK_PUSH_SAMPLES[bank.name]!;
                setSamplePush({
                  title: sample.title,
                  body: sample.body,
                  package_name: sample.package_name || defaultPackageForBank(bank.name),
                });
              }}
            >
              {bank.name} 샘플 넣기
            </button>
          ) : null}
          <motion.button
            type="button"
            onClick={() => void runTest()}
            disabled={testing || !autoChargeEnabled || !tokenReady}
            className="toss-admin-primary vx-btn-press disabled:opacity-35"
            whileTap={!testing ? { scale: 0.98 } : undefined}
          >
            {testing ? "테스트 중…" : "테스트 실행"}
          </motion.button>
          <AnimatePresence>
            {testResult ? (
              <motion.p
                className="toss-admin-test-result"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {testResult}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </motion.div>
  );
}

function StatusChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${ok ? "text-emerald-300" : "text-neutral-300"}`}>
        {value}
      </p>
    </div>
  );
}
