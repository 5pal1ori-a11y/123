"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheck,
  Ban,
  Check,
  Download,
  FileText,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Radio,
  Save,
  Settings2,
  ShieldAlert,
  Activity,
  ScrollText,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { AdminHero, AdminPane, AdminStat } from "@/components/admin/admin-bento";
import { PanelSetupCredentials } from "@/components/panel-setup-credentials";
import { VerifyAuditPane, VerifyInsightsPane } from "@/components/verify/verify-insights";
import { fadeUp, stagger, verifyEase } from "@/components/verify/verify-motion";

type Tab =
  | "overview"
  | "auth"
  | "security"
  | "panel"
  | "members"
  | "logs"
  | "insights"
  | "audit"
  | "recovery"
  | "advanced";

type GuildStats = {
  guildId: string;
  guildName: string;
  enabled: boolean;
  verifiedRoleId: string | null;
  logChannelId: string | null;
  logIp: boolean;
  logEmail: boolean;
  requireEmail: boolean;
  blockVpn: boolean;
  blockProxy: boolean;
  blockMobile: boolean;
  blockForeign: boolean;
  allowedCountries: string[];
  panelTitle: string;
  panelDescription: string;
  buttonLabel: string;
  minAccountAgeDays: number;
  maxVerifiesPerIpPerDay: number;
  reverifyCooldownHours: number;
  blacklistUserIds: string[];
  blacklistIps: string[];
  whitelistIps: string[];
  webhookUrl: string | null;
  dmOnVerify: boolean;
  dmMessage: string;
  logBlockedAttempts: boolean;
  blockDuplicateIp: boolean;
  requirePhoneLinked: boolean;
  kickUnverifiedMinutes: number;
  enableTurnstile: boolean;
  trackSources: boolean;
  planTier: string;
  hasRecoveryKey: boolean;
  joinsToday: number;
  verifiesToday: number;
  blockedToday: number;
  verifyTotal: number;
  blockedTotal: number;
  memberCount: number;
  recoverableCount: number;
  countries: { country: string; count: number }[];
};

type RoleOpt = { id: string; name: string; managed: boolean };
type ChannelOpt = { id: string; name: string };
type MemberRow = {
  discordUserId: string;
  username: string;
  verifyCount: number;
  lastIp: string | null;
  lastCountry: string | null;
  recoverable: boolean;
  createdAt: string;
  updatedAt: string;
};
type EventRow = {
  id: string;
  guildId?: string;
  guildName: string | null;
  discordUserId: string;
  username: string;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
  device: string | null;
  country: string | null;
  region: string | null;
  isp: string | null;
  flags: string[];
  status: "ok" | "blocked";
  reason: string | null;
  createdAt: string;
};

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "overview", label: "대시보드", icon: LayoutDashboard, group: "홈" },
  { id: "auth", label: "인증 설정", icon: Settings2, group: "설정" },
  { id: "security", label: "접속 제한", icon: ShieldAlert, group: "설정" },
  { id: "panel", label: "패널 문구", icon: MessageSquare, group: "설정" },
  { id: "members", label: "멤버", icon: Users, group: "데이터" },
  { id: "logs", label: "로그", icon: FileText, group: "데이터" },
  { id: "insights", label: "인사이트", icon: Activity, group: "데이터" },
  { id: "audit", label: "감사 로그", icon: ScrollText, group: "데이터" },
  { id: "recovery", label: "복구", icon: KeyRound, group: "운영" },
  { id: "advanced", label: "고급", icon: Ban, group: "운영" },
];

function ToggleRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--ad-border)] bg-[var(--ad-card)] px-4 py-3 text-left transition hover:border-white/20"
    >
      <span>
        <span className="block text-sm font-medium text-[var(--ad-text)]">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-[var(--ad-muted)]">{hint}</span> : null}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full ${
          checked ? "bg-emerald-400" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ad-muted)]">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputCls =
  "toss-admin-field w-full rounded-xl border border-[var(--ad-border)] bg-black/30 px-3 py-2.5 text-sm text-[var(--ad-text)] outline-none focus:border-emerald-400/40";

