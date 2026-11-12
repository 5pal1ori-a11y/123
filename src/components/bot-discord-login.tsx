"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { fadeUp, scaleIn, stagger, verifyEase } from "@/components/verify/verify-motion";

type GuildRow = {
  guildId: string;
  guildName: string;
  icon: string | null;
};

type Product = "security" | "ticket" | "verify" | "manage";

const ACCENT: Record<
  Product,
  {
    glow: string;
    glow2: string;
    iconBg: string;
    iconText: string;
    btn: string;
    label: string;
    title: string;
    hint: string;
    accentSoft: string;
    accentBorder: string;
    inviteSoft: string;
    inviteBorder: string;
    inviteBtn: string;
    ring: string;
  }
> = {
  security: {
    glow: "bg-rose-400/30",
    glow2: "bg-orange-500/15",
    iconBg: "bg-rose-400/15 text-rose-200",
    iconText: "text-rose-300/90",
    btn: "bg-rose-400 text-[#1a0508] hover:bg-rose-300",
    label: "DOES Security",
    title: "보안봇 웹패널",
    hint: "소유·관리 중인 Discord 서버를 고르세요.",
    accentSoft: "from-emerald-500/14 via-emerald-500/[0.05] to-transparent",
    accentBorder: "border-emerald-400/30",
    inviteSoft: "from-rose-500/14 via-rose-500/[0.05] to-transparent",
    inviteBorder: "border-rose-400/30",
    inviteBtn: "bg-rose-400 text-[#1a0508]",
    ring: "ring-rose-400/25",
  },
  ticket: {
    glow: "bg-sky-400/30",
    glow2: "bg-cyan-500/15",
    iconBg: "bg-sky-400/15 text-sky-200",
    iconText: "text-sky-300/90",
    btn: "bg-sky-400 text-[#061018] hover:bg-sky-300",
    label: "DOES Ticket",
    title: "티켓봇 웹패널",
    hint: "소유·관리 중인 Discord 서버를 고르세요.",
    accentSoft: "from-emerald-500/14 via-emerald-500/[0.05] to-transparent",
    accentBorder: "border-emerald-400/30",
    inviteSoft: "from-sky-500/14 via-sky-500/[0.05] to-transparent",
    inviteBorder: "border-sky-400/30",
    inviteBtn: "bg-sky-400 text-[#061018]",
    ring: "ring-sky-400/25",
  },
  verify: {
    glow: "bg-emerald-400/30",
    glow2: "bg-teal-500/15",
    iconBg: "bg-emerald-400/15 text-emerald-200",
    iconText: "text-emerald-300/90",
    btn: "bg-emerald-400 text-[#06140e] hover:bg-emerald-300",
    label: "DOES Verify",
    title: "인증봇 웹패널",
    hint: "소유·관리 중인 Discord 서버를 고르세요.",
    accentSoft: "from-emerald-500/16 via-emerald-500/[0.06] to-transparent",
    accentBorder: "border-emerald-400/35",
    inviteSoft: "from-teal-500/14 via-teal-500/[0.05] to-transparent",
    inviteBorder: "border-teal-400/30",
    inviteBtn: "bg-teal-300 text-[#06140e]",
    ring: "ring-emerald-400/25",
  },
  manage: {
    glow: "bg-emerald-400/30",
    glow2: "bg-lime-500/15",
    iconBg: "bg-emerald-400/15 text-emerald-200",
    iconText: "text-emerald-300/90",
    btn: "bg-emerald-400 text-[#06140e] hover:bg-emerald-300",
    label: "DOES Manage",
    title: "관리봇 웹패널",
    hint: "소유·관리 중인 Discord 서버를 고르세요.",
    accentSoft: "from-emerald-500/16 via-emerald-500/[0.06] to-transparent",
    accentBorder: "border-emerald-400/35",
    inviteSoft: "from-lime-500/14 via-lime-500/[0.05] to-transparent",
    inviteBorder: "border-lime-400/30",
    inviteBtn: "bg-lime-300 text-[#06140e]",
    ring: "ring-emerald-400/25",
  },
};

