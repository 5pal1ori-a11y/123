"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PanelSetupCredentials } from "@/components/panel-setup-credentials";
import {
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  Save,
  Settings2,
  Shield,
  FileText,
  History,
  X,
  RefreshCw,
  Zap,
  Swords,
  MessageSquareWarning,
  UserPlus,
  AlertTriangle,
  ListFilter,
  HardDrive,
} from "lucide-react";
import { AdminHero, AdminPane, AdminStat } from "@/components/admin/admin-bento";
import { fadeUp, stagger, verifyEase } from "@/components/verify/verify-motion";

type Tab =
  | "overview"
  | "raid"
  | "spam"
  | "join"
  | "warn"
  | "roles"
  | "whitelist"
  | "backup"
  | "logs"
  | "audit";

type Guild = {
  guildId: string;
  guildName: string;
  enabled: boolean;
  logChannelId: string | null;
  modRoleIds: string[];
  protectedRoleIds: string[];
  protectedUserIds: string[];
  antiRaidEnabled: boolean;
  raidJoinThreshold: number;
  raidWindowSeconds: number;
  raidAction: "lockdown" | "kick" | "ban" | "quarantine";
  raidAlertOnly: boolean;
  raidSlowmodeSeconds: number;
  blockEveryoneHere: boolean;
  mentionSpamLimit: number;
  mentionSpamAction: "delete" | "timeout" | "kick";
  antiNukeEnabled: boolean;
  nukeThreshold: number;
  nukeWindowSeconds: number;
  stripDangerousOnNuke: boolean;
  protectAdminRoles: boolean;
  trustedAdminRoleIds: string[];
  antiInviteSpam: boolean;
  antiLinkSpam: boolean;
  antiScamKeywords: boolean;
  antiMessageFlood: boolean;
  messageFloodLimit: number;
  messageFloodWindowSeconds: number;
  messageFloodAction: "timeout" | "kick" | "delete";
  minAccountAgeHours: number;
  blockDefaultAvatars: boolean;
  quarantineRoleId: string | null;
  alertRoleId: string | null;
  stripDangerousPerms: boolean;
  warnThreshold: number;
  warnAction: "mute" | "kick" | "ban";
  warnMuteMinutes: number;
  whitelistRoleIds: string[];
  whitelistChannelIds: string[];
  weeklyReportEnabled: boolean;
  autoSnapshotEnabled: boolean;
  lockdownActive: boolean;
};

type EventRow = {
  id: string;
  type: string;
  actorName: string | null;
  targetName: string | null;
  detail: string;
  createdAt: string;
};

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "overview", label: "대시보드", icon: LayoutDashboard, group: "홈" },
  { id: "raid", label: "레이드 · 누크", icon: Swords, group: "방어" },
  { id: "spam", label: "도배 · 스팸", icon: MessageSquareWarning, group: "방어" },
  { id: "join", label: "가입 필터", icon: UserPlus, group: "방어" },
  { id: "warn", label: "경고 · 리포트", icon: AlertTriangle, group: "운영" },
  { id: "roles", label: "역할 · 채널", icon: Settings2, group: "운영" },
  { id: "whitelist", label: "화이트리스트", icon: ListFilter, group: "운영" },
  { id: "backup", label: "백업 · 임시밴", icon: HardDrive, group: "운영" },
  { id: "logs", label: "보안 로그", icon: FileText, group: "기록" },
  { id: "audit", label: "감사 로그", icon: History, group: "기록" },
];

const SAVEABLE: Tab[] = ["overview", "raid", "spam", "join", "warn", "roles", "whitelist"];