export function VerifyPanelClient({ guildId }: { guildId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [guildNameHint, setGuildNameHint] = useState("");
  const [guild, setGuild] = useState<GuildStats | null>(null);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [channels, setChannels] = useState<ChannelOpt[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [insights, setInsights] = useState<Parameters<typeof VerifyInsightsPane>[0]["insights"]>(null);
  const [audits, setAudits] = useState<
    { id: string; action: string; actor: string; ip: string | null; detail: string | null; createdAt: string }[]
  >([]);
  const [planLabel, setPlanLabel] = useState("PRO");
  const [recoveryLimit, setRecoveryLimit] = useState(500);
  const [turnstileConfigured, setTurnstileConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [countriesText, setCountriesText] = useState("KR");
  const [blUsers, setBlUsers] = useState("");
  const [blIps, setBlIps] = useState("");
  const [wlIps, setWlIps] = useState("");
  const [memberQ, setMemberQ] = useState("");
  const [logQ, setLogQ] = useState("");
  const [logFilter, setLogFilter] = useState<"all" | "ok" | "blocked">("all");
  const [recoveryShown, setRecoveryShown] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/verify/${guildId}`);
      const data = await res.json();
      if (data.needLogin) {
        setNeedLogin(true);
        setGuildNameHint(data.guildName || "");
        setGuild(null);
        return;
      }
      if (!res.ok) throw new Error(data.error || "불러오기 실패");
      setNeedLogin(false);
      setGuild(data.guild);
      setRoles(data.roles || []);
      setChannels(data.channels || []);
      setMembers(data.members || []);
      setEvents(data.events || []);
      setInsights(data.insights || null);
      setAudits(data.audits || []);
      setPlanLabel(data.planLabel || data.guild?.planTier || "PRO");
      setRecoveryLimit(data.recoveryLimit || 50);
      setTurnstileConfigured(Boolean(data.turnstileConfigured));
      setCountriesText((data.guild?.allowedCountries || ["KR"]).join(", "));
      setBlUsers((data.guild?.blacklistUserIds || []).join("\n"));
      setBlIps((data.guild?.blacklistIps || []).join("\n"));
      setWlIps((data.guild?.whitelistIps || []).join("\n"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void load();
  }, [load]);

  function parseLines(text: string) {
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function save() {
    if (!guild) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    const allowedCountries = countriesText
      .split(/[\s,]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));
    try {
      const res = await fetch(`/api/verify/${guildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...guild,
          allowedCountries: allowedCountries.length ? allowedCountries : ["KR"],
          blacklistUserIds: parseLines(blUsers),
          blacklistIps: parseLines(blIps),
          whitelistIps: parseLines(wlIps),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setGuild(data.guild);
      setMsg("저장됐어요");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/verify/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "실패");
      if (data.recoveryKey) setRecoveryShown(data.recoveryKey);
      if (data.members) setMembers(data.members);
      if (data.events) setEvents(data.events);
      setMsg("완료");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch(`/api/verify/${guildId}`, { method: "DELETE" });
    window.location.href = window.location.pathname.startsWith("/verify") ? "/verify" : "/";
  }

  const filteredMembers = useMemo(() => {
    const q = memberQ.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        m.discordUserId.includes(q) ||
        (m.lastIp || "").includes(q),
    );
  }, [members, memberQ]);

  const filteredEvents = useMemo(() => {
    let list = events;
    if (logFilter !== "all") list = list.filter((e) => e.status === logFilter);
    const q = logQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.username.toLowerCase().includes(q) ||
        e.discordUserId.includes(q) ||
        (e.ip || "").includes(q) ||
        (e.isp || "").toLowerCase().includes(q) ||
        (e.region || "").toLowerCase().includes(q) ||
        (e.device || "").toLowerCase().includes(q) ||
        (e.guildName || "").toLowerCase().includes(q) ||
        (e.reason || "").includes(q),
    );
  }, [events, logFilter, logQ]);

  function exportCsv(rows: string[][], name: string) {
    const bom = "\uFEFF";
    const csv = bom + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }

  if (loading) {
    return (
      <div className="admin-shell flex min-h-dvh items-center justify-center" data-theme="dark">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="size-7 text-emerald-300/80" />
          </motion.div>
          <motion.p
            className="text-xs tracking-[0.18em] text-[var(--ad-muted)]"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          >
            LOADING
          </motion.p>
        </motion.div>
      </div>
    );
  }

  if (needLogin || !guild) {
    return (
      <div
        className="admin-shell flex min-h-dvh items-center justify-center px-4"
        data-theme="dark"
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="admin-bento w-full max-w-md p-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
              <BadgeCheck className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/70">
                MFA MARKET
              </p>
              <h1 className="text-xl font-bold text-[var(--ad-text)]">로그인이 필요합니다</h1>
            </div>
          </div>
          <p className="mb-4 text-sm text-[var(--ad-muted)]">
            {guildNameHint || "서버"} · <code>{guildId}</code>
            <br />
            상점 관리자 아이디·비밀번호로 로그인해 주세요.
          </p>
          {err ? <p className="mb-3 text-sm text-rose-400">{err}</p> : null}
          <button
            type="button"
            onClick={() => {
              window.location.href = window.location.pathname.startsWith("/verify")
                ? "/verify"
                : "/";
            }}
            className="vx-btn-press mt-2 flex w-full items-center justify-center rounded-xl bg-white py-2.5 text-sm font-semibold text-black"
          >
            관리자 로그인
          </button>
        </motion.div>
      </div>
    );
  }

  const groups = [...new Set(NAV.map((n) => n.group))];
  const tabMeta = NAV.find((n) => n.id === tab);

  return (
    <div className="admin-shell relative flex h-dvh max-h-dvh overflow-hidden" data-theme="dark">
      <PanelSetupCredentials product="verify" accentClass="bg-emerald-400 text-[#04140c]" />
      <motion.div
        className="pointer-events-none absolute -right-24 top-0 size-80 rounded-full bg-emerald-500/10 blur-3xl"
        animate={{ y: [0, 40, 0], opacity: [0.25, 0.4, 0.25] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      {mobileOpen ? (
        <motion.button
          type="button"
          aria-label="닫기"
          className="fixed inset-0 z-40 bg-black/55 lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <motion.aside
        layout
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className={`admin-sidebar fixed inset-y-0 left-0 z-50 flex max-w-[85vw] shrink-0 flex-col lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "w-[72px]" : "w-[260px]"}`}
        style={{ transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className={`flex items-center gap-2 px-3 py-4 ${collapsed ? "justify-center" : ""}`}>
          <motion.span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"
            whileHover={{ rotate: -8, scale: 1.05 }}
          >
            <BadgeCheck className="size-4" />
          </motion.span>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
                MFA MARKET
              </p>
              <p className="truncate text-sm font-bold text-[var(--ad-text)]">{guild.guildName}</p>
            </div>
          ) : null}
          <button
            type="button"
            className="admin-icon-btn hidden lg:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label="사이드바"
          >
            <PanelLeftClose className="size-4" />
          </button>
          <button
            type="button"
            className="admin-icon-btn lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="admin-sidebar-nav min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 pb-3">
          {groups.map((group) => (
            <div key={group}>
              {!collapsed ? (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ad-subtle)]">
                  {group}
                </p>
              ) : null}
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((n) => {
                  const active = tab === n.id;
                  return (
                    <motion.button
                      key={n.id}
                      type="button"
                      title={n.label}
                      onClick={() => {
                        setTab(n.id);
                        setMobileOpen(false);
                      }}
                      whileHover={{ x: collapsed ? 0 : 2 }}
                      whileTap={{ scale: 0.98 }}
                      className={`admin-nav relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
                        active
                          ? "is-active text-[var(--ad-text)]"
                          : "text-[var(--ad-muted)] hover:bg-white/5 hover:text-[var(--ad-text)]"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      {active ? (
                        <motion.span
                          layoutId="verify-nav-pill"
                          className="absolute inset-0 rounded-xl bg-[var(--ad-accent-soft)]"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      ) : null}
                      <n.icon className="relative z-10 size-4 shrink-0 opacity-80" />
                      {!collapsed ? (
                        <span className="relative z-10 truncate font-medium">{n.label}</span>
                      ) : null}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--ad-border)] p-2.5">
          <button
            type="button"
            onClick={() => void logout()}
            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-[var(--ad-muted)] hover:bg-white/5 hover:text-white ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut className="size-4" />
            {!collapsed ? "로그아웃" : null}
          </button>
        </div>
      </motion.aside>

      <div className="admin-sheet flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="admin-topbar flex items-center justify-between gap-3 border-b border-[var(--ad-border)] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="admin-icon-btn lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-4" />
            </button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ad-subtle)]">
                {tabMeta?.group}
              </p>
              <h1 className="text-lg font-bold tracking-tight text-[var(--ad-text)]">
                {tabMeta?.label}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                guild.enabled
                  ? "bg-emerald-400/15 text-emerald-300"
                  : "bg-white/8 text-[var(--ad-muted)]"
              }`}
            >
              {guild.enabled ? "봇 ON" : "봇 OFF"}
            </span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="vx-btn-press inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 px-3.5 py-2 text-xs font-bold text-[#04120c] disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              저장
            </button>
          </div>
        </header>

        <div className="admin-sheet-inner min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <AnimatePresence mode="wait">
            {(msg || err) && (
              <motion.p
                key={err || msg}
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                className={`mb-4 overflow-hidden text-sm ${err ? "text-rose-400" : "text-emerald-300"}`}
              >
                {err || msg}
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
              transition={{ duration: 0.28, ease: verifyEase }}
            >
              {tab === "overview" ? (
                <motion.div
                  className="admin-bento-grid gap-4"
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                >
                  <motion.div variants={fadeUp} className="lg:col-span-5">
                    <AdminHero
                      className="h-full"
                      badge="Verify Overview"
                      value={guild.guildName}
                      hint={`서버 ID ${guild.guildId}`}
                      stats={[
                        { label: "오늘 인증", value: String(guild.verifiesToday) },
                        { label: "오늘 차단", value: String(guild.blockedToday) },
                        { label: "플랜", value: planLabel },
                        {
                          label: "복구 가능",
                          value: `${guild.recoverableCount}/${recoveryLimit}`,
                        },
                      ]}
                    >
                      <ToggleRow
                        checked={guild.enabled}
                        onChange={(v) => setGuild({ ...guild, enabled: v })}
                        label="인증봇 활성화"
                        hint="꺼지면 OAuth 인증이 중단됩니다"
                      />
                    </AdminHero>
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-3">
                    <AdminStat
                      className="h-full"
                      label="오늘 입장"
                      value={guild.joinsToday}
                      hint="수동 보정"
                    />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-4">
                    <AdminStat
                      className="h-full"
                      label="누적 인증"
                      value={guild.verifyTotal}
                      tone="ok"
                    />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-3">
                    <AdminStat
                      className="h-full"
                      label="누적 차단"
                      value={guild.blockedTotal}
                      tone="warn"
                    />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-3">
                    <AdminStat className="h-full" label="멤버 기록" value={guild.memberCount} />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-6">
                    <AdminPane title="국가 분포" className="h-full">
                      {guild.countries?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {guild.countries.map((c, i) => (
                            <motion.span
                              key={c.country}
                              className="admin-chip rounded-full px-3 py-1 text-xs"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.04 * i }}
                            >
                              {c.country} · {c.count}
                            </motion.span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--ad-muted)]">아직 국가 데이터가 없어요.</p>
                      )}
                    </AdminPane>
                  </motion.div>
                </motion.div>
              ) : null}

              {tab === "auth" ? (
                <div className="grid max-w-4xl gap-4">
                  <AdminPane title="역할 · 채널">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="인증 역할">
                        <select
                          className={inputCls}
                          value={guild.verifiedRoleId || ""}
                          onChange={(e) =>
                            setGuild({ ...guild, verifiedRoleId: e.target.value || null })
                          }
                        >
                          <option value="">선택 안 함</option>
                          {roles
                            .filter((r) => !r.managed)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="로그 채널">
                        <select
                          className={inputCls}
                          value={guild.logChannelId || ""}
                          onChange={(e) =>
                            setGuild({ ...guild, logChannelId: e.target.value || null })
                          }
                        >
                          <option value="">선택 안 함</option>
                          {channels.map((c) => (
                            <option key={c.id} value={c.id}>
                              # {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="서버 표시 이름">
                        <input
                          className={inputCls}
                          value={guild.guildName}
                          onChange={(e) => setGuild({ ...guild, guildName: e.target.value })}
                        />
                      </Field>
                      <Field label="오늘 입장 수">
                        <input
                          type="number"
                          min={0}
                          className={inputCls}
                          value={guild.joinsToday}
                          onChange={(e) =>
                            setGuild({ ...guild, joinsToday: Number(e.target.value) || 0 })
                          }
                        />
                      </Field>
                    </div>
                  </AdminPane>
                  <AdminPane title="로깅 · 계정 규칙">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <ToggleRow
                        checked={guild.logIp}
                        onChange={(v) => setGuild({ ...guild, logIp: v })}
                        label="IP 로깅"
                      />
                      <ToggleRow
                        checked={guild.logEmail}
                        onChange={(v) => setGuild({ ...guild, logEmail: v })}
                        label="이메일 로깅"
                      />
                      <ToggleRow
                        checked={guild.requireEmail}
                        onChange={(v) => setGuild({ ...guild, requireEmail: v })}
                        label="이메일 필수"
                      />
                      <ToggleRow
                        checked={guild.logBlockedAttempts}
                        onChange={(v) => setGuild({ ...guild, logBlockedAttempts: v })}
                        label="차단 시도 기록"
                      />
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <Field label="최소 계정 일수">
                        <input
                          type="number"
                          min={0}
                          className={inputCls}
                          value={guild.minAccountAgeDays}
                          onChange={(e) =>
                            setGuild({
                              ...guild,
                              minAccountAgeDays: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </Field>
                      <Field label="IP당 일일 인증 한도">
                        <input
                          type="number"
                          min={0}
                          className={inputCls}
                          value={guild.maxVerifiesPerIpPerDay}
                          onChange={(e) =>
                            setGuild({
                              ...guild,
                              maxVerifiesPerIpPerDay: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </Field>
                      <Field label="재인증 쿨다운(시간)">
                        <input
                          type="number"
                          min={0}
                          className={inputCls}
                          value={guild.reverifyCooldownHours}
                          onChange={(e) =>
                            setGuild({
                              ...guild,
                              reverifyCooldownHours: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </Field>
                      <Field label="미인증 자동킥 (분, 0=끄기)">
                        <input
                          type="number"
                          min={0}
                          className={inputCls}
                          value={guild.kickUnverifiedMinutes ?? 0}
                          onChange={(e) =>
                            setGuild({
                              ...guild,
                              kickUnverifiedMinutes: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <ToggleRow
                        checked={Boolean(guild.requirePhoneLinked)}
                        onChange={(v) => setGuild({ ...guild, requirePhoneLinked: v })}
                        label="Discord 인증 계정만 (선택)"
                        hint="전화 미공개 → 이메일 verified 기준으로 검사"
                      />
                      <ToggleRow
                        checked={guild.trackSources !== false}
                        onChange={(v) => setGuild({ ...guild, trackSources: v })}
                        label="채널/캠페인 유입 추적"
                      />
                      <ToggleRow
                        checked={Boolean(guild.enableTurnstile)}
                        onChange={(v) => setGuild({ ...guild, enableTurnstile: v })}
                        label="Turnstile 캡차"
                        hint={
                          turnstileConfigured
                            ? "OAuth 시작 전 캡차"
                            : "사이트키 미설정 — 환경변수 필요"
                        }
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--ad-subtle)]">
                      자동킥·캡차·ASN 차트는 Verify 플랜({planLabel})에 따라 제한됩니다.
                    </p>
                  </AdminPane>
                </div>
              ) : null}

              {tab === "insights" ? <VerifyInsightsPane insights={insights} /> : null}
              {tab === "audit" ? <VerifyAuditPane audits={audits} /> : null}

              {tab === "security" ? (
                <div className="grid max-w-4xl gap-4">
                  <AdminPane title="네트워크 제한">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <ToggleRow
                        checked={guild.blockVpn}
                        onChange={(v) => setGuild({ ...guild, blockVpn: v })}
                        label="VPN 제한"
                      />
                      <ToggleRow
                        checked={guild.blockProxy}
                        onChange={(v) => setGuild({ ...guild, blockProxy: v })}
                        label="프록시 / 호스팅 제한"
                      />
                      <ToggleRow
                        checked={guild.blockMobile}
                        onChange={(v) => setGuild({ ...guild, blockMobile: v })}
                        label="모바일 데이터 제한"
                      />
                      <ToggleRow
                        checked={guild.blockForeign}
                        onChange={(v) => setGuild({ ...guild, blockForeign: v })}
                        label="외국 IP 제한"
                      />
                      <ToggleRow
                        checked={guild.blockDuplicateIp}
                        onChange={(v) => setGuild({ ...guild, blockDuplicateIp: v })}
                        label="동일 IP 다중계정 차단"
                        hint="이미 인증된 IP의 다른 계정 거부"
                      />
                    </div>
                    <div className="mt-4">
                      <Field label="허용 국가 (ISO)">
                        <input
                          className={inputCls}
                          value={countriesText}
                          onChange={(e) => setCountriesText(e.target.value)}
                          placeholder="KR, JP"
                        />
                      </Field>
                    </div>
                  </AdminPane>
                  <AdminPane title="블랙리스트 · 화이트리스트">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="유저 ID (줄바꿈)">
                        <textarea
                          className={`${inputCls} min-h-[120px] font-mono text-xs`}
                          value={blUsers}
                          onChange={(e) => setBlUsers(e.target.value)}
                        />
                      </Field>
                      <Field label="차단 IP">
                        <textarea
                          className={`${inputCls} min-h-[120px] font-mono text-xs`}
                          value={blIps}
                          onChange={(e) => setBlIps(e.target.value)}
                        />
                      </Field>
                      <Field label="허용 IP (비우면 전체)">
                        <textarea
                          className={`${inputCls} min-h-[120px] font-mono text-xs`}
                          value={wlIps}
                          onChange={(e) => setWlIps(e.target.value)}
                        />
                      </Field>
                    </div>
                  </AdminPane>
                </div>
              ) : null}

              {tab === "panel" ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <AdminPane title="Discord 패널 문구">
                    <div className="space-y-4">
                      <Field label="제목">
                        <input
                          className={inputCls}
                          value={guild.panelTitle}
                          onChange={(e) => setGuild({ ...guild, panelTitle: e.target.value })}
                        />
                      </Field>
                      <Field label="설명">
                        <textarea
                          className={`${inputCls} min-h-[100px]`}
                          value={guild.panelDescription}
                          onChange={(e) =>
                            setGuild({ ...guild, panelDescription: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="버튼 문구">
                        <input
                          className={inputCls}
                          value={guild.buttonLabel}
                          onChange={(e) => setGuild({ ...guild, buttonLabel: e.target.value })}
                        />
                      </Field>
                      <p className="text-xs text-[var(--ad-muted)]">
                        저장 후 Discord에서 <code>/인증</code>을 다시 실행해야 패널이 갱신됩니다.
                      </p>
                    </div>
                  </AdminPane>
                  <AdminPane title="미리보기">
                    <div className="rounded-2xl border border-[#5865F2]/35 bg-[#2b2d31] p-4 text-white shadow-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/brand/does-verify-banner.jpg"
                        alt=""
                        className="mb-3 aspect-[3/1] w-full rounded-lg object-cover"
                      />
                      <p className="text-lg font-bold">## {guild.panelTitle || "서버 인증"}</p>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">
                        {guild.panelDescription}
                      </p>
                      <div className="mt-4 inline-flex rounded-md bg-[#5865F2] px-4 py-2 text-sm font-semibold">
                        {guild.buttonLabel || "인증하기"}
                      </div>
                    </div>
                  </AdminPane>
                </div>
              ) : null}

              {tab === "members" ? (
                <AdminPane
                  title={`멤버 ${filteredMembers.length}`}
                  action={
                    <div className="flex flex-wrap gap-2">
                      <input
                        className={`${inputCls} w-44`}
                        placeholder="검색"
                        value={memberQ}
                        onChange={(e) => setMemberQ(e.target.value)}
                      />
                      <button
                        type="button"
                        className="admin-chip inline-flex items-center gap-1 px-3 py-2 text-xs"
                        onClick={() =>
                          exportCsv(
                            [
                              ["userId", "username", "count", "ip", "country", "recoverable"],
                              ...filteredMembers.map((m) => [
                                m.discordUserId,
                                m.username,
                                String(m.verifyCount),
                                m.lastIp || "",
                                m.lastCountry || "",
                                m.recoverable ? "1" : "0",
                              ]),
                            ],
                            `verify-members-${guildId}.csv`,
                          )
                        }
                      >
                        <Download className="size-3.5" /> CSV
                      </button>
                    </div>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="text-[10px] uppercase tracking-wide text-[var(--ad-muted)]">
                        <tr>
                          <th className="pb-2">유저</th>
                          <th className="pb-2">횟수</th>
                          <th className="pb-2">IP</th>
                          <th className="pb-2">복구</th>
                          <th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredMembers.map((m) => (
                          <tr key={m.discordUserId}>
                            <td className="py-2.5">
                              <span className="font-medium text-[var(--ad-text)]">{m.username}</span>
                              <span className="ml-2 font-mono text-[10px] text-[var(--ad-subtle)]">
                                {m.discordUserId}
                              </span>
                            </td>
                            <td className="py-2.5">{m.verifyCount}</td>
                            <td className="py-2.5 font-mono text-xs text-[var(--ad-muted)]">
                              {m.lastIp || "—"} {m.lastCountry ? `(${m.lastCountry})` : ""}
                            </td>
                            <td className="py-2.5">
                              {m.recoverable ? (
                                <Check className="size-4 text-emerald-400" />
                              ) : (
                                <span className="text-[var(--ad-subtle)]">—</span>
                              )}
                            </td>
                            <td className="py-2.5 text-right">
                              <button
                                type="button"
                                disabled={busy}
                                className="text-xs text-rose-300 hover:underline"
                                onClick={() =>
                                  void runAction({
                                    action: "remove-member",
                                    discordUserId: m.discordUserId,
                                  })
                                }
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filteredMembers.length ? (
                      <p className="py-6 text-sm text-[var(--ad-muted)]">멤버가 없어요.</p>
                    ) : null}
                  </div>
                </AdminPane>
              ) : null}

              {tab === "logs" ? (
                <AdminPane
                  title="인증 · 차단 로그"
                  action={
                    <div className="flex flex-wrap gap-2">
                      <select
                        className={`${inputCls} w-28`}
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
                      >
                        <option value="all">전체</option>
                        <option value="ok">성공</option>
                        <option value="blocked">차단</option>
                      </select>
                      <input
                        className={`${inputCls} w-40`}
                        placeholder="검색"
                        value={logQ}
                        onChange={(e) => setLogQ(e.target.value)}
                      />
                      <button
                        type="button"
                        className="admin-chip inline-flex items-center gap-1 px-3 py-2 text-xs"
                        onClick={() =>
                          exportCsv(
                            [
                              [
                                "status",
                                "nickname",
                                "userId",
                                "server",
                                "ip",
                                "isp",
                                "region",
                                "device",
                                "reason",
                                "at",
                              ],
                              ...filteredEvents.map((e) => [
                                e.status,
                                e.username,
                                e.discordUserId,
                                e.guildName || "",
                                e.ip || "",
                                e.isp || "",
                                e.region || e.country || "",
                                e.device || "",
                                e.reason || "",
                                e.createdAt,
                              ]),
                            ],
                            `verify-logs-${guildId}.csv`,
                          )
                        }
                      >
                        <Download className="size-3.5" /> CSV
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="admin-chip inline-flex items-center gap-1 px-3 py-2 text-xs text-rose-300"
                        onClick={() => void runAction({ action: "clear-logs" })}
                      >
                        <Trash2 className="size-3.5" /> 비우기
                      </button>
                    </div>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left text-sm">
                      <thead className="text-[10px] uppercase tracking-wide text-[var(--ad-muted)]">
                        <tr>
                          <th className="pb-2">상태</th>
                          <th className="pb-2">닉네임 / 아이디</th>
                          <th className="pb-2">인증 서버</th>
                          <th className="pb-2">IP</th>
                          <th className="pb-2">통신사</th>
                          <th className="pb-2">예상 지역</th>
                          <th className="pb-2">기기</th>
                          <th className="pb-2">사유</th>
                          <th className="pb-2">시각</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredEvents.map((e) => (
                          <tr key={e.id} className="align-top">
                            <td className="py-2.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  e.status === "ok"
                                    ? "bg-emerald-400/15 text-emerald-300"
                                    : "bg-rose-400/15 text-rose-300"
                                }`}
                              >
                                {e.status === "ok" ? "OK" : "BLOCK"}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <p className="text-[var(--ad-text)]">{e.username}</p>
                              <p className="font-mono text-[10px] text-[var(--ad-subtle)]">
                                {e.discordUserId}
                              </p>
                            </td>
                            <td className="py-2.5 text-xs text-[var(--ad-muted)]">
                              {e.guildName || "—"}
                            </td>
                            <td className="py-2.5 font-mono text-xs text-[var(--ad-muted)]">
                              {e.ip || "—"}
                            </td>
                            <td className="max-w-[140px] truncate py-2.5 text-xs text-[var(--ad-muted)]" title={e.isp || undefined}>
                              {e.isp || "—"}
                            </td>
                            <td className="py-2.5 text-xs text-[var(--ad-muted)]">
                              {e.region || e.country || "—"}
                            </td>
                            <td className="py-2.5 text-xs text-[var(--ad-muted)]">
                              {e.device || "—"}
                            </td>
                            <td className="py-2.5 text-xs text-[var(--ad-muted)]">
                              {e.reason || "—"}
                            </td>
                            <td className="py-2.5 text-xs text-[var(--ad-subtle)]">
                              {new Date(e.createdAt).toLocaleString("ko-KR", { hour12: false })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filteredEvents.length ? (
                      <p className="py-6 text-sm text-[var(--ad-muted)]">로그가 없어요.</p>
                    ) : null}
                  </div>
                </AdminPane>
              ) : null}

              {tab === "recovery" ? (
                <div className="grid max-w-3xl gap-4">
                  <AdminPane title="서버 복구">
                    <div className="space-y-3 text-sm text-[var(--ad-muted)]">
                      <p>
                        인증 시 <code>guilds.join</code> 토큰을 저장합니다. 서버가 날아가면 새 서버에서{" "}
                        <code className="text-emerald-300">/복구 복구키</code> 로 멤버를 초대할 수 있어요.
                      </p>
                      <div className="admin-bento grid grid-cols-2 gap-3 p-4">
                        <div>
                          <p className="text-[11px] text-[var(--ad-subtle)]">복구 가능</p>
                          <p className="text-2xl font-bold text-[var(--ad-text)]">
                            {guild.recoverableCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-[var(--ad-subtle)]">복구키</p>
                          <p className="text-sm font-medium text-[var(--ad-text)]">
                            {guild.hasRecoveryKey ? "발급됨" : "없음 — /등록 필요"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        className="vx-btn-press inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
                        onClick={() => void runAction({ action: "rotate-recovery" })}
                      >
                        <KeyRound className="size-4" /> 복구키 재발급
                      </button>
                      {recoveryShown ? (
                        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 font-mono text-sm text-amber-100">
                          새 복구키 (지금만 표시): {recoveryShown}
                        </p>
                      ) : null}
                    </div>
                  </AdminPane>
                </div>
              ) : null}

              {tab === "advanced" ? (
                <div className="grid max-w-3xl gap-4">
                  <AdminPane title="DM · 웹훅">
                    <div className="space-y-4">
                      <ToggleRow
                        checked={guild.dmOnVerify}
                        onChange={(v) => setGuild({ ...guild, dmOnVerify: v })}
                        label="인증 완료 DM"
                      />
                      <Field label="DM 메시지">
                        <textarea
                          className={`${inputCls} min-h-[80px]`}
                          value={guild.dmMessage}
                          onChange={(e) => setGuild({ ...guild, dmMessage: e.target.value })}
                        />
                      </Field>
                      <Field label="Discord 웹훅 URL">
                        <input
                          className={inputCls}
                          value={guild.webhookUrl || ""}
                          onChange={(e) =>
                            setGuild({ ...guild, webhookUrl: e.target.value || null })
                          }
                          placeholder="https://discord.com/api/webhooks/..."
                        />
                      </Field>
                    </div>
                  </AdminPane>
                  <AdminPane title="참고">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ad-muted)]">
                      <li>
                        <Globe2 className="mr-1 inline size-3.5" /> Interactions:{" "}
                        <code className="text-[11px]">verify.doesmc.xyz/api/verify-bot/interactions</code>
                      </li>
                      <li>
                        <Radio className="mr-1 inline size-3.5" /> OAuth:{" "}
                        <code className="text-[11px]">
                          verify.doesmc.xyz/api/verify-bot/oauth/callback
                        </code>
                      </li>
                      <li>웹패널 로그인은 상점 관리자 아이디·비밀번호로 합니다.</li>
                    </ul>
                  </AdminPane>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
