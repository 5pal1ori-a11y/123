"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Store,
} from "lucide-react";
import { VendixLogo } from "@/components/ui/vendix-logo";

type GuildRow = {
  guildId: string;
  guildName: string;
  icon: string | null;
};

type RegisteredRow = GuildRow & {
  shop: { id: string; slug: string; name: string };
};

function discordIconUrl(guildId: string, icon: string | null) {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=64`;
}

export function ApexAdminDiscordPick() {
  const [phase, setPhase] = useState<"boot" | "login" | "pick" | "register">("boot");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [registered, setRegistered] = useState<RegisteredRow[]>([]);
  const [unregistered, setUnregistered] = useState<GuildRow[]>([]);
  const [registerGuild, setRegisterGuild] = useState<GuildRow | null>(null);
  const [form, setForm] = useState({
    licenseKey: "",
    slug: "",
    name: "",
    ownerEmail: "",
    adminPassword: "",
    tagline: "",
  });

  const loadGuilds = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin/discord/shops", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        needLogin?: boolean;
        discordUsername?: string;
        registered?: RegisteredRow[];
        unregistered?: GuildRow[];
      };
      if (res.status === 401 || data.needLogin) {
        setPhase("login");
        return;
      }
      if (!res.ok) throw new Error(data.error || "목록 실패");
      setUsername(data.discordUsername ?? null);
      setRegistered(data.registered ?? []);
      setUnregistered(data.unregistered ?? []);
      setPhase("pick");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
      setPhase("login");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    let licenseFromUrl = key?.trim() || "";
    try {
      const stored = sessionStorage.getItem("vendix_activate_license");
      if (stored?.trim()) {
        licenseFromUrl = licenseFromUrl || stored.trim();
        sessionStorage.removeItem("vendix_activate_license");
      }
    } catch {
      /* ignore */
    }
    if (licenseFromUrl) {
      setForm((f) => ({ ...f, licenseKey: licenseFromUrl }));
    }
    const discord = params.get("discord");
    if (discord === "ok") {
      void loadGuilds();
      const next = licenseFromUrl
        ? `/admin/discord?key=${encodeURIComponent(licenseFromUrl)}`
        : "/admin/discord";
      window.history.replaceState({}, "", next);
      return;
    }
    if (discord) setError("Discord 로그인에 문제가 있어요. 다시 시도해 주세요.");
    void loadGuilds();
  }, [loadGuilds]);

  async function openRegistered(row: RegisteredRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin/discord/shops", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: row.guildId, shopSlug: row.shop.slug }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        claimUrl?: string;
        adminUrl?: string;
      };
      if (!res.ok) throw new Error(data.error || "선택 실패");
      window.location.href =
        data.claimUrl || data.adminUrl || `https://${row.shop.slug}.vendix.team/admin`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "선택 실패");
      setBusy(false);
    }
  }

  function startRegister(g: GuildRow) {
    setRegisterGuild(g);
    setForm((f) => ({
      ...f,
      name: f.name || g.guildName.slice(0, 40),
      slug:
        f.slug ||
        g.guildName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 24),
    }));
    setPhase("register");
    setError(null);
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!registerGuild) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin/discord/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: registerGuild.guildId,
          licenseKey: form.licenseKey.trim() || "FREE",
          slug: form.slug.trim().toLowerCase(),
          name: form.name.trim(),
          ownerEmail: form.ownerEmail.trim(),
          adminPassword: form.adminPassword,
          tagline: form.tagline.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        claimUrl?: string;
        adminUrl?: string;
        shopSlug?: string;
      };
      if (!res.ok) throw new Error(data.error || "등록 실패");
      window.location.href =
        data.claimUrl ||
        data.adminUrl ||
        (data.shopSlug ? `https://${data.shopSlug}.vendix.team/admin` : "/admin/discord");
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
      setBusy(false);
    }
  }

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-10 sm:py-14"
      data-theme="dark"
    >
      <div
        className="pointer-events-none absolute -left-20 top-16 size-72 rounded-full bg-[#5865F2]/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-10 size-56 rounded-full bg-emerald-400/10 blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-lg flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="glass-thick landing-shadow w-full p-6 sm:p-8"
        >
          <div className="mb-6 flex items-center gap-3.5">
            <VendixLogo size={48} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#5865F2]/90">
                Shop Admin
              </p>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">
                Discord로 상점 개설·관리
              </h1>
            </div>
          </div>
          <p className="mb-6 text-sm leading-relaxed text-neutral-400">
            Discord로 로그인한 뒤 서버를 고르세요.{" "}
            <span className="text-neutral-300">새 상점은 서버 소유자만</span> 개설할 수 있어요.
          </p>

          <div className="space-y-4">
            {phase === "boot" || (busy && phase !== "register" && phase !== "pick") ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-5 animate-spin text-neutral-500" />
              </div>
            ) : null}

            {phase === "login" && !busy ? (
              <>
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const key =
                        form.licenseKey.trim() ||
                        new URLSearchParams(window.location.search).get("key")?.trim() ||
                        "";
                      if (key) sessionStorage.setItem("vendix_activate_license", key);
                    } catch {
                      /* ignore */
                    }
                    window.location.href = "/api/auth/admin/discord/start";
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5865F2] py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
                >
                  Discord로 로그인
                </button>
              </>
            ) : null}

            {phase === "pick" ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                  <p className="text-sm text-neutral-400">
                    {username ? (
                      <>
                        <span className="font-medium text-neutral-100">{username}</span>
                        <span> · 서버 선택</span>
                      </>
                    ) : (
                      "로그인됨"
                    )}
                  </p>
                  {busy ? <Loader2 className="size-4 animate-spin text-neutral-500" /> : null}
                </div>
                {error ? <p className="text-sm text-red-400">{error}</p> : null}

                <Section
                  title="등록된 서버"
                  subtitle="연동된 상점 · 바로 패널"
                  count={registered.length}
                  empty="연동된 상점이 없어요."
                  tone="reg"
                  icon={<CheckCircle2 className="size-3.5 text-emerald-300" />}
                >
                  {registered.map((g) => (
                    <GuildBtn
                      key={g.guildId}
                      g={g}
                      busy={busy}
                      badge="열기"
                      sub={g.shop.name}
                      onClick={() => void openRegistered(g)}
                    />
                  ))}
                </Section>

                <Section
                  title="새로 등록"
                  subtitle="소유 중인 서버만 · 라이선스 후 개설"
                  count={unregistered.length}
                  empty="소유자인 미등록 서버가 없어요. 서버 소유자 계정으로 로그인해 주세요."
                  tone="new"
                  icon={<Sparkles className="size-3.5 text-[#a5b4fc]" />}
                >
                  {unregistered.map((g) => (
                    <GuildBtn
                      key={g.guildId}
                      g={g}
                      busy={busy}
                      badge="등록"
                      invite
                      onClick={() => startRegister(g)}
                    />
                  ))}
                </Section>
              </>
            ) : null}

            {phase === "register" && registerGuild ? (
              <form onSubmit={(e) => void submitRegister(e)} className="space-y-3.5">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                  <Store className="size-4 text-[#5865F2]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">
                      {registerGuild.guildName}
                    </p>
                    <p className="truncate font-mono text-[10px] text-neutral-500">
                      {registerGuild.guildId}
                    </p>
                  </div>
                </div>
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                <Field
                  label="라이선스 키"
                  value={form.licenseKey}
                  onChange={(v) => setForm({ ...form, licenseKey: v })}
                  placeholder="비우면 FREE"
                />
                <Field
                  label="상점 주소 (slug)"
                  value={form.slug}
                  onChange={(v) => setForm({ ...form, slug: v.toLowerCase() })}
                  placeholder="myshop"
                />
                <Field
                  label="상호명"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                />
                <Field
                  label="이메일"
                  value={form.ownerEmail}
                  onChange={(v) => setForm({ ...form, ownerEmail: v })}
                  type="email"
                />
                <Field
                  label="관리자 비밀번호 (8자+)"
                  value={form.adminPassword}
                  onChange={(v) => setForm({ ...form, adminPassword: v })}
                  type="password"
                />
                <Field
                  label="소개 (선택)"
                  value={form.tagline}
                  onChange={(v) => setForm({ ...form, tagline: v })}
                />
                <button
                  type="submit"
                  disabled={busy || form.adminPassword.length < 8 || form.slug.length < 2}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5865F2] py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  상점 등록 후 패널 열기
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPhase("pick");
                    setRegisterGuild(null);
                  }}
                  className="w-full py-2 text-xs text-neutral-500 hover:text-neutral-300"
                >
                  서버 목록으로
                </button>
              </form>
            ) : null}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  count,
  empty,
  tone,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  empty: string;
  tone: "reg" | "new";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[1.35rem] border bg-gradient-to-b ${
        tone === "reg"
          ? "border-emerald-400/25 from-emerald-500/12 via-emerald-500/[0.04] to-transparent"
          : "border-[#5865F2]/25 from-[#5865F2]/12 via-[#5865F2]/[0.04] to-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-black/30 ring-1 ring-white/10">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">{title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{subtitle}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-black/35 px-2.5 py-1 font-mono text-[11px] text-neutral-500 ring-1 ring-white/10">
          {count}
        </span>
      </div>
      <div className="max-h-[min(40vh,22rem)] space-y-2 overflow-y-auto overscroll-contain p-3 [-webkit-overflow-scrolling:touch]">
        {count === 0 ? (
          <p className="px-2 py-5 text-center text-sm text-neutral-500">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="auth-field"
        autoComplete="off"
      />
    </label>
  );
}

function GuildBtn({
  g,
  busy,
  badge,
  sub,
  invite,
  onClick,
}: {
  g: GuildRow;
  busy: boolean;
  badge: string;
  sub?: string;
  invite?: boolean;
  onClick: () => void;
}) {
  const iconUrl = discordIconUrl(g.guildId, g.icon);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`group flex w-full items-center gap-3.5 rounded-2xl border px-3.5 py-3.5 text-left transition disabled:opacity-50 ${
        invite
          ? "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]"
          : "border-emerald-400/20 bg-emerald-500/[0.07] hover:border-emerald-300/40 hover:bg-emerald-500/[0.12]"
      }`}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconUrl} alt="" className="size-11 rounded-2xl shadow-lg shadow-black/30" />
      ) : (
        <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-white/15 to-white/5 text-base font-bold">
          {g.guildName.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-tight">{g.guildName}</span>
        <span className="mt-1 block truncate text-[11px] text-neutral-500">{sub || g.guildId}</span>
      </span>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold ${
          invite
            ? "bg-[#5865F2] text-white"
            : "bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-400/25"
        }`}
      >
        {badge}
        <ArrowRight className="size-3 opacity-70 transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