function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 rounded-xl border border-rose-400/15 bg-rose-400/5 px-3 py-2 text-[12px] leading-relaxed text-[var(--ad-muted)]">
      {children}
    </p>
  );
}

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
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--ad-border)] bg-[var(--ad-card)] px-4 py-3 text-left transition hover:border-rose-400/25"
    >
      <span>
        <span className="block text-sm font-medium text-[var(--ad-text)]">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-[var(--ad-muted)]">{hint}</span> : null}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-rose-400" : "bg-white/15"
        }`}
      >
        <motion.span
          className="absolute top-0.5 size-5 rounded-full bg-white shadow"
          animate={{ left: checked ? 20 : 2 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
        />
      </span>
    </motion.button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
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
  "toss-admin-field w-full rounded-xl border border-[var(--ad-border)] bg-black/30 px-3 py-2.5 text-sm text-[var(--ad-text)] outline-none focus:border-rose-400/40";

export function SecurityPanelClient({ guildId }: { guildId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [guildNameHint, setGuildNameHint] = useState("");
  const [guild, setGuild] = useState<Guild | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [audits, setAudits] = useState<
    { id: string; action: string; actor: string; detail: string; createdAt: string }[]
  >([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [protectedUsersText, setProtectedUsersText] = useState("");
  const [snapshots, setSnapshots] = useState<
    { id: string; label: string; createdAt: string; channelCount: number; roleCount: number }[]
  >([]);
  const [tempBans, setTempBans] = useState<
    { id: string; userId: string; reason: string; expiresAt: string }[]
  >([]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/security/${guildId}`);
      const data = await res.json().catch(() => ({}));
      if (data.needLogin) {
        setNeedLogin(true);
        setGuildNameHint(data.guildName || "");
        setGuild(null);
        return;
      }
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "불러오기 실패");
      setNeedLogin(false);
      setGuild(data.guild);
      setRoles(data.roles || []);
      setChannels(data.channels || []);
      setEvents(data.events || []);
      setAudits(data.audits || []);
      setSnapshots(data.snapshots || []);
      setTempBans(data.tempBans || []);
      setProtectedUsersText((data.guild?.protectedUserIds || []).join("\n"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch(`/api/security/${guildId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setNeedLogin(true);
    setGuild(null);
  }

  async function saveGuild(patch: Partial<Guild>) {
    if (!guild) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/security/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "저장 실패");
      setGuild(data.guild);
      setMsg("저장됐어요");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function syncAutomod() {
    setSaving(true);
    try {
      const res = await fetch(`/api/security/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-automod" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "동기화 실패");
      setMsg(`AutoMod 동기화: ${(data.created || []).join(", ") || "없음"}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-shell flex min-h-dvh items-center justify-center" data-theme="dark">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
            <Loader2 className="size-7 text-rose-300/80" />
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
      <div className="admin-shell flex min-h-dvh items-center justify-center px-4" data-theme="dark">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="admin-bento w-full max-w-md p-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-rose-400/15 text-rose-300">
              <Shield className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-300/70">
                DOES Security
              </p>
              <h1 className="text-xl font-bold text-[var(--ad-text)]">로그인이 필요합니다</h1>
            </div>
          </div>
          <p className="mb-4 text-sm text-[var(--ad-muted)]">
            {guildNameHint || "서버"} · <code>{guildId}</code>
            <br />
            Discord 서버 소유자 계정으로 로그인해 주세요.
          </p>
          {err ? <p className="mb-3 text-sm text-rose-400">{err}</p> : null}
          <button
            type="button"
            onClick={() => {
              window.location.href = "/api/security/oauth/start";
            }}
            className="vx-btn-press mt-2 flex w-full items-center justify-center rounded-xl bg-rose-400 py-2.5 text-sm font-semibold text-[#1a0508]"
          >
            Discord로 로그인
          </button>
        </motion.div>
      </div>
    );
  }

  const groups = [...new Set(NAV.map((n) => n.group))];
  const tabMeta = NAV.find((n) => n.id === tab);
  const defenseScore = [
    guild.antiRaidEnabled,
    guild.blockEveryoneHere,
    guild.antiNukeEnabled,
    guild.protectAdminRoles,
    guild.antiInviteSpam,
    guild.antiLinkSpam,
    guild.antiScamKeywords,
    guild.antiMessageFlood,
    guild.minAccountAgeHours > 0,
  ].filter(Boolean).length;

  return (
    <div className="admin-shell relative flex h-dvh max-h-dvh overflow-hidden" data-theme="dark">
      <PanelSetupCredentials product="security" accentClass="bg-rose-400 text-[#1a0508]" />
      <motion.div
        className="pointer-events-none absolute -right-24 top-0 size-80 rounded-full bg-rose-500/10 blur-3xl"
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
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-400/15 text-rose-300"
            whileHover={{ rotate: -8, scale: 1.05 }}
          >
            <Shield className="size-4" />
          </motion.span>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-300/70">
                Security
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
          <button type="button" className="admin-icon-btn lg:hidden" onClick={() => setMobileOpen(false)}>
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
                      whileHover={{ x: collapsed ? 0 : 2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setTab(n.id);
                        setMobileOpen(false);
                      }}
                      className={`admin-nav relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
                        active
                          ? "is-active text-[var(--ad-text)]"
                          : "text-[var(--ad-muted)] hover:bg-white/5 hover:text-[var(--ad-text)]"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      {active ? (
                        <motion.span
                          layoutId="sec-nav-pill"
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
            <button type="button" className="admin-icon-btn lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="size-4" />
            </button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ad-subtle)]">
                {tabMeta?.group}
              </p>
              <h1 className="text-lg font-bold tracking-tight text-[var(--ad-text)]">{tabMeta?.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                guild.lockdownActive
                  ? "bg-rose-400/20 text-rose-300"
                  : guild.enabled
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "bg-white/8 text-[var(--ad-muted)]"
              }`}
            >
              {guild.lockdownActive ? "LOCKDOWN" : guild.enabled ? "봇 ON" : "봇 OFF"}
            </span>
            {SAVEABLE.includes(tab) ? (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveGuild({
                    ...guild,
                    protectedUserIds: protectedUsersText
                      .split(/[\n,\s]+/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="vx-btn-press inline-flex items-center gap-1.5 rounded-xl bg-rose-400 px-3.5 py-2 text-xs font-bold text-[#1a0508] disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                저장
              </button>
            ) : null}
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
                      badge="Security Overview"
                      value={guild.guildName}
                      hint={`방어 스코어 · ${defenseScore}/9 · 서버 ID ${guildId}`}
                      stats={[
                        { label: "레이드", value: guild.antiRaidEnabled ? "ON" : "OFF" },
                        { label: "도배", value: guild.antiMessageFlood ? "ON" : "OFF" },
                        { label: "안티누크", value: guild.antiNukeEnabled ? "ON" : "OFF" },
                        { label: "락다운", value: guild.lockdownActive ? "활성" : "해제" },
                      ]}
                    >
                      <ToggleRow
                        checked={guild.enabled}
                        onChange={(v) => setGuild({ ...guild, enabled: v })}
                        label="보안봇 활성화"
                        hint="꺼지면 자동 방어가 중단됩니다"
                      />
                    </AdminHero>
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-3">
                    <AdminStat className="h-full" label="보안 로그" value={events.length} tone="ok" />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-4">
                    <AdminStat
                      className="h-full"
                      label="레이드 임계"
                      value={`${guild.raidJoinThreshold}/${guild.raidWindowSeconds}s`}
                    />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-3">
                    <AdminStat
                      className="h-full"
                      label="신규계정"
                      value={guild.minAccountAgeHours > 0 ? `${guild.minAccountAgeHours}h` : "OFF"}
                    />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-3">
                    <AdminStat
                      className="h-full"
                      label="방어 스코어"
                      value={`${defenseScore}/9`}
                      tone="ok"
                    />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-6">
                    <AdminPane title="명령 · 동기화" className="h-full">
                      <ul className="space-y-1 text-sm text-[var(--ad-muted)]">
                        <li>
                          <code className="text-rose-300">/킥 · /밴 · /뮤트 · /경고</code>
                        </li>
                        <li>
                          <code className="text-rose-300">/밴 … 기간분</code> — 임시밴 (만료 자동 언밴)
                        </li>
                        <li>
                          <code className="text-rose-300">/스냅샷 · /스냅샷목록 · /보안리포트</code>
                        </li>
                        <li>
                          <code className="text-rose-300">/슬로우모드 · /닉네임초기화 · /유저정보 · /경고목록</code>
                        </li>
                        <li>
                          <code className="text-rose-300">/락다운 · /언락 · /오토모드동기화</code>
                        </li>
                      </ul>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void syncAutomod()}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--ad-border)] px-3 py-2 text-sm text-[var(--ad-muted)] hover:border-rose-400/30 hover:bg-white/5"
                      >
                        <RefreshCw className="size-4" /> AutoMod 지금 동기화
                      </button>
                    </AdminPane>
                  </motion.div>
                </motion.div>
              ) : null}

              {tab === "raid" && guild ? (
                <div className="space-y-5">
                  <AdminPane title="레이드 방지">
                      <SectionNote>
                        단시간에 많은 유저가 들어오면 자동으로 락다운·킥·밴·격리를 적용합니다.
                      </SectionNote>
                      <div className="space-y-3">
                        <ToggleRow
                          checked={guild.antiRaidEnabled}
                          onChange={(v) => setGuild({ ...guild, antiRaidEnabled: v })}
                          label="레이드 방지"
                          hint="단시간 대량 입장 시 자동 조치"
                        />
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <Field label="입장 임계">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.raidJoinThreshold}
                              onChange={(e) =>
                                setGuild({ ...guild, raidJoinThreshold: Number(e.target.value) || 8 })
                              }
                            />
                          </Field>
                          <Field label="창(초)">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.raidWindowSeconds}
                              onChange={(e) =>
                                setGuild({ ...guild, raidWindowSeconds: Number(e.target.value) || 20 })
                              }
                            />
                          </Field>
                          <Field label="조치">
                            <select
                              className={inputCls}
                              value={guild.raidAction}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  raidAction: e.target.value as Guild["raidAction"],
                                })
                              }
                            >
                              <option value="lockdown">락다운</option>
                              <option value="kick">킥</option>
                              <option value="ban">밴</option>
                              <option value="quarantine">격리 역할</option>
                            </select>
                          </Field>
                          <Field label="레이드 슬로우모드(초)">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.raidSlowmodeSeconds}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  raidSlowmodeSeconds: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </Field>
                        </div>
                        <ToggleRow
                          checked={guild.raidAlertOnly}
                          onChange={(v) => setGuild({ ...guild, raidAlertOnly: v })}
                          label="알림만 (조치 안 함)"
                        />
                      </div>
                    </AdminPane>
                    <AdminPane title="테러 · 안티누크">
                      <SectionNote>
                        채널 삭제·밴이 폭주하면 감사 로그로 실행자를 추적하고 락다운합니다.
                      </SectionNote>
                      <div className="space-y-3">
                        <ToggleRow
                          checked={guild.antiNukeEnabled}
                          onChange={(v) => setGuild({ ...guild, antiNukeEnabled: v })}
                          label="테러 / 안티누크"
                          hint="채널 삭제·밴 폭주 시 락다운"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="누크 임계">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.nukeThreshold}
                              onChange={(e) =>
                                setGuild({ ...guild, nukeThreshold: Number(e.target.value) || 3 })
                              }
                            />
                          </Field>
                          <Field label="누크 창(초)">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.nukeWindowSeconds}
                              onChange={(e) =>
                                setGuild({ ...guild, nukeWindowSeconds: Number(e.target.value) || 30 })
                              }
                            />
                          </Field>
                        </div>
                        <ToggleRow
                          checked={guild.stripDangerousOnNuke}
                          onChange={(v) => setGuild({ ...guild, stripDangerousOnNuke: v })}
                          label="누크 시 행위자 타임아웃"
                        />
                      </div>
                    </AdminPane>
                    <AdminPane title="관리자 권한 보호">
                      <div className="space-y-3">
                        <ToggleRow
                          checked={guild.stripDangerousPerms !== false}
                          onChange={(v) => setGuild({ ...guild, stripDangerousPerms: v })}
                          label="위험 권한 자동 회수"
                          hint="신뢰 역할 외 Administrator / Manage Roles 즉시 제거"
                        />
                        <ToggleRow
                          checked={guild.protectAdminRoles}
                          onChange={(v) => setGuild({ ...guild, protectAdminRoles: v })}
                          label="관리자 접근 감시 로그"
                          hint="신뢰 역할 외 관리자 권한 부여를 로그에 남김"
                        />
                      </div>
                    </AdminPane>
                </div>
              ) : null}

              {tab === "spam" && guild ? (
                <>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="멘션 · @everyone" className="">
                      <SectionNote>@everyone / @here 및 멘션 스팸을 차단합니다.</SectionNote>
                      <div className="space-y-3">
                        <ToggleRow
                          checked={guild.blockEveryoneHere}
                          onChange={(v) => setGuild({ ...guild, blockEveryoneHere: v })}
                          label="@everyone / @here 차단"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="멘션 스팸 한도">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.mentionSpamLimit}
                              onChange={(e) =>
                                setGuild({ ...guild, mentionSpamLimit: Number(e.target.value) || 5 })
                              }
                            />
                          </Field>
                          <Field label="멘션 스팸 조치">
                            <select
                              className={inputCls}
                              value={guild.mentionSpamAction}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  mentionSpamAction: e.target.value as Guild["mentionSpamAction"],
                                })
                              }
                            >
                              <option value="delete">삭제</option>
                              <option value="timeout">타임아웃</option>
                              <option value="kick">킥</option>
                            </select>
                          </Field>
                        </div>
                      </div>
                    </AdminPane>
                  </motion.div>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="메시지 도배" className="">
                      <div className="space-y-3">
                        <ToggleRow
                          checked={guild.antiMessageFlood}
                          onChange={(v) => setGuild({ ...guild, antiMessageFlood: v })}
                          label="메시지 도배 방지"
                          hint="단시간 다수 메시지"
                        />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="도배 한도">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.messageFloodLimit}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  messageFloodLimit: Number(e.target.value) || 8,
                                })
                              }
                            />
                          </Field>
                          <Field label="도배 창(초)">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.messageFloodWindowSeconds}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  messageFloodWindowSeconds: Number(e.target.value) || 5,
                                })
                              }
                            />
                          </Field>
                          <Field label="도배 조치">
                            <select
                              className={inputCls}
                              value={guild.messageFloodAction}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  messageFloodAction: e.target.value as Guild["messageFloodAction"],
                                })
                              }
                            >
                              <option value="timeout">타임아웃</option>
                              <option value="kick">킥</option>
                              <option value="delete">삭제만</option>
                            </select>
                          </Field>
                        </div>
                      </div>
                    </AdminPane>
                  </motion.div>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="링크 · 스캠 (AutoMod)" className="">
                      <div className="space-y-3">
                        <ToggleRow
                          checked={guild.antiInviteSpam}
                          onChange={(v) => setGuild({ ...guild, antiInviteSpam: v })}
                          label="초대 링크 스팸 차단"
                        />
                        <ToggleRow
                          checked={guild.antiLinkSpam}
                          onChange={(v) => setGuild({ ...guild, antiLinkSpam: v })}
                          label="외부 링크 차단 (AutoMod)"
                        />
                        <ToggleRow
                          checked={guild.antiScamKeywords}
                          onChange={(v) => setGuild({ ...guild, antiScamKeywords: v })}
                          label="스캠 키워드 차단"
                          hint="무료 니트로·에어드랍 등"
                        />
                      </div>
                    </AdminPane>
                  </motion.div>
                </>
              ) : null}

              {tab === "join" && guild ? (
                <motion.div variants={fadeUp}>
                  <AdminPane title="가입 · 계정 필터" className="">
                    <SectionNote>
                      너무 새로운 계정이나 기본 아바타 가입을 막을 수 있습니다. 게이트웨이 필요.
                    </SectionNote>
                    <div className="space-y-3">
                      <p className="inline-flex items-center gap-2 text-xs text-rose-300/80">
                        <Zap className="size-3.5" /> 신규·아바타 필터
                      </p>
                      <Field label="최소 계정 나이(시간, 0=끔)">
                        <input
                          type="number"
                          className={inputCls}
                          value={guild.minAccountAgeHours}
                          onChange={(e) =>
                            setGuild({
                              ...guild,
                              minAccountAgeHours: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </Field>
                      <ToggleRow
                        checked={guild.blockDefaultAvatars}
                        onChange={(v) => setGuild({ ...guild, blockDefaultAvatars: v })}
                        label="기본 아바타 가입 차단"
                      />
                      <ToggleRow
                        checked={guild.enabled}
                        onChange={(v) => setGuild({ ...guild, enabled: v })}
                        label="보안봇 사용"
                      />
                    </div>
                  </AdminPane>
                </motion.div>
              ) : null}

              {tab === "warn" && guild ? (
                <>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="경고 자동 처분" className="">
                      <SectionNote>
                        경고가 임계에 도달하면 뮤트·킥·밴을 자동 실행합니다. `/경고` 명령과 연동됩니다.
                      </SectionNote>
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="경고 임계 (0=끔)">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.warnThreshold ?? 3}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  warnThreshold: Number(e.target.value) || 0,
                                })
                              }
                            />
                          </Field>
                          <Field label="자동 조치">
                            <select
                              className={inputCls}
                              value={guild.warnAction || "mute"}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  warnAction: e.target.value as Guild["warnAction"],
                                })
                              }
                            >
                              <option value="mute">뮤트</option>
                              <option value="kick">킥</option>
                              <option value="ban">밴</option>
                            </select>
                          </Field>
                          <Field label="뮤트 분">
                            <input
                              type="number"
                              className={inputCls}
                              value={guild.warnMuteMinutes ?? 60}
                              onChange={(e) =>
                                setGuild({
                                  ...guild,
                                  warnMuteMinutes: Number(e.target.value) || 60,
                                })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    </AdminPane>
                  </motion.div>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="리포트 · 스냅샷 예약" className="">
                      <div className="space-y-3">
                        <ToggleRow
                          checked={guild.weeklyReportEnabled !== false}
                          onChange={(v) => setGuild({ ...guild, weeklyReportEnabled: v })}
                          label="주간 보안 리포트"
                          hint="로그 채널로 7일 요약 자동 전송"
                        />
                        <ToggleRow
                          checked={guild.autoSnapshotEnabled !== false}
                          onChange={(v) => setGuild({ ...guild, autoSnapshotEnabled: v })}
                          label="주간 자동 스냅샷"
                          hint="채널·역할 구조 백업"
                        />
                      </div>
                    </AdminPane>
                  </motion.div>
                </>
              ) : null}

              {tab === "roles" && guild ? (
                <>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="로그 · 알림 채널" className="">
                      <SectionNote>보안 이벤트와 레이드 알림이 올라갈 채널·역할을 지정합니다.</SectionNote>
                      <div className="space-y-4">
                        <Field label="보안 로그 채널">
                          <select
                            className={inputCls}
                            value={guild.logChannelId || ""}
                            onChange={(e) =>
                              setGuild({ ...guild, logChannelId: e.target.value || null })
                            }
                          >
                            <option value="">없음</option>
                            {channels.map((c) => (
                              <option key={c.id} value={c.id}>
                                #{c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="알림 멘션 역할 (레이드/누크)">
                          <select
                            className={inputCls}
                            value={guild.alertRoleId || ""}
                            onChange={(e) =>
                              setGuild({ ...guild, alertRoleId: e.target.value || null })
                            }
                          >
                            <option value="">없음</option>
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="격리(쿼런틴) 역할">
                          <select
                            className={inputCls}
                            value={guild.quarantineRoleId || ""}
                            onChange={(e) =>
                              setGuild({ ...guild, quarantineRoleId: e.target.value || null })
                            }
                          >
                            <option value="">없음</option>
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </AdminPane>
                  </motion.div>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="모더 · 보호 역할" className="">
                      <div className="space-y-4">
                        <RoleChecklist
                          label="모더레이터 역할 (킥/밴 등)"
                          roles={roles}
                          selected={guild.modRoleIds}
                          onChange={(modRoleIds) => setGuild({ ...guild, modRoleIds })}
                        />
                        <RoleChecklist
                          label="보호 역할 (킥/밴 불가)"
                          roles={roles}
                          selected={guild.protectedRoleIds}
                          onChange={(protectedRoleIds) => setGuild({ ...guild, protectedRoleIds })}
                        />
                        <RoleChecklist
                          label="신뢰 관리자 역할"
                          roles={roles}
                          selected={guild.trustedAdminRoleIds}
                          onChange={(trustedAdminRoleIds) =>
                            setGuild({ ...guild, trustedAdminRoleIds })
                          }
                        />
                        <Field label="보호 유저 ID (줄바꿈)">
                          <textarea
                            className={`${inputCls} min-h-24 font-mono text-xs`}
                            value={protectedUsersText}
                            onChange={(e) => setProtectedUsersText(e.target.value)}
                          />
                        </Field>
                      </div>
                    </AdminPane>
                  </motion.div>
                </>
              ) : null}

              {tab === "whitelist" && guild ? (
                <>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="화이트리스트 역할" className="">
                      <SectionNote>
                        선택한 역할은 도배·@everyone·초대 링크 검사에서 제외됩니다. 모더 역할도 기본
                        제외됩니다.
                      </SectionNote>
                      <RoleChecklist
                        label="제외할 역할"
                        roles={roles}
                        selected={guild.whitelistRoleIds || []}
                        onChange={(whitelistRoleIds) => setGuild({ ...guild, whitelistRoleIds })}
                      />
                    </AdminPane>
                  </motion.div>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="화이트리스트 채널" className="">
                      <SectionNote>광고·링크가 허용되는 채널을 지정하세요.</SectionNote>
                      <div className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-[var(--ad-border)] p-3">
                        {channels.map((c) => {
                          const on = (guild.whitelistChannelIds || []).includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--ad-text)] hover:bg-white/5"
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setGuild({
                                    ...guild,
                                    whitelistChannelIds: on
                                      ? (guild.whitelistChannelIds || []).filter((id) => id !== c.id)
                                      : [...(guild.whitelistChannelIds || []), c.id],
                                  })
                                }
                              />
                              #{c.name}
                            </label>
                          );
                        })}
                      </div>
                    </AdminPane>
                  </motion.div>
                </>
              ) : null}

              {tab === "backup" && guild ? (
                <>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="스냅샷 백업" className="">
                      <SectionNote>
                        Discord에서 <code className="text-rose-300">/스냅샷</code> 으로 즉시 저장할 수
                        있고, 주간 자동 백업은 경고·리포트 탭에서 켭니다.
                      </SectionNote>
                      {snapshots.length === 0 ? (
                        <p className="text-sm text-[var(--ad-muted)]">저장된 스냅샷이 없어요.</p>
                      ) : (
                        <ul className="space-y-2">
                          {snapshots.map((s) => (
                            <li
                              key={s.id}
                              className="rounded-2xl border border-[var(--ad-border)] px-3 py-2.5 text-sm"
                            >
                              <span className="font-medium text-[var(--ad-text)]">{s.label}</span>
                              <span className="text-[var(--ad-muted)]">
                                {" "}
                                · 채널 {s.channelCount} / 역할 {s.roleCount} ·{" "}
                                {new Date(s.createdAt).toLocaleString("ko-KR")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </AdminPane>
                  </motion.div>
                  <motion.div variants={fadeUp}>
                    <AdminPane title="임시밴" className="">
                      <SectionNote>
                        <code className="text-rose-300">/밴 … 기간분</code> 으로 걸린 임시밴입니다. 만료
                        시 자동 언밴됩니다.
                      </SectionNote>
                      {tempBans.length === 0 ? (
                        <p className="text-sm text-[var(--ad-muted)]">진행 중인 임시밴이 없어요.</p>
                      ) : (
                        <ul className="space-y-2">
                          {tempBans.map((b) => (
                            <li
                              key={b.id}
                              className="rounded-2xl border border-[var(--ad-border)] px-3 py-2.5 text-sm text-[var(--ad-muted)]"
                            >
                              <code className="text-[var(--ad-text)]">{b.userId}</code> · ~{" "}
                              {new Date(b.expiresAt).toLocaleString("ko-KR")}
                              {b.reason ? ` · ${b.reason}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </AdminPane>
                  </motion.div>
                </>
              ) : null}

              {tab === "logs" ? (
                <motion.div variants={fadeUp}>
                  <AdminPane title="보안 이벤트" className="">
                    <div className="space-y-2">
                      {events.length === 0 ? (
                        <p className="text-sm text-[var(--ad-muted)]">기록이 없어요.</p>
                      ) : (
                        events.map((e, i) => (
                          <motion.div
                            key={e.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i, 12) * 0.03, ease: verifyEase }}
                            className="rounded-2xl border border-[var(--ad-border)] px-3 py-2.5 hover:border-rose-400/20"
                          >
                            <p className="text-sm text-[var(--ad-text)]">
                              <span className="font-semibold text-rose-300">{e.type}</span>
                              {e.targetName ? ` · ${e.targetName}` : ""}
                              {" — "}
                              {e.detail}
                            </p>
                            <p className="text-xs text-[var(--ad-muted)]">
                              {e.actorName || "system"} ·{" "}
                              {new Date(e.createdAt).toLocaleString("ko-KR")}
                            </p>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </AdminPane>
                </motion.div>
              ) : null}

              {tab === "audit" ? (
                <motion.div variants={fadeUp}>
                  <AdminPane title="설정 감사" className="">
                    <div className="space-y-2">
                      {audits.length === 0 ? (
                        <p className="text-sm text-[var(--ad-muted)]">기록이 없어요.</p>
                      ) : (
                        audits.map((a, i) => (
                          <motion.div
                            key={a.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i, 12) * 0.03, ease: verifyEase }}
                            className="rounded-2xl border border-[var(--ad-border)] px-3 py-2.5"
                          >
                            <p className="text-sm text-[var(--ad-text)]">
                              <span className="font-medium">{a.action}</span> · {a.detail}
                            </p>
                            <p className="text-xs text-[var(--ad-muted)]">
                              {a.actor} · {new Date(a.createdAt).toLocaleString("ko-KR")}
                            </p>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </AdminPane>
                </motion.div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function RoleChecklist({
  label,
  roles,
  selected,
  onChange,
}: {
  label: string;
  roles: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ad-muted)]">
        {label}
      </p>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-2xl border border-[var(--ad-border)] p-3">
        {roles.map((r) => {
          const on = selected.includes(r.id);
          return (
            <label
              key={r.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--ad-text)] hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  onChange(on ? selected.filter((id) => id !== r.id) : [...selected, r.id])
                }
              />
              {r.name}
            </label>
          );
        })}
      </div>
    </div>
  );
}