function discordIconUrl(guildId: string, icon: string | null) {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=64`;
}

function GuildCard({
  g,
  busy,
  kind,
  inviteBtn,
  index,
  onClick,
}: {
  g: GuildRow;
  busy: boolean;
  kind: "registered" | "invite";
  inviteBtn: string;
  index: number;
  onClick: () => void;
}) {
  const iconUrl = discordIconUrl(g.guildId, g.icon);
  const isReg = kind === "registered";

  return (
    <motion.button
      type="button"
      disabled={busy}
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.35, ease: verifyEase }}
      whileHover={busy ? undefined : { y: -3, scale: 1.01 }}
      whileTap={busy ? undefined : { scale: 0.985 }}
      className={`group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border px-3.5 py-3.5 text-left transition disabled:opacity-50 ${
        isReg
          ? "border-emerald-400/25 bg-emerald-500/[0.08] hover:border-emerald-300/45 hover:bg-emerald-500/[0.14]"
          : "border-white/12 bg-white/[0.04] hover:border-white/28 hover:bg-white/[0.07]"
      }`}
    >
      <motion.span
        className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(600px circle at var(--x,50%) var(--y,50%), rgba(255,255,255,0.06), transparent 40%)",
        }}
      />
      <span className="relative shrink-0">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className="size-11 rounded-2xl shadow-lg shadow-black/35" />
        ) : (
          <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-white/18 to-white/5 text-base font-bold text-[var(--ad-text)]">
            {g.guildName.slice(0, 1)}
          </span>
        )}
        <motion.span
          className={`absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full shadow-md ${
            isReg ? "bg-emerald-400 text-[#04140c]" : "bg-white text-[#0a0a0c]"
          }`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.08 * index }}
        >
          {isReg ? (
            <CheckCircle2 className="size-3" strokeWidth={2.6} />
          ) : (
            <Plus className="size-3" strokeWidth={2.6} />
          )}
        </motion.span>
      </span>

      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-tight text-[var(--ad-text)]">
          {g.guildName}
        </span>
        <span className="mt-1 block truncate font-mono text-[10px] tracking-wide text-[var(--ad-muted)]">
          {g.guildId}
        </span>
      </span>

      <span
        className={`relative inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition ${
          isReg
            ? "bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-400/25 group-hover:bg-emerald-400/25"
            : inviteBtn
        }`}
      >
        {isReg ? "열기" : "초대"}
        <ArrowRight className="size-3 opacity-70 transition group-hover:translate-x-0.5" />
      </span>
    </motion.button>
  );
}

function GuildSection({
  title,
  subtitle,
  count,
  empty,
  soft,
  border,
  headerIcon,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  empty: string;
  soft: string;
  border: string;
  headerIcon: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section
      variants={fadeUp}
      className={`overflow-hidden rounded-[1.4rem] border bg-gradient-to-b shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)] ${soft} ${border}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-black/35 text-[var(--ad-text)] ring-1 ring-white/12">
            {headerIcon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-[var(--ad-text)]">{title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ad-muted)]">{subtitle}</p>
          </div>
        </div>
        <motion.span
          key={count}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="shrink-0 rounded-full bg-black/40 px-2.5 py-1 font-mono text-[11px] text-[var(--ad-muted)] ring-1 ring-white/12"
        >
          {count}
        </motion.span>
      </div>
      <div className="max-h-[min(40vh,22rem)] space-y-2 overflow-y-auto overscroll-contain p-3 [-webkit-overflow-scrolling:touch]">
        {count === 0 ? (
          <p className="px-2 py-5 text-center text-sm text-[var(--ad-muted)]">{empty}</p>
        ) : (
          children
        )}
      </div>
    </motion.section>
  );
}

