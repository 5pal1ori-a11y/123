"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Paperclip,
  Plus,
  Save,
  Send,
  Settings2,
  ScrollText,
  Star,
  Ticket,
  Trash2,
  Wand2,
  X,
  History,
  ExternalLink,
  Inbox,
  Clock3,
} from "lucide-react";
import { AdminHero, AdminPane, AdminStat } from "@/components/admin/admin-bento";
import { PanelSetupCredentials } from "@/components/panel-setup-credentials";
import { fadeUp, stagger, verifyEase } from "@/components/verify/verify-motion";
import {
  TicketRichContent,
  ticketListLabels,
} from "@/components/ticket/ticket-rich-content";

type Tab =
  | "overview"
  | "topics"
  | "settings"
  | "macros"
  | "blacklist"
  | "open"
  | "transcripts"
  | "audit";

type Topic = {
  id: string;
  name: string;
  description: string;
  emoji: string | null;
};

type Macro = {
  id: string;
  label: string;
  body: string;
  shortcut: string | null;
};

type Guild = {
  guildId: string;
  guildName: string;
  enabled: boolean;
  ticketCategoryId: string | null;
  closeRoleIds: string[];
  mentionRoleIds: string[];
  logChannelId: string | null;
  panelTitle: string;
  panelDescription: string;
  panelColor: number;
  panelBannerUrl: string | null;
  openEmbedTitle: string;
  openEmbedBody: string;
  topics: Topic[];
  blacklistUserIds: string[];
  macros: Macro[];
  linkedShopSlug: string | null;
};

type TicketRow = {
  id: string;
  channelId: string;
  topicName: string;
  openerId: string;
  openerName: string;
  openerNameSlug: string;
  userTicketIndex: number;
  createdAt: string;
  status: string;
};

type TranscriptRow = {
  id: string;
  openerName: string;
  openerNameSlug: string;
  index: number;
  topicName: string;
  closedAt: string;
  closeReason?: string | null;
  csat?: number | null;
  url: string;
};

type Msg = {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string;
  bot: boolean;
  attachments: { filename: string; url: string }[];
};

type Stats = {
  todayOpened: number;
  openCount: number;
  avgFirstReplyMinutes: number | null;
  avgCsat: number | null;
  csatCount: number;
};

type Audit = {
  id: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
};

type LinkedShop = {
  id: string;
  slug: string;
  name: string;
  discordGuildId: string | null;
  orderCount: number;
  userCount: number;
  totalPoints: number;
  recentOrders: {
    id: string;
    productId: string;
    status: string;
    amount: number;
    createdAt: string;
  }[];
} | null;

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "overview", label: "대시보드", icon: LayoutDashboard, group: "홈" },
  { id: "topics", label: "주제", icon: Ticket, group: "설정" },
  { id: "settings", label: "티켓 설정", icon: Settings2, group: "설정" },
  { id: "macros", label: "매크로", icon: Wand2, group: "설정" },
  { id: "blacklist", label: "블랙리스트", icon: Ban, group: "설정" },
  { id: "open", label: "열린 티켓", icon: MessageSquare, group: "운영" },
  { id: "transcripts", label: "트랜스크립트", icon: ScrollText, group: "운영" },
  { id: "audit", label: "감사 로그", icon: History, group: "운영" },
];

const CLOSE_REASONS = [
  { id: "resolved", label: "해결됨" },
  { id: "spam", label: "스팸" },
  { id: "duplicate", label: "중복" },
  { id: "other", label: "기타" },
] as const;

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
      <span className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? "bg-sky-400" : "bg-white/15"}`}>
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </span>
    </button>
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
  "toss-admin-field w-full rounded-xl border border-[var(--ad-border)] bg-black/30 px-3 py-2.5 text-sm text-[var(--ad-text)] outline-none focus:border-sky-400/40";

const CLOSE_REASON_LABEL: Record<string, string> = {
  resolved: "해결됨",
  spam: "스팸",
  duplicate: "중복",
  other: "기타",
};

function formatRelativeKo(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "-";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

function initials(name: string) {
  const s = name.trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

function CsatDots({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`CSAT ${value}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`size-3 ${n <= value ? "fill-amber-300 text-amber-300" : "text-white/20"}`}
        />
      ))}
    </span>
  );
}

