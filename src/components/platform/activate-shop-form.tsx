"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, MessageCircle } from "lucide-react";
import { getRootDomain, isValidShopSlug, shopUrl } from "@/lib/domain";
import { fadeUp, scaleIn, vxTransition, vxTransitionFast } from "@/lib/motion";

type ActivateShopFormProps = {
  domainLabel?: string;
};

type FormState = {
  licenseKey: string;
  slug: string;
  name: string;
  ownerEmail: string;
  adminPassword: string;
  tagline: string;
};

type StepDef = {
  id: string;
  title: string;
  hint: string;
  field: keyof FormState;
  optional?: boolean;
  inputType?: "text" | "email" | "password";
  mono?: boolean;
  placeholder?: string;
};

type DoneState = {
  slug: string;
  name: string;
  url: string;
  adminUrl: string;
  discordSetupToken: string | null;
  discordBotInstallUrl: string | null;
  discordLinked: boolean;
  discordUser: string | null;
  discordError: string | null;
  pendingReview: boolean;
  moderationMessage: string | null;
};

const STEP_COUNT = 6;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function ActivateShopForm({ domainLabel }: ActivateShopFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const root = getRootDomain();
  const label = domainLabel ?? (root === "localhost" ? "localhost" : root);
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    licenseKey: params.get("key") ?? "",
    slug: "",
    name: "",
    ownerEmail: "",
    adminPassword: "",
    tagline: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "discord" | "done">("form");
  const [done, setDone] = useState<DoneState | null>(null);
  const [guildId, setGuildId] = useState("");
  const [discordUserId, setDiscordUserId] = useState("");
  const [discordBindLoading, setDiscordBindLoading] = useState(false);

  const steps = useMemo<StepDef[]>(
    () => [
      {
        id: "license",
        title: "라이선스를 입력해 주세요",
        hint: "무료로 시작하려면 FREE를 입력하세요. 비워두셔도 무료 플랜으로 시작해요.",
        field: "licenseKey",
        optional: true,
        inputType: "text",
        mono: true,
        placeholder: "FREE · VNDX-XXXX-XXXX-XXXX",
      },
      {
        id: "slug",
        title: "상점 주소는 어떻게 할까요?",
        hint: "영문 소문자, 숫자, 하이픈만 사용할 수 있어요.",
        field: "slug",
        inputType: "text",
        mono: true,
        placeholder: "my-shop",
      },
      {
        id: "name",
        title: "상호명이 어떻게 되나요?",
        hint: "고객에게 보여질 이름이에요. 다른 상점과 같은 상호명은 쓸 수 없어요.",
        field: "name",
        inputType: "text",
        placeholder: "내 상점",
      },
      {
        id: "tagline",
        title: "한 줄 소개를 적어 주세요",
        hint: "건너뛰어도 괜찮아요. 나중에 설정에서 바꿀 수 있어요.",
        field: "tagline",
        optional: true,
        inputType: "text",
        placeholder: "디지털 키를 판매하는 상점",
      },
      {
        id: "email",
        title: "대표 이메일을 알려주세요",
        hint: "관리자 계정과 알림에 사용돼요.",
        field: "ownerEmail",
        inputType: "email",
        placeholder: "you@email.com",
      },
      {
        id: "password",
        title: "관리자 비밀번호를 설정해 주세요",
        hint: "4자 이상 입력해 주세요.",
        field: "adminPassword",
        inputType: "password",
        placeholder: "비밀번호",
      },
    ],
    [],
  );

  const current = steps[step];

  const preview = useMemo(() => {
    const slug = form.slug.trim().toLowerCase() || "your-shop";
    return shopUrl(slug).replace(/^https?:\/\//, "");
  }, [form.slug]);

  const stepValid = useMemo(() => {
    const value = form[current.field].trim();
    switch (current.id) {
      case "license":
        return true;
      case "slug":
        return isValidShopSlug(value);
      case "name":
        return value.length >= 1;
      case "tagline":
        return true;
      case "email":
        return isValidEmail(value);
      case "password":
        return value.length >= 4;
      default:
        return false;
    }
  }, [current, form]);

  useEffect(() => {
    const discord = params.get("discord");
    const shop = params.get("shop");
    if (!discord || !shop) return;
    const admin = params.get("admin") || shopUrl(shop, "/admin/login");
    const store = params.get("store") || shopUrl(shop);
    setDone({
      slug: shop,
      name: shop,
      url: store,
      adminUrl: admin,
      discordSetupToken: null,
      discordBotInstallUrl: null,
      discordLinked: discord === "ok",
      discordUser: params.get("discord_user"),
      discordError: discord === "error" ? params.get("msg") : null,
      pendingReview: false,
      moderationMessage: null,
    });
    setPhase("done");
  }, [params]);

  useEffect(() => {
    if (phase === "form") inputRef.current?.focus();
  }, [step, phase]);

  function updateField(value: string) {
    const field = current.field;
    setForm((prev) => ({
      ...prev,
      [field]: field === "slug" ? value.toLowerCase() : value,
    }));
    setError(null);
  }

  function goBack() {
    if (step === 0) {
      router.push("/");
      return;
    }
    setError(null);
    setStep((s) => s - 1);
  }

  async function goNext() {
    if (!stepValid) {
      setError(getStepError(current.id));
      return;
    }

    if (step < STEP_COUNT - 1) {
      setError(null);
      setStep((s) => s + 1);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      const next: DoneState = {
        slug: data.shop.slug,
        name: data.shop.name,
        url: data.shop.url ?? shopUrl(data.shop.slug),
        adminUrl: data.shop.adminUrl ?? shopUrl(data.shop.slug, "/admin/login"),
        discordSetupToken: data.discordSetupToken ?? null,
        discordBotInstallUrl: data.discordBotInstallUrl ?? null,
        discordLinked: false,
        discordUser: null,
        discordError: null,
        pendingReview: Boolean(data.moderation?.pendingReview),
        moderationMessage: data.moderation?.message ?? null,
      };
      setDone(next);
      setPhase(next.discordSetupToken && next.discordBotInstallUrl ? "discord" : "done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  async function bindDiscord() {
    if (!done?.discordSetupToken) return;
    const g = guildId.trim();
    const u = discordUserId.trim();
    if (!/^\d{5,30}$/.test(g) || !/^\d{5,30}$/.test(u)) {
      setError("서버 ID와 Discord 사용자 ID는 숫자여야 해요.");
      return;
    }
    setDiscordBindLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/discord/oauth/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: done.discordSetupToken,
          guildId: g,
          discordUserId: u,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "연동 실패");
      setDone({
        ...done,
        discordLinked: true,
        discordUser: data.discordOwnerUsername ?? u,
        discordError: null,
      });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "연동 실패");
    } finally {
      setDiscordBindLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && stepValid && !loading) {
      e.preventDefault();
      void goNext();
    }
  }

  if (done && phase === "discord") {
    return (
      <motion.div
        className="toss-wizard-shell vx-page-enter"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={vxTransition}
      >
        <div className="toss-wizard text-center">
          <div className="toss-wizard-body flex w-full flex-col items-center">
            <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-[#5865F2]/20 text-[#8ea1ff]">
              <MessageCircle className="size-7" strokeWidth={2} />
            </div>
            <p className="text-sm text-neutral-500">거의 다 됐어요</p>
            <h2 className="mt-2 text-xl font-bold">Discord 계정·서버 연동</h2>
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-neutral-400">
              1) 봇을 내 서버에 초대 → 2) 서버 ID와 내 Discord 사용자 ID를 입력하세요. (Discord 설정 →
              고급 → 개발자 모드 ON 후, 서버/프로필 우클릭 → ID 복사)
            </p>

            <a
              href={done.discordBotInstallUrl!}
              target="_blank"
              rel="noreferrer"
              className="mt-5 w-full max-w-sm rounded-2xl bg-[#5865F2] px-5 py-3.5 text-center text-[15px] font-semibold text-white transition hover:bg-[#4752c4]"
            >
              1. 봇을 서버에 초대
            </a>

            <div className="mt-4 w-full max-w-sm space-y-3 text-left">
              <label className="block">
                <span className="mb-1.5 block text-xs text-neutral-500">서버(Guild) ID</span>
                <input
                  value={guildId}
                  onChange={(e) => {
                    setGuildId(e.target.value.trim());
                    setError(null);
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="예: 123456789012345678"
                  className="toss-wizard-input w-full font-mono text-[15px]"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-neutral-500">내 Discord 사용자 ID</span>
                <input
                  value={discordUserId}
                  onChange={(e) => {
                    setDiscordUserId(e.target.value.trim());
                    setError(null);
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="예: 987654321098765432"
                  className="toss-wizard-input w-full font-mono text-[15px]"
                />
              </label>
            </div>
            {error ? <p className="mt-3 text-sm text-amber-300">{error}</p> : null}
          </div>
          <div className="toss-wizard-footer flex flex-col gap-2">
            <button
              type="button"
              className="toss-wizard-next vx-btn-press bg-[#5865F2] text-white hover:bg-[#4752c4] disabled:opacity-50"
              disabled={discordBindLoading}
              onClick={() => void bindDiscord()}
            >
              {discordBindLoading ? "연동 중…" : "2. 계정·서버 연결 완료"}
            </button>
            <button
              type="button"
              className="rounded-2xl border border-white/12 px-5 py-3.5 text-[15px] font-semibold text-neutral-300 transition hover:bg-white/[0.04] hover:text-white"
              onClick={() => setPhase("done")}
            >
              나중에 하기
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (done && phase === "done") {
    return (
      <motion.div
        className="toss-wizard-shell vx-page-enter"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={vxTransition}
      >
        <div className="toss-wizard text-center">
          <motion.div
            className="toss-wizard-body flex flex-col items-center"
            {...scaleIn}
            transition={vxTransition}
          >
            <motion.div
              className="mb-5 flex size-14 items-center justify-center rounded-full bg-white text-black"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...vxTransition, delay: 0.08 }}
            >
              <Check className="size-7" strokeWidth={2} />
            </motion.div>
            <p className="text-sm text-neutral-500">
              {done.pendingReview ? "개설 · 검토 대기" : "개설 완료"}
            </p>
            <h2 className="mt-2 text-xl font-bold">{done.name}</h2>
            <p className="mt-2 font-mono text-sm text-neutral-500">
              {done.url.replace(/^https?:\/\//, "")}
            </p>
            {done.pendingReview ? (
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-amber-300">
                {done.moderationMessage ||
                  "상점명이 정책 검토 대상이에요. 관리자 승인 전까지 상점은 비공개(정지) 상태입니다."}
              </p>
            ) : null}
            {done.discordLinked ? (
              <p className="mt-3 text-sm text-emerald-400">
                Discord 계정{done.discordUser ? ` (${done.discordUser})` : ""}과 서버가 연동되었어요.
              </p>
            ) : null}
            {done.discordError ? (
              <p className="mt-3 text-sm text-amber-300">{done.discordError}</p>
            ) : null}
          </motion.div>
          <div className="toss-wizard-footer flex flex-col gap-2">
            <a href={done.adminUrl} className="toss-wizard-next vx-btn-press">
              관리자 로그인
            </a>
            <a
              href={done.url}
              className="rounded-2xl border border-white/12 px-5 py-3.5 text-center text-[15px] font-semibold text-neutral-300 transition hover:bg-white/[0.04] hover:text-white"
            >
              상점 열기
            </a>
          </div>
        </div>
      </motion.div>
    );
  }

  const progress = ((step + 1) / STEP_COUNT) * 100;

  return (
    <motion.div
      className="toss-wizard-shell vx-page-enter"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={vxTransition}
    >
      <div className="toss-wizard">
        <header className="toss-wizard-top">
          <button type="button" onClick={goBack} className="toss-wizard-back vx-btn-press" aria-label="이전">
            <ChevronLeft className="size-6" strokeWidth={1.75} />
          </button>
          <div className="toss-wizard-progress-track" aria-hidden>
            <motion.div
              className="toss-wizard-progress-fill"
              animate={{ width: `${progress}%` }}
              transition={vxTransitionFast}
            />
          </div>
          <span className="toss-wizard-step">
            {step + 1}/{STEP_COUNT}
          </span>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            className="toss-wizard-body"
            initial={fadeUp.initial}
            animate={fadeUp.animate}
            exit={fadeUp.exit}
            transition={vxTransition}
          >
            <h1 className="toss-wizard-title">{current.title}</h1>
            <p className="toss-wizard-hint">{current.hint}</p>

            {current.id === "license" ? (
              <p className="mt-3 text-sm text-neutral-500">
                라이선스가 없나요?{" "}
                <Link href="/purchase" className="text-neutral-400 underline-offset-2 hover:text-white hover:underline">
                  구매하기
                </Link>
              </p>
            ) : null}

            <div className="toss-wizard-input-wrap">
              <input
                ref={inputRef}
                type={current.inputType ?? "text"}
                value={form[current.field]}
                onChange={(e) => updateField(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={current.placeholder}
                className={`toss-wizard-input ${current.mono ? "font-mono" : ""}`}
                autoComplete={
                  current.id === "email" ? "email" : current.id === "password" ? "new-password" : "off"
                }
                spellCheck={false}
                enterKeyHint={step === STEP_COUNT - 1 ? "done" : "next"}
              />
            </div>

            {current.id === "slug" && form.slug.trim() ? (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 break-all font-mono text-sm text-neutral-500"
              >
                {preview}
              </motion.p>
            ) : null}

            <AnimatePresence>
              {error ? (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="toss-wizard-error"
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        <div className="toss-wizard-footer">
          <motion.button
            type="button"
            onClick={() => void goNext()}
            disabled={!stepValid || loading}
            className="toss-wizard-next vx-btn-press"
            whileTap={stepValid && !loading ? { scale: 0.98 } : undefined}
          >
            {loading ? "등록하는 중…" : step === STEP_COUNT - 1 ? "상점 개설하기" : "다음"}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function getStepError(stepId: string): string {
  switch (stepId) {
    case "slug":
      return "2자 이상, 영문 소문자·숫자·하이픈만 사용할 수 있어요.";
    case "name":
      return "상호명을 입력해 주세요.";
    case "email":
      return "올바른 이메일을 입력해 주세요.";
    case "password":
      return "비밀번호는 4자 이상이어야 해요.";
    default:
      return "입력값을 확인해 주세요.";
  }
}