export function BotDiscordLogin({
  product,
  icon,
}: {
  product: Product;
  icon: ReactNode;
}) {
  const router = useRouter();
  const theme = ACCENT[product];
  const [phase, setPhase] = useState<"boot" | "login" | "pick">("boot");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [registered, setRegistered] = useState<GuildRow[]>([]);
  const [unregistered, setUnregistered] = useState<GuildRow[]>([]);

  const loadGuilds = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/${product}/oauth/guilds`, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        needLogin?: boolean;
        discordUsername?: string;
        registered?: GuildRow[];
        unregistered?: GuildRow[];
        guilds?: GuildRow[];
      };
      if (res.status === 401 || data.needLogin) {
        setPhase("login");
        return;
      }
      if (!res.ok) throw new Error(data.error || "서버 목록을 불러오지 못했어요.");
      setUsername(data.discordUsername ?? null);
      setRegistered(data.registered ?? data.guilds ?? []);
      setUnregistered(data.unregistered ?? []);
      setPhase("pick");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
      setPhase("login");
    } finally {
      setBusy(false);
    }
  }, [product]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const discord = params.get("discord");
    if (discord === "ok") {
      void loadGuilds();
      window.history.replaceState({}, "", "/");
      return;
    }
    if (discord === "denied") setErr("Discord 작업이 취소됐어요.");
    else if (discord === "state" || discord === "code") setErr("로그인 세션이 만료됐어요. 다시 시도해 주세요.");
    else if (discord === "error") setErr(params.get("msg") || "Discord 처리에 실패했어요.");
    setPhase("login");
  }, [loadGuilds]);

  async function selectGuild(guildId: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/${product}/oauth/select`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "선택에 실패했어요.");
      router.push(`/${guildId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "선택 실패");
      setBusy(false);
    }
  }

  function inviteGuild(guildId: string) {
    setBusy(true);
    window.location.href = `/api/${product}/oauth/invite?guildId=${encodeURIComponent(guildId)}`;
  }

  return (
    <div
      className="admin-shell relative min-h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-10 sm:py-14"
      data-theme="dark"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden
      />
      <motion.div
        className={`pointer-events-none absolute -left-24 top-10 size-80 rounded-full ${theme.glow} blur-3xl`}
        animate={{ x: [0, 48, 0], scale: [1, 1.08, 1], opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={`pointer-events-none absolute -right-16 bottom-8 size-64 rounded-full ${theme.glow2} blur-3xl`}
        animate={{ y: [0, -32, 0], opacity: [0.2, 0.42, 0.2] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-lg flex-col justify-center">
        <motion.div
          variants={scaleIn}
          initial="hidden"
          animate="show"
          className={`admin-bento relative w-full overflow-hidden p-6 sm:p-8 ring-1 ${theme.ring}`}
        >
          <motion.div
            className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/[0.04] blur-2xl"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 4, repeat: Infinity }}
          />

          <motion.div variants={stagger} initial="hidden" animate="show" className="relative space-y-5">
            <motion.div variants={fadeUp} className="flex items-center gap-3.5">
              <motion.span
                className={`flex size-12 items-center justify-center rounded-2xl ring-1 ring-white/12 ${theme.iconBg}`}
                whileHover={{ rotate: [-4, 4, 0], scale: 1.05 }}
                transition={{ duration: 0.45 }}
              >
                {icon}
              </motion.span>
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${theme.iconText}`}>
                  {theme.label}
                </p>
                <h1 className="mt-0.5 text-xl font-bold tracking-tight text-[var(--ad-text)] sm:text-2xl">
                  {theme.title}
                </h1>
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              {phase === "boot" || (busy && phase !== "pick") ? (
                <motion.div
                  key="boot"
                  variants={fadeUp}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex justify-center py-10"
                >
                  <Loader2 className="size-5 animate-spin text-[var(--ad-muted)]" />
                </motion.div>
              ) : null}

              {phase === "login" && !busy ? (
                <motion.div
                  key="login"
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="space-y-4"
                >
                  <motion.p variants={fadeUp} className="text-sm leading-relaxed text-[var(--ad-muted)]">
                    {theme.hint}
                  </motion.p>
                  {err ? (
                    <motion.p variants={fadeUp} className="text-sm text-rose-400">
                      {err}
                    </motion.p>
                  ) : null}
                  <motion.button
                    variants={fadeUp}
                    type="button"
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      window.location.href = `/api/${product}/oauth/start`;
                    }}
                    className={`vx-btn-press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold shadow-lg transition ${theme.btn}`}
                  >
                    Discord로 로그인
                    <ArrowRight className="size-4 opacity-80" />
                  </motion.button>
                </motion.div>
              ) : null}

              {phase === "pick" ? (
                <motion.div
                  key="pick"
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="space-y-4"
                >
                  <motion.div
                    variants={fadeUp}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/12 bg-white/[0.035] px-3.5 py-2.5"
                  >
                    <p className="text-sm text-[var(--ad-muted)]">
                      {username ? (
                        <>
                          <span className="font-medium text-[var(--ad-text)]">{username}</span>
                          <span> · 서버 선택</span>
                        </>
                      ) : (
                        "소유 서버를 선택하세요."
                      )}
                    </p>
                    {busy ? <Loader2 className="size-4 animate-spin text-[var(--ad-muted)]" /> : null}
                  </motion.div>
                  {err ? (
                    <motion.p variants={fadeUp} className="text-sm text-rose-400">
                      {err}
                    </motion.p>
                  ) : null}

                  <div className="space-y-3.5">
                    <GuildSection
                      title="등록된 서버"
                      subtitle="이미 연결된 서버 · 바로 패널"
                      count={registered.length}
                      empty="아직 등록된 서버가 없어요."
                      soft={theme.accentSoft}
                      border={theme.accentBorder}
                      headerIcon={<CheckCircle2 className="size-3.5 text-emerald-300" />}
                    >
                      {registered.map((g, i) => (
                        <GuildCard
                          key={g.guildId}
                          g={g}
                          busy={busy}
                          kind="registered"
                          inviteBtn={theme.inviteBtn}
                          index={i}
                          onClick={() => void selectGuild(g.guildId)}
                        />
                      ))}
                    </GuildSection>

                    <GuildSection
                      title="새 서버 등록"
                      subtitle="봇 초대 후 패널 열기"
                      count={unregistered.length}
                      empty="초대할 수 있는 서버가 없어요."
                      soft={theme.inviteSoft}
                      border={theme.inviteBorder}
                      headerIcon={<Sparkles className={`size-3.5 ${theme.iconText}`} />}
                    >
                      {unregistered.map((g, i) => (
                        <GuildCard
                          key={g.guildId}
                          g={g}
                          busy={busy}
                          kind="invite"
                          inviteBtn={theme.inviteBtn}
                          index={i}
                          onClick={() => inviteGuild(g.guildId)}
                        />
                      ))}
                    </GuildSection>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