export function TicketPanelClient({ guildId }: { guildId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [guildNameHint, setGuildNameHint] = useState("");
  const [guild, setGuild] = useState<Guild | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string; type: number }[]>([]);
  const [openTickets, setOpenTickets] = useState<TicketRow[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [linkedShop, setLinkedShop] = useState<LinkedShop>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);
  const [closeReason, setCloseReason] = useState<(typeof CLOSE_REASONS)[number]["id"]>("resolved");
  const [closeCsat, setCloseCsat] = useState<number | "">("");
  const [blacklistDraft, setBlacklistDraft] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/ticket/${guildId}`);
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
      setCategories(data.categories || []);
      setChannels(data.channels || []);
      setOpenTickets(data.openTickets || []);
      setTranscripts(data.transcripts || []);
      setStats(data.stats || null);
      setAudits(data.audits || []);
      setLinkedShop(data.linkedShop || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keyboard shortcuts: Ctrl+1..9 macros, Ctrl+N focus reply when on open tab
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!guild || !(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key.toLowerCase() === "n" && tab === "open" && activeTicketId) {
        if (typing && target?.tagName === "TEXTAREA") return;
        e.preventDefault();
        document.getElementById("ticket-reply-input")?.focus();
        return;
      }
      if (tab !== "open" || !activeTicketId) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const macro = guild.macros.find((m) => m.shortcut === e.key);
      if (!macro) return;
      e.preventDefault();
      void sendReply(macro.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guild, tab, activeTicketId, reply]);

  async function logout() {
    await fetch(`/api/ticket/${guildId}`, {
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
      const res = await fetch(`/api/ticket/${guildId}`, {
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

  async function loadMessages(ticketId: string) {
    setActiveTicketId(ticketId);
    setMsgBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ticket/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "messages", ticketId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "메시지 로드 실패");
      setMessages(data.messages || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "메시지 로드 실패");
    } finally {
      setMsgBusy(false);
    }
  }

  async function sendReply(macroId?: string) {
    if (!activeTicketId) return;
    if (!macroId && !reply.trim()) return;
    setMsgBusy(true);
    try {
      const res = await fetch(`/api/ticket/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          ticketId: activeTicketId,
          content: reply.trim() || " ",
          ...(macroId ? { macroId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "전송 실패");
      setMessages(data.messages || []);
      setReply("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setMsgBusy(false);
    }
  }

  async function closeTicket(ticketId: string) {
    if (!confirm("이 티켓을 닫고 트랜스크립트를 저장할까요?")) return;
    setMsgBusy(true);
    try {
      const res = await fetch(`/api/ticket/${guildId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          ticketId,
          closeReason,
          ...(closeCsat ? { csat: closeCsat } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "닫기 실패");
      setActiveTicketId(null);
      setMessages([]);
      await load();
      if (data.url) window.open(data.url, "_blank");
      setMsg("티켓이 닫혔어요");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "닫기 실패");
    } finally {
      setMsgBusy(false);
    }
  }

  const textChannels = useMemo(
    () => channels.filter((c) => c.type === 0 || c.type === 5),
    [channels],
  );

  const saveableTabs: Tab[] = ["topics", "settings", "macros", "blacklist", "overview"];

  function handleTopSave() {
    if (!guild) return;
    if (tab === "topics") void saveGuild({ topics: guild.topics });
    else if (tab === "macros") void saveGuild({ macros: guild.macros });
    else if (tab === "blacklist") void saveGuild({ blacklistUserIds: guild.blacklistUserIds });
    else
      void saveGuild({
        enabled: guild.enabled,
        ticketCategoryId: guild.ticketCategoryId,
        closeRoleIds: guild.closeRoleIds,
        mentionRoleIds: guild.mentionRoleIds,
        logChannelId: guild.logChannelId,
        panelTitle: guild.panelTitle,
        panelDescription: guild.panelDescription,
        panelBannerUrl: guild.panelBannerUrl,
        openEmbedTitle: guild.openEmbedTitle,
        openEmbedBody: guild.openEmbedBody,
        linkedShopSlug: guild.linkedShopSlug,
      });
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
            <Loader2 className="size-7 text-sky-300/80" />
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
            <span className="flex size-11 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-200">
              <Ticket className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/70">
                DOES Ticket
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
              window.location.href = "/api/ticket/oauth/start";
            }}
            className="vx-btn-press mt-2 flex w-full items-center justify-center rounded-xl bg-sky-400 py-2.5 text-sm font-semibold text-[#061018]"
          >
            Discord로 로그인
          </button>
        </motion.div>
      </div>
    );
  }

  const groups = [...new Set(NAV.map((n) => n.group))];
  const tabMeta = NAV.find((n) => n.id === tab);

  return (
    <div className="admin-shell relative flex h-dvh max-h-dvh overflow-hidden" data-theme="dark">
      <PanelSetupCredentials product="ticket" accentClass="bg-sky-400 text-[#041018]" />
      <motion.div
        className="pointer-events-none absolute -right-24 top-0 size-80 rounded-full bg-sky-500/10 blur-3xl"
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
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300"
            whileHover={{ rotate: -8, scale: 1.05 }}
          >
            <Ticket className="size-4" />
          </motion.span>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300/70">
                Ticket
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
                          layoutId="ticket-nav-pill"
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
            {saveableTabs.includes(tab) ? (
              <button
                type="button"
                onClick={() => handleTopSave()}
                disabled={saving}
                className="vx-btn-press inline-flex items-center gap-1.5 rounded-xl bg-sky-400 px-3.5 py-2 text-xs font-bold text-[#061018] disabled:opacity-50"
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
                    badge="Ticket Overview"
                    value={guild.guildName}
                    hint={`서버 ID ${guildId}`}
                    stats={[
                      { label: "오늘 오픈", value: String(stats?.todayOpened ?? 0) },
                      { label: "열린 티켓", value: String(stats?.openCount ?? openTickets.length) },
                      {
                        label: "평균 첫응답",
                        value:
                          stats?.avgFirstReplyMinutes != null
                            ? `${stats.avgFirstReplyMinutes}분`
                            : "-",
                      },
                      {
                        label: "평균 CSAT",
                        value: stats?.avgCsat != null ? `${stats.avgCsat}/5` : "-",
                      },
                    ]}
                  >
                    <ToggleRow
                      checked={guild.enabled}
                      onChange={(v) => setGuild({ ...guild, enabled: v })}
                      label="티켓봇 활성화"
                      hint="꺼지면 새 티켓 생성이 중단됩니다"
                    />
                  </AdminHero>
                </motion.div>
                <motion.div variants={fadeUp} className="lg:col-span-3">
                  <AdminStat
                    className="h-full"
                    label="오늘 오픈"
                    value={stats?.todayOpened ?? 0}
                    tone="ok"
                  />
                </motion.div>
                <motion.div variants={fadeUp} className="lg:col-span-4">
                  <AdminStat
                    className="h-full"
                    label="열린 티켓"
                    value={stats?.openCount ?? openTickets.length}
                  />
                </motion.div>
                <motion.div variants={fadeUp} className="lg:col-span-3">
                  <AdminStat
                    className="h-full"
                    label="평균 첫응답"
                    value={
                      stats?.avgFirstReplyMinutes != null ? `${stats.avgFirstReplyMinutes}분` : "-"
                    }
                  />
                </motion.div>
                <motion.div variants={fadeUp} className="lg:col-span-3">
                  <AdminStat
                    className="h-full"
                    label="평균 CSAT"
                    value={stats?.avgCsat != null ? `${stats.avgCsat}/5` : "-"}
                  />
                </motion.div>
                <motion.div variants={fadeUp} className="lg:col-span-6">
                  <AdminPane title="패널 미리보기" className="h-full">
                    <p className="mb-3 text-sm text-[var(--ad-muted)]">
                      Discord `/티켓패널`에 가까운 미리보기입니다
                    </p>
                    <div
                      className="overflow-hidden rounded-2xl border border-[var(--ad-border)]"
                      style={{
                        background: `linear-gradient(160deg, rgba(${(guild.panelColor >> 16) & 255},${(guild.panelColor >> 8) & 255},${guild.panelColor & 255},0.18), rgba(0,0,0,0.45))`,
                      }}
                    >
                      {guild.panelBannerUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={guild.panelBannerUrl}
                          alt=""
                          className="max-h-40 w-full object-cover"
                        />
                      ) : null}
                      <div className="space-y-3 p-4">
                        <h3 className="text-lg font-bold text-[var(--ad-text)]">{guild.panelTitle}</h3>
                        <p className="whitespace-pre-wrap text-sm text-[var(--ad-muted)]">
                          {guild.panelDescription}
                        </p>
                        <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-[var(--ad-muted)]">
                          주제를 선택하세요
                          <ul className="mt-2 space-y-1">
                            {guild.topics.map((t) => (
                              <li key={t.id} className="text-[var(--ad-text)]">
                                · {t.name}
                                {t.description ? (
                                  <span className="text-[var(--ad-muted)]"> — {t.description}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </AdminPane>
                </motion.div>
                <motion.div variants={fadeUp} className="lg:col-span-12">
                  <AdminPane title="연동 상점" className="h-full">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Field label="샵 슬러그 (선택)">
                        <input
                          className={inputCls}
                          value={guild.linkedShopSlug || ""}
                          onChange={(e) =>
                            setGuild({ ...guild, linkedShopSlug: e.target.value || null })
                          }
                          placeholder="비우면 discordGuildId로 자동 매칭"
                        />
                      </Field>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ad-border)] px-3 py-2.5 text-sm text-[var(--ad-muted)] hover:bg-white/5"
                        onClick={() => void saveGuild({ linkedShopSlug: guild.linkedShopSlug })}
                      >
                        <Link2 className="size-4" /> 연동 저장
                      </button>
                    </div>
                    {linkedShop ? (
                      <div className="space-y-3">
                        <p className="text-sm text-[var(--ad-text)]">
                          <span className="font-semibold">{linkedShop.name}</span>{" "}
                          <span className="text-[var(--ad-muted)]">({linkedShop.slug})</span>
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <AdminStat label="주문" value={linkedShop.orderCount} className="" />
                          <AdminStat label="회원" value={linkedShop.userCount} className="" />
                          <AdminStat
                            label="포인트 합"
                            value={linkedShop.totalPoints.toLocaleString("ko-KR")}
                            className=""
                          />
                        </div>
                        <div className="space-y-1">
                          {linkedShop.recentOrders.map((o) => (
                            <div
                              key={o.id}
                              className="flex justify-between gap-2 rounded-xl border border-[var(--ad-border)] px-3 py-2 text-xs"
                            >
                              <span className="truncate text-[var(--ad-text)]">{o.productId}</span>
                              <span className="shrink-0 text-[var(--ad-muted)]">
                                {o.status} · {o.amount.toLocaleString("ko-KR")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--ad-muted)]">
                        연결된 상점이 없어요. 슬러그를 넣거나 DOES 샵의 Discord 길드 ID를 맞춰 주세요.
                      </p>
                    )}
                  </AdminPane>
                </motion.div>
              </motion.div>
            ) : null}

            {tab === "topics" ? (
              <AdminPane title="주제 관리">
                <p className="mb-4 text-sm text-[var(--ad-muted)]">
                  `/티켓패널` 드롭다운에 표시됩니다
                </p>
                <div className="space-y-3">
                  {guild.topics.map((t, i) => (
                    <div
                      key={t.id}
                      className="grid gap-2 rounded-2xl border border-[var(--ad-border)] bg-[var(--ad-card)] p-3 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <input
                        className={inputCls}
                        value={t.name}
                        onChange={(e) => {
                          const topics = [...guild.topics];
                          topics[i] = { ...t, name: e.target.value };
                          setGuild({ ...guild, topics });
                        }}
                        placeholder="주제 이름"
                      />
                      <input
                        className={inputCls}
                        value={t.description}
                        onChange={(e) => {
                          const topics = [...guild.topics];
                          topics[i] = { ...t, description: e.target.value };
                          setGuild({ ...guild, topics });
                        }}
                        placeholder="설명"
                      />
                      <button
                        type="button"
                        className="admin-icon-btn"
                        onClick={() =>
                          setGuild({
                            ...guild,
                            topics: guild.topics.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--ad-border)] px-3 py-2 text-sm text-[var(--ad-muted)] hover:bg-white/5 hover:text-white"
                    onClick={() =>
                      setGuild({
                        ...guild,
                        topics: [
                          ...guild.topics,
                          {
                            id: `t${Date.now().toString(36)}`,
                            name: "새 주제",
                            description: "",
                            emoji: null,
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" /> 주제 추가
                  </button>
                </div>
              </AdminPane>
            ) : null}

            {tab === "settings" ? (
              <div className="space-y-4">
                <AdminPane title="채널 · 역할" className="">
                  <div className="space-y-4">
                    <Field label="티켓 생성 카테고리">
                      <select
                        className={inputCls}
                        value={guild.ticketCategoryId || ""}
                        onChange={(e) =>
                          setGuild({ ...guild, ticketCategoryId: e.target.value || null })
                        }
                      >
                        <option value="">선택</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="티켓 로그 채널">
                      <select
                        className={inputCls}
                        value={guild.logChannelId || ""}
                        onChange={(e) =>
                          setGuild({ ...guild, logChannelId: e.target.value || null })
                        }
                      >
                        <option value="">없음</option>
                        {textChannels.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ad-muted)]">
                        티켓 닫기 역할
                      </p>
                      <div className="max-h-44 space-y-1 overflow-y-auto rounded-2xl border border-[var(--ad-border)] p-3">
                        {roles.map((r) => {
                          const on = guild.closeRoleIds.includes(r.id);
                          return (
                            <label
                              key={r.id}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--ad-text)] hover:bg-white/5"
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => {
                                  const closeRoleIds = on
                                    ? guild.closeRoleIds.filter((id) => id !== r.id)
                                    : [...guild.closeRoleIds, r.id];
                                  setGuild({ ...guild, closeRoleIds });
                                }}
                              />
                              {r.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ad-muted)]">
                        오픈 시 멘션 역할
                      </p>
                      <div className="max-h-44 space-y-1 overflow-y-auto rounded-2xl border border-[var(--ad-border)] p-3">
                        {roles.map((r) => {
                          const on = guild.mentionRoleIds.includes(r.id);
                          return (
                            <label
                              key={`m-${r.id}`}
                              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--ad-text)] hover:bg-white/5"
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => {
                                  const mentionRoleIds = on
                                    ? guild.mentionRoleIds.filter((id) => id !== r.id)
                                    : [...guild.mentionRoleIds, r.id];
                                  setGuild({ ...guild, mentionRoleIds });
                                }}
                              />
                              {r.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <ToggleRow
                      checked={guild.enabled}
                      onChange={(v) => setGuild({ ...guild, enabled: v })}
                      label="티켓봇 사용"
                      hint="끄면 패널·생성이 중단됩니다"
                    />
                  </div>
                </AdminPane>
                <AdminPane title="패널 · 오픈 문구" className="">
                  <div className="space-y-4">
                    <Field label="패널 제목">
                      <input
                        className={inputCls}
                        value={guild.panelTitle}
                        onChange={(e) => setGuild({ ...guild, panelTitle: e.target.value })}
                      />
                    </Field>
                    <Field label="패널 설명">
                      <textarea
                        className={`${inputCls} min-h-24`}
                        value={guild.panelDescription}
                        onChange={(e) => setGuild({ ...guild, panelDescription: e.target.value })}
                      />
                    </Field>
                    <Field label="패널 배너 이미지 URL">
                      <input
                        className={inputCls}
                        value={guild.panelBannerUrl || ""}
                        onChange={(e) =>
                          setGuild({ ...guild, panelBannerUrl: e.target.value || null })
                        }
                        placeholder="https://..."
                      />
                    </Field>
                    <Field label="티켓 오픈 제목">
                      <input
                        className={inputCls}
                        value={guild.openEmbedTitle}
                        onChange={(e) => setGuild({ ...guild, openEmbedTitle: e.target.value })}
                      />
                    </Field>
                    <Field label="티켓 오픈 본문">
                      <textarea
                        className={`${inputCls} min-h-24`}
                        value={guild.openEmbedBody}
                        onChange={(e) => setGuild({ ...guild, openEmbedBody: e.target.value })}
                      />
                    </Field>
                  </div>
                </AdminPane>
              </div>
            ) : null}

            {tab === "macros" ? (
              <AdminPane title="답변 매크로" className="">
                <p className="mb-3 text-sm text-[var(--ad-muted)]">
                  변수: {"{user}"} {"{mention}"} {"{ticket}"} {"{topic}"} {"{channel}"} · 단축키
                  Ctrl+숫자
                </p>
                <div className="space-y-3">
                  {guild.macros.map((m, i) => (
                    <div
                      key={m.id}
                      className="space-y-2 rounded-2xl border border-[var(--ad-border)] bg-[var(--ad-card)] p-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-[1fr_80px_auto]">
                        <input
                          className={inputCls}
                          value={m.label}
                          onChange={(e) => {
                            const macros = [...guild.macros];
                            macros[i] = { ...m, label: e.target.value };
                            setGuild({ ...guild, macros });
                          }}
                          placeholder="라벨"
                        />
                        <input
                          className={inputCls}
                          value={m.shortcut || ""}
                          onChange={(e) => {
                            const macros = [...guild.macros];
                            macros[i] = {
                              ...m,
                              shortcut: e.target.value.replace(/\D/g, "").slice(0, 1) || null,
                            };
                            setGuild({ ...guild, macros });
                          }}
                          placeholder="1-9"
                        />
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() =>
                            setGuild({
                              ...guild,
                              macros: guild.macros.filter((_, j) => j !== i),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <textarea
                        className={`${inputCls} min-h-20`}
                        value={m.body}
                        onChange={(e) => {
                          const macros = [...guild.macros];
                          macros[i] = { ...m, body: e.target.value };
                          setGuild({ ...guild, macros });
                        }}
                        placeholder="안녕하세요 {mention}, ..."
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--ad-border)] px-3 py-2 text-sm text-[var(--ad-muted)] hover:bg-white/5"
                    onClick={() =>
                      setGuild({
                        ...guild,
                        macros: [
                          ...guild.macros,
                          {
                            id: `m${Date.now().toString(36)}`,
                            label: "새 매크로",
                            body: "안녕하세요 {mention}님, ",
                            shortcut: String((guild.macros.length % 9) + 1),
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="size-4" /> 매크로 추가
                  </button>
                </div>
              </AdminPane>
            ) : null}

            {tab === "blacklist" ? (
              <AdminPane title="블랙리스트" className="">
                <p className="mb-3 text-sm text-[var(--ad-muted)]">
                  Discord 유저 ID — 티켓 생성이 차단됩니다
                </p>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className={`${inputCls} flex-1`}
                    value={blacklistDraft}
                    onChange={(e) => setBlacklistDraft(e.target.value)}
                    placeholder="유저 ID"
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-sky-400 px-3 py-2 text-sm font-semibold text-[#061018]"
                    onClick={() => {
                      const id = blacklistDraft.trim();
                      if (!id) return;
                      if (guild.blacklistUserIds.includes(id)) return;
                      setGuild({
                        ...guild,
                        blacklistUserIds: [...guild.blacklistUserIds, id],
                      });
                      setBlacklistDraft("");
                    }}
                  >
                    추가
                  </button>
                </div>
                <div className="space-y-2">
                  {guild.blacklistUserIds.length === 0 ? (
                    <p className="text-sm text-[var(--ad-muted)]">등록된 ID가 없어요.</p>
                  ) : (
                    guild.blacklistUserIds.map((id) => (
                      <div
                        key={id}
                        className="flex items-center justify-between rounded-xl border border-[var(--ad-border)] px-3 py-2"
                      >
                        <code className="text-sm text-[var(--ad-text)]">{id}</code>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() =>
                            setGuild({
                              ...guild,
                              blacklistUserIds: guild.blacklistUserIds.filter((x) => x !== id),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </AdminPane>
            ) : null}

            {tab === "open" ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
                <section className="admin-bento flex flex-col overflow-hidden p-0">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--ad-border)] px-4 py-3.5">
                    <div>
                      <h3 className="text-[15px] font-extrabold tracking-tight">열린 티켓</h3>
                      <p className="mt-0.5 text-[11px] text-[var(--ad-muted)]">
                        선택 후 바로 답장 · Ctrl+N
                      </p>
                    </div>
                    <span className="rounded-full bg-sky-400/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-sky-200 ring-1 ring-sky-400/25">
                      {openTickets.length}
                    </span>
                  </div>
                  <div className="max-h-[min(42vh,22rem)] space-y-1.5 overflow-y-auto overscroll-contain p-2.5 lg:max-h-[min(70vh,36rem)]">
                    {openTickets.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300/80 ring-1 ring-sky-400/20">
                          <Inbox className="size-5" />
                        </span>
                        <p className="text-sm font-medium text-[var(--ad-text)]">열린 티켓이 없어요</p>
                        <p className="text-xs text-[var(--ad-muted)]">새 문의가 열리면 여기에 표시됩니다</p>
                      </div>
                    ) : (
                      openTickets.map((t) => {
                        const active = activeTicketId === t.id;
                        const labels = ticketListLabels(t.openerName, t.topicName);
                        return (
                          <motion.button
                            key={t.id}
                            type="button"
                            layout
                            whileHover={{ x: 2 }}
                            whileTap={{ scale: 0.985 }}
                            onClick={() => void loadMessages(t.id)}
                            className={`relative flex w-full items-start gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left transition ${
                              active
                                ? "bg-sky-400/12 ring-1 ring-sky-400/35"
                                : "hover:bg-white/[0.05]"
                            }`}
                          >
                            {active ? (
                              <motion.span
                                layoutId="open-ticket-active"
                                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-400"
                              />
                            ) : null}
                            <span
                              className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                                active
                                  ? "bg-sky-400 text-[#061018]"
                                  : "bg-white/10 text-[var(--ad-text)]"
                              }`}
                            >
                              {initials(labels.title)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-[var(--ad-text)]">
                                  {labels.title}
                                </span>
                                <span className="shrink-0 rounded-md bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-[var(--ad-muted)]">
                                  #{t.userTicketIndex}
                                </span>
                              </span>
                              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--ad-muted)]">
                                <span className="truncate rounded-md bg-sky-400/10 px-1.5 py-0.5 text-sky-200/90">
                                  {labels.meta}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5">
                                  <Clock3 className="size-3 opacity-60" />
                                  {formatRelativeKo(t.createdAt)}
                                </span>
                              </span>
                            </span>
                          </motion.button>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="admin-bento flex min-h-[min(32rem,70vh)] flex-col overflow-hidden p-0">
                  {!activeTicketId ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                      <span className="flex size-14 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/20">
                        <MessageSquare className="size-6" />
                      </span>
                      <div>
                        <p className="text-base font-semibold text-[var(--ad-text)]">티켓을 선택하세요</p>
                        <p className="mt-1.5 text-sm text-[var(--ad-muted)]">
                          왼쪽 목록에서 열어 · Ctrl+N 답장 · Ctrl+1~9 매크로
                        </p>
                      </div>
                    </div>
                  ) : (
                    (() => {
                      const activeTicket = openTickets.find((t) => t.id === activeTicketId);
                      const labels = activeTicket
                        ? ticketListLabels(activeTicket.openerName, activeTicket.topicName)
                        : null;
                      return (
                        <>
                          <div className="flex items-center justify-between gap-3 border-b border-[var(--ad-border)] px-4 py-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate text-[15px] font-extrabold tracking-tight">
                                  {labels?.title ?? "대화"}
                                </h3>
                                {labels?.meta ? (
                                  <span className="rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
                                    {labels.meta}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-[var(--ad-muted)]">
                                {activeTicket
                                  ? `#${activeTicket.userTicketIndex} · ${new Date(activeTicket.createdAt).toLocaleString("ko-KR")}`
                                  : "실시간 답장"}
                              </p>
                            </div>
                            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-400/12 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/25 sm:inline-flex">
                              <span className="size-1.5 rounded-full bg-emerald-400" />
                              OPEN
                            </span>
                          </div>

                          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.06),transparent_55%)] p-3 sm:p-4">
                            {msgBusy && !messages.length ? (
                              <div className="flex justify-center py-10">
                                <Loader2 className="size-5 animate-spin text-sky-300/70" />
                              </div>
                            ) : messages.length === 0 ? (
                              <p className="py-10 text-center text-sm text-[var(--ad-muted)]">
                                아직 메시지가 없어요
                              </p>
                            ) : (
                              messages.map((m) => (
                                <div
                                  key={m.id}
                                  className={`flex gap-2.5 ${m.bot ? "flex-row-reverse" : ""}`}
                                >
                                  {m.authorAvatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={m.authorAvatarUrl}
                                      alt=""
                                      className="size-8 shrink-0 rounded-full ring-1 ring-white/10"
                                    />
                                  ) : (
                                    <span
                                      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                        m.bot
                                          ? "bg-sky-400/25 text-sky-100"
                                          : "bg-white/12 text-[var(--ad-text)]"
                                      }`}
                                    >
                                      {initials(m.authorName)}
                                    </span>
                                  )}
                                  <div className={`min-w-0 max-w-[min(100%,28rem)] ${m.bot ? "items-end" : ""}`}>
                                    <p
                                      className={`mb-1 flex items-center gap-1.5 text-[10px] text-[var(--ad-muted)] ${
                                        m.bot ? "justify-end" : ""
                                      }`}
                                    >
                                      <span className="font-semibold text-[var(--ad-text)]/90">
                                        {m.authorName}
                                      </span>
                                      {m.bot ? (
                                        <span className="rounded bg-sky-400/20 px-1 py-px text-[9px] font-bold text-sky-200">
                                          BOT
                                        </span>
                                      ) : null}
                                      <span>{formatRelativeKo(m.createdAt)}</span>
                                    </p>
                                    <div
                                      className={`rounded-2xl px-3.5 py-2.5 ${
                                        m.bot
                                          ? "rounded-tr-md bg-sky-400/15 text-[var(--ad-text)] ring-1 ring-sky-400/20"
                                          : "rounded-tl-md bg-white/[0.07] text-[var(--ad-text)] ring-1 ring-white/10"
                                      }`}
                                    >
                                      <TicketRichContent content={m.content} />
                                      {m.attachments.length ? (
                                        <div className="mt-2 space-y-1">
                                          {m.attachments.map((a) => (
                                            <a
                                              key={a.url}
                                              href={a.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1.5 rounded-lg bg-black/25 px-2 py-1 text-[11px] text-sky-200 hover:bg-black/40"
                                            >
                                              <Paperclip className="size-3" />
                                              {a.filename}
                                            </a>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="border-t border-[var(--ad-border)] bg-black/20 p-3 sm:p-4">
                            {guild.macros.length ? (
                              <div className="mb-2.5 flex flex-wrap gap-1.5">
                                {guild.macros.map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    disabled={msgBusy}
                                    className="rounded-lg border border-sky-400/20 bg-sky-400/8 px-2 py-1 text-[11px] font-medium text-sky-100/90 transition hover:bg-sky-400/16 disabled:opacity-50"
                                    onClick={() => void sendReply(m.id)}
                                    title={m.shortcut ? `Ctrl+${m.shortcut}` : undefined}
                                  >
                                    {m.label}
                                    {m.shortcut ? (
                                      <span className="ml-1 opacity-50">⌃{m.shortcut}</span>
                                    ) : null}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            <div className="mb-2.5 grid gap-2 sm:grid-cols-2">
                              <Field label="종료 사유">
                                <select
                                  className={inputCls}
                                  value={closeReason}
                                  onChange={(e) =>
                                    setCloseReason(e.target.value as typeof closeReason)
                                  }
                                >
                                  {CLOSE_REASONS.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="CSAT (1~5)">
                                <select
                                  className={inputCls}
                                  value={closeCsat}
                                  onChange={(e) =>
                                    setCloseCsat(e.target.value ? Number(e.target.value) : "")
                                  }
                                >
                                  <option value="">없음</option>
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                              <input
                                id="ticket-reply-input"
                                className={`${inputCls} flex-1`}
                                value={reply}
                                onChange={(e) => setReply(e.target.value)}
                                placeholder="메시지 · {user}/{ticket} 사용 가능"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void sendReply();
                                  }
                                }}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={msgBusy}
                                  className="vx-btn-press inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-semibold text-[#061018] disabled:opacity-50 sm:flex-none"
                                  onClick={() => void sendReply()}
                                >
                                  <Send className="size-3.5" />
                                  전송
                                </button>
                                <button
                                  type="button"
                                  disabled={msgBusy}
                                  className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-500/18 disabled:opacity-50"
                                  onClick={() => void closeTicket(activeTicketId)}
                                >
                                  닫기
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()
                  )}
                </section>
              </div>
            ) : null}

            {tab === "transcripts" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold tracking-tight">트랜스크립트</h3>
                    <p className="mt-1 text-sm text-[var(--ad-muted)]">
                      닫힌 티켓 기록 · 클릭하면 전체 대화를 볼 수 있어요
                    </p>
                  </div>
                  <span className="rounded-full bg-white/8 px-2.5 py-1 font-mono text-[11px] text-[var(--ad-muted)] ring-1 ring-white/10">
                    {transcripts.length}건
                  </span>
                </div>

                {transcripts.length === 0 ? (
                  <section className="admin-bento flex flex-col items-center gap-3 px-6 py-16 text-center">
                    <span className="flex size-14 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/20">
                      <ScrollText className="size-6" />
                    </span>
                    <p className="text-base font-semibold text-[var(--ad-text)]">저장된 기록이 없어요</p>
                    <p className="text-sm text-[var(--ad-muted)]">티켓을 닫으면 여기에 아카이브됩니다</p>
                  </section>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {transcripts.map((t, i) => {
                      const reason = t.closeReason
                        ? CLOSE_REASON_LABEL[t.closeReason] || t.closeReason
                        : null;
                      const href = t.url || `/${guildId}/${t.openerNameSlug}/${t.index}`;
                      return (
                        <motion.a
                          key={t.id}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i * 0.03, 0.3) }}
                          whileHover={{ y: -3 }}
                          className="group relative flex flex-col overflow-hidden rounded-[1.25rem] border border-[var(--ad-border)] bg-gradient-to-b from-sky-500/[0.07] via-transparent to-transparent p-4 transition hover:border-sky-400/35"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="flex size-10 items-center justify-center rounded-2xl bg-sky-400/15 text-sm font-bold text-sky-100 ring-1 ring-sky-400/20">
                              {initials(t.openerName)}
                            </span>
                            <span className="flex size-8 items-center justify-center rounded-full bg-white/5 text-[var(--ad-muted)] ring-1 ring-white/10 transition group-hover:bg-sky-400/15 group-hover:text-sky-200">
                              <ExternalLink className="size-3.5" />
                            </span>
                          </div>
                          <p className="mt-3 truncate text-[15px] font-semibold tracking-tight text-[var(--ad-text)]">
                            {t.openerName}
                            <span className="ml-1.5 font-mono text-xs font-normal text-[var(--ad-muted)]">
                              #{t.index}
                            </span>
                          </p>
                          <p className="mt-1 truncate text-xs text-[var(--ad-muted)]">{t.topicName}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {reason ? (
                              <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-[var(--ad-muted)]">
                                {reason}
                              </span>
                            ) : null}
                            {t.csat != null ? <CsatDots value={t.csat} /> : null}
                          </div>
                          <p className="mt-auto pt-3 text-[11px] text-[var(--ad-muted)]">
                            {new Date(t.closedAt).toLocaleString("ko-KR")}
                            <span className="ml-1.5 opacity-70">· {formatRelativeKo(t.closedAt)}</span>
                          </p>
                        </motion.a>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "audit" ? (
              <AdminPane title="설정 감사 로그" className="">
                <div className="space-y-2">
                  {audits.length === 0 ? (
                    <p className="text-sm text-[var(--ad-muted)]">기록이 없어요.</p>
                  ) : (
                    audits.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-2xl border border-[var(--ad-border)] px-3 py-2.5"
                      >
                        <p className="text-sm text-[var(--ad-text)]">
                          <span className="font-medium">{a.action}</span> · {a.detail}
                        </p>
                        <p className="text-xs text-[var(--ad-muted)]">
                          {a.actor} · {new Date(a.createdAt).toLocaleString("ko-KR")}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </AdminPane>
            ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
  );
}
