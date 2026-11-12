"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Frame,
  History,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Save,
  Send,
  Settings2,
  Webhook,
  X,
} from "lucide-react";
import { AdminHero, AdminPane, AdminStat } from "@/components/admin/admin-bento";
import { PanelSetupCredentials } from "@/components/panel-setup-credentials";
import { fadeUp, stagger, verifyEase } from "@/components/verify/verify-motion";

type Tab = "overview" | "banner" | "panel" | "embed" | "licenses" | "partner" | "logs" | "audit";

type Guild = {
  guildId: string;
  guildName: string;
  enabled: boolean;
  bannerCategoryId: string | null;
  bannerChannelPrefix: string;
  bannerPanelTitle: string;
  bannerPanelDescription: string;
  bannerButtonLabel: string;
  partnerMessage: string;
  partnerWebhookName: string;
  partnerWebhookAvatarUrl: string | null;
  partnerEnabled: boolean;
  partnerHourKst: number;
  partnerMinuteKst: number;
};

type License = {
  id: string;
  code: string;
  days: number;
  createdAt: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
};

type Banner = {
  id: string;
  displayName: string;
  channelName: string;
  channelId: string;
  ownerUsername: string;
  expiresAt: string;
  status: string;
  createdAt: string;
};

type WebhookRow = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  lastSentAt: string | null;
  lastError: string | null;
};

type Cat = { id: string; name: string };
type TextCh = { id: string; name: string; type: number; parentId: string | null };

type EmbedForm = {
  content: string;
  title: string;
  url: string;
  description: string;
  color: string;
  authorName: string;
  authorUrl: string;
  authorIcon: string;
  footerText: string;
  footerIcon: string;
  thumbnailUrl: string;
  imageUrl: string;
  timestamp: boolean;
  fields: { name: string; value: string; inline: boolean }[];
  channelId: string;
};

const EMPTY_EMBED: EmbedForm = {
  content: "",
  title: "",
  url: "",
  description: "",
  color: "",
  authorName: "",
  authorUrl: "",
  authorIcon: "",
  footerText: "",
  footerIcon: "",
  thumbnailUrl: "",
  imageUrl: "",
  timestamp: false,
  fields: [],
  channelId: "",
};

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "overview", label: "대시보드", icon: LayoutDashboard, group: "홈" },
  { id: "banner", label: "상단 배너", icon: Megaphone, group: "설정" },
  { id: "panel", label: "패널 문구", icon: MessageSquare, group: "설정" },
  { id: "embed", label: "임베드", icon: Frame, group: "설정" },
  { id: "partner", label: "자동 파트너", icon: Webhook, group: "설정" },
  { id: "licenses", label: "라이선스", icon: KeyRound, group: "데이터" },
  { id: "logs", label: "발송 로그", icon: History, group: "데이터" },
  { id: "audit", label: "감사 로그", icon: Settings2, group: "데이터" },
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
      <span className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? "bg-emerald-400" : "bg-white/15"}`}>
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
  "toss-admin-field w-full rounded-xl border border-[var(--ad-border)] bg-black/30 px-3 py-2.5 text-sm text-[var(--ad-text)] outline-none focus:border-emerald-400/40";

export function ManagePanelClient({ guildId }: { guildId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [guildNameHint, setGuildNameHint] = useState("");
  const [guild, setGuild] = useState<Guild | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [partnerLogs, setPartnerLogs] = useState<
    Array<{ id: string; webhookLabel: string; ok: boolean; error: string | null; sentAt: string }>
  >([]);
  const [audits, setAudits] = useState<
    Array<{ id: string; actor: string; action: string; detail: string; createdAt: string }>
  >([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [channels, setChannels] = useState<TextCh[]>([]);
  const [embedForm, setEmbedForm] = useState<EmbedForm>(EMPTY_EMBED);
  const [fieldName, setFieldName] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [fieldInline, setFieldInline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [issueDays, setIssueDays] = useState("7");
  const [issueCount, setIssueCount] = useState("5");
  const [issuedPreview, setIssuedPreview] = useState<string[]>([]);
  const [whUrl, setWhUrl] = useState("");
  const [whLabel, setWhLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/manage/${guildId}`, { credentials: "include" });
      const data = await res.json();
      if (data.needLogin) {
        setNeedLogin(true);
        setGuildNameHint(data.guild?.guildName || "");
        setGuild(null);
        return;
      }
      if (!res.ok) throw new Error(data.error || "불러오기 실패");
      setNeedLogin(false);
      setGuild(data.guild);
      setStats(data.stats);
      setLicenses(data.licenses || []);
      setBanners(data.banners || []);
      setWebhooks(data.webhooks || []);
      setPartnerLogs(data.partnerLogs || []);
      setAudits(data.audits || []);
      setCategories(data.categories || []);
      setChannels(data.channels || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!guild) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/manage/${guildId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guild),
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
      const res = await fetch(`/api/manage/${guildId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok && !data.sent) throw new Error(data.error || "실패");
      if (data.licenses) setIssuedPreview(data.licenses.map((l: License) => l.code));
      setMsg("완료");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch(`/api/manage/${guildId}`, { method: "DELETE", credentials: "include" });
    setNeedLogin(true);
    setGuild(null);
  }

  const activeBanners = useMemo(() => banners.filter((b) => b.status === "active"), [banners]);
  const unusedLicenses = useMemo(() => licenses.filter((l) => !l.redeemedAt), [licenses]);

  if (loading) {
    return (
      <div className="admin-shell flex min-h-dvh items-center justify-center" data-theme="dark">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3"
        >
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
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
      <div className="admin-shell flex min-h-dvh items-center justify-center px-4" data-theme="dark">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="admin-bento w-full max-w-md p-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
              <Settings2 className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/70">
                DOES Manage
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
              window.location.href = "/api/manage/oauth/start";
            }}
            className="vx-btn-press mt-2 flex w-full items-center justify-center rounded-xl bg-emerald-400 py-2.5 text-sm font-semibold text-[#04120c]"
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
      <PanelSetupCredentials product="manage" accentClass="bg-emerald-400 text-[#04140c]" />
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
            <Settings2 className="size-4" />
          </motion.span>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
                Manage
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
                          layoutId="manage-nav-pill"
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
                guild.enabled ? "bg-emerald-400/15 text-emerald-300" : "bg-white/8 text-[var(--ad-muted)]"
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
                <motion.div className="admin-bento-grid gap-4" variants={stagger} initial="hidden" animate="show">
                  <motion.div variants={fadeUp} className="lg:col-span-5">
                    <AdminHero
                      className="h-full"
                      badge="Manage Overview"
                      value={guild.guildName}
                      hint={`서버 ID ${guild.guildId}`}
                      stats={[
                        { label: "미사용 라이선스", value: String(stats?.licenseUnused ?? unusedLicenses.length) },
                        { label: "활성 배너", value: String(stats?.bannerActive ?? activeBanners.length) },
                        { label: "웹훅", value: String(stats?.webhookEnabled ?? webhooks.filter((w) => w.enabled).length) },
                        {
                          label: "파트너 시각",
                          value: guild.partnerEnabled
                            ? `${String(guild.partnerHourKst).padStart(2, "0")}:${String(guild.partnerMinuteKst).padStart(2, "0")}`
                            : "OFF",
                        },
                      ]}
                    >
                      <ToggleRow
                        checked={guild.enabled}
                        onChange={(v) => setGuild({ ...guild, enabled: v })}
                        label="관리봇 활성화"
                        hint="꺼져도 패널은 열리지만 Discord 명령이 제한될 수 있어요"
                      />
                    </AdminHero>
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-3">
                    <AdminStat className="h-full" label="활성 배너" value={activeBanners.length} hint="만료 전 채널" />
                  </motion.div>
                  <motion.div variants={fadeUp} className="lg:col-span-4">
                    <AdminStat
                      className="h-full"
                      label="미사용 라이선스"
                      value={unusedLicenses.length}
                      hint={`전체 ${licenses.length}개`}
                    />
                  </motion.div>
                </motion.div>
              ) : null}

              {tab === "banner" ? (
                <div className="space-y-4">
                  <AdminPane title="배너 채널 설정">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="배너 카테고리">
                        <select
                          className={inputCls}
                          value={guild.bannerCategoryId || ""}
                          onChange={(e) => setGuild({ ...guild, bannerCategoryId: e.target.value || null })}
                        >
                          <option value="">선택…</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="채널 접두사">
                        <input
                          className={inputCls}
                          value={guild.bannerChannelPrefix}
                          onChange={(e) => setGuild({ ...guild, bannerChannelPrefix: e.target.value })}
                        />
                      </Field>
                    </div>
                    <p className="mt-3 text-xs text-[var(--ad-muted)]">
                      생성 형식:{" "}
                      <code>
                        {guild.bannerChannelPrefix}
                        {"{배너명}"}
                      </code>{" "}
                      · Discord <code>/배너패널</code>
                    </p>
                  </AdminPane>
                  <AdminPane title="활성 · 만료 배너">
                    <ul className="space-y-2">
                      {banners.length === 0 ? (
                        <li className="text-sm text-[var(--ad-muted)]">아직 배너가 없어요.</li>
                      ) : (
                        banners.map((b) => (
                          <li
                            key={b.id}
                            className="rounded-2xl border border-[var(--ad-border)] bg-[var(--ad-card)] px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-[var(--ad-text)]">{b.displayName}</span>
                              <span
                                className={`text-xs font-semibold ${
                                  b.status === "active" ? "text-emerald-300" : "text-[var(--ad-muted)]"
                                }`}
                              >
                                {b.status}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-[var(--ad-muted)]">
                              #{b.channelName} · {b.ownerUsername} · 만료{" "}
                              {new Date(b.expiresAt).toLocaleString("ko-KR")}
                            </p>
                          </li>
                        ))
                      )}
                    </ul>
                  </AdminPane>
                </div>
              ) : null}

              {tab === "panel" ? (
                <AdminPane title="배너 패널 문구">
                  <div className="space-y-4">
                    <Field label="제목">
                      <input
                        className={inputCls}
                        value={guild.bannerPanelTitle}
                        onChange={(e) => setGuild({ ...guild, bannerPanelTitle: e.target.value })}
                      />
                    </Field>
                    <Field label="설명">
                      <textarea
                        className={`${inputCls} min-h-28`}
                        value={guild.bannerPanelDescription}
                        onChange={(e) => setGuild({ ...guild, bannerPanelDescription: e.target.value })}
                      />
                    </Field>
                    <Field label="버튼 라벨">
                      <input
                        className={inputCls}
                        value={guild.bannerButtonLabel}
                        onChange={(e) => setGuild({ ...guild, bannerButtonLabel: e.target.value })}
                      />
                    </Field>
                  </div>
                </AdminPane>
              ) : null}

              {tab === "embed" ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <AdminPane title="임베드 만들기">
                    <p className="mb-4 text-xs text-[var(--ad-muted)]">
                      Discord <code>/임배드생성</code> 과 같은 내용이에요. 비어 있으면 전송되지 않아요.
                    </p>
                    <div className="space-y-3">
                      <Field label="전송 채널">
                        <select
                          className={inputCls}
                          value={embedForm.channelId}
                          onChange={(e) => setEmbedForm({ ...embedForm, channelId: e.target.value })}
                        >
                          <option value="">선택…</option>
                          {channels.map((c) => (
                            <option key={c.id} value={c.id}>
                              #{c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="본문 메시지 (임베드 위)">
                        <textarea
                          className={`${inputCls} min-h-20`}
                          value={embedForm.content}
                          onChange={(e) => setEmbedForm({ ...embedForm, content: e.target.value })}
                        />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="제목">
                          <input
                            className={inputCls}
                            value={embedForm.title}
                            onChange={(e) => setEmbedForm({ ...embedForm, title: e.target.value })}
                          />
                        </Field>
                        <Field label="제목 링크">
                          <input
                            className={inputCls}
                            placeholder="https://"
                            value={embedForm.url}
                            onChange={(e) => setEmbedForm({ ...embedForm, url: e.target.value })}
                          />
                        </Field>
                      </div>
                      <Field label="내용">
                        <textarea
                          className={`${inputCls} min-h-28`}
                          value={embedForm.description}
                          onChange={(e) => setEmbedForm({ ...embedForm, description: e.target.value })}
                        />
                      </Field>
                      <Field label="부제목 (작성자)">
                        <input
                          className={inputCls}
                          value={embedForm.authorName}
                          onChange={(e) => setEmbedForm({ ...embedForm, authorName: e.target.value })}
                        />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="부제목 링크">
                          <input
                            className={inputCls}
                            value={embedForm.authorUrl}
                            onChange={(e) => setEmbedForm({ ...embedForm, authorUrl: e.target.value })}
                          />
                        </Field>
                        <Field label="부제목 아이콘 URL">
                          <input
                            className={inputCls}
                            value={embedForm.authorIcon}
                            onChange={(e) => setEmbedForm({ ...embedForm, authorIcon: e.target.value })}
                          />
                        </Field>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="색상 (비우면 없음)">
                          <div className="flex gap-2">
                            <input
                              type="color"
                              className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--ad-border)] bg-black/30"
                              value={/^#[0-9a-fA-F]{6}$/.test(embedForm.color) ? embedForm.color : "#2b2d31"}
                              onChange={(e) => setEmbedForm({ ...embedForm, color: e.target.value })}
                            />
                            <input
                              className={inputCls}
                              placeholder="없음"
                              value={embedForm.color}
                              onChange={(e) => setEmbedForm({ ...embedForm, color: e.target.value })}
                            />
                            <button
                              type="button"
                              className="shrink-0 rounded-xl border border-[var(--ad-border)] px-3 text-xs text-[var(--ad-muted)]"
                              onClick={() => setEmbedForm({ ...embedForm, color: "" })}
                            >
                              없음
                            </button>
                          </div>
                        </Field>
                        <Field label="타임스탬프">
                          <ToggleRow
                            checked={embedForm.timestamp}
                            onChange={(v) => setEmbedForm({ ...embedForm, timestamp: v })}
                            label="현재 시간 표시"
                          />
                        </Field>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="큰 이미지 URL">
                          <input
                            className={inputCls}
                            value={embedForm.imageUrl}
                            onChange={(e) => setEmbedForm({ ...embedForm, imageUrl: e.target.value })}
                          />
                        </Field>
                        <Field label="썸네일 URL">
                          <input
                            className={inputCls}
                            value={embedForm.thumbnailUrl}
                            onChange={(e) => setEmbedForm({ ...embedForm, thumbnailUrl: e.target.value })}
                          />
                        </Field>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="푸터">
                          <input
                            className={inputCls}
                            value={embedForm.footerText}
                            onChange={(e) => setEmbedForm({ ...embedForm, footerText: e.target.value })}
                          />
                        </Field>
                        <Field label="푸터 아이콘 URL">
                          <input
                            className={inputCls}
                            value={embedForm.footerIcon}
                            onChange={(e) => setEmbedForm({ ...embedForm, footerIcon: e.target.value })}
                          />
                        </Field>
                      </div>
                      <Field label="필드">
                        <div className="space-y-2">
                          {embedForm.fields.map((f, i) => (
                            <div
                              key={`${f.name}-${i}`}
                              className="flex items-start justify-between gap-2 rounded-xl border border-[var(--ad-border)] px-3 py-2 text-sm"
                            >
                              <span>
                                <strong className="text-[var(--ad-text)]">{f.name}</strong>
                                <span className="mt-0.5 block text-[11px] text-[var(--ad-muted)]">{f.value}</span>
                              </span>
                              <button
                                type="button"
                                className="text-xs text-rose-300"
                                onClick={() =>
                                  setEmbedForm({
                                    ...embedForm,
                                    fields: embedForm.fields.filter((_, idx) => idx !== i),
                                  })
                                }
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              className={inputCls}
                              placeholder="필드 제목"
                              value={fieldName}
                              onChange={(e) => setFieldName(e.target.value)}
                            />
                            <input
                              className={inputCls}
                              placeholder="필드 내용"
                              value={fieldValue}
                              onChange={(e) => setFieldValue(e.target.value)}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-xs text-[var(--ad-muted)]">
                              <input
                                type="checkbox"
                                checked={fieldInline}
                                onChange={(e) => setFieldInline(e.target.checked)}
                              />
                              나란히
                            </label>
                            <button
                              type="button"
                              className="text-xs font-semibold text-emerald-300"
                              onClick={() => {
                                if (!fieldName.trim() || !fieldValue.trim()) return;
                                setEmbedForm({
                                  ...embedForm,
                                  fields: [
                                    ...embedForm.fields,
                                    { name: fieldName.trim(), value: fieldValue.trim(), inline: fieldInline },
                                  ],
                                });
                                setFieldName("");
                                setFieldValue("");
                              }}
                            >
                              필드 추가
                            </button>
                          </div>
                        </div>
                      </Field>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void runAction({
                              action: "send-embed",
                              channelId: embedForm.channelId,
                              embed: embedForm,
                            })
                          }
                          className="vx-btn-press inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#04120c] disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                          선택한 채널로 전송
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmbedForm({ ...EMPTY_EMBED, channelId: embedForm.channelId })}
                          className="rounded-xl border border-[var(--ad-border)] px-4 py-2.5 text-sm text-[var(--ad-muted)]"
                        >
                          초기화
                        </button>
                      </div>
                    </div>
                  </AdminPane>
                  <AdminPane title="미리보기">
                    {!embedForm.title &&
                    !embedForm.description &&
                    !embedForm.authorName &&
                    !embedForm.footerText &&
                    !embedForm.imageUrl &&
                    !embedForm.thumbnailUrl &&
                    !embedForm.content &&
                    embedForm.fields.length === 0 ? (
                      <p className="text-sm text-[var(--ad-muted)]">
                        아직 아무것도 안 적었어요. 제목 / 부제목 / 내용 / 링크를 입력해 주세요.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {embedForm.content ? (
                          <p className="whitespace-pre-wrap text-sm text-[var(--ad-text)]">{embedForm.content}</p>
                        ) : null}
                        <div
                          className="overflow-hidden rounded-xl bg-[#2b2d31] p-4"
                          style={
                            /^#[0-9a-fA-F]{6}$/.test(embedForm.color)
                              ? { borderLeft: `4px solid ${embedForm.color}` }
                              : undefined
                          }
                        >
                          {embedForm.authorName ? (
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
                              {embedForm.authorIcon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={embedForm.authorIcon} alt="" className="size-5 rounded-full object-cover" />
                              ) : null}
                              {embedForm.authorName}
                            </div>
                          ) : null}
                          <div className="flex gap-3">
                            <div className="min-w-0 flex-1">
                              {embedForm.title ? (
                                <p className="text-base font-bold text-white">{embedForm.title}</p>
                              ) : null}
                              {embedForm.description ? (
                                <p className="mt-1 whitespace-pre-wrap text-sm text-[#dbdee1]">
                                  {embedForm.description}
                                </p>
                              ) : null}
                              {embedForm.fields.length ? (
                                <div className="mt-3 grid grid-cols-1 gap-2">
                                  {embedForm.fields.map((f, i) => (
                                    <div key={`${f.name}-${i}`}>
                                      <p className="text-xs font-semibold text-white">{f.name}</p>
                                      <p className="text-xs text-[#dbdee1]">{f.value}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {embedForm.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={embedForm.thumbnailUrl}
                                alt=""
                                className="size-16 rounded-md object-cover"
                              />
                            ) : null}
                          </div>
                          {embedForm.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={embedForm.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded-md object-cover" />
                          ) : null}
                          {embedForm.footerText ? (
                            <p className="mt-3 text-[11px] text-[#949ba4]">{embedForm.footerText}</p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </AdminPane>
                </div>
              ) : null}

              {tab === "licenses" ? (
                <div className="space-y-4">
                  <AdminPane title="라이선스 발급">
                    <div className="flex flex-wrap gap-3">
                      <Field label="일수">
                        <input className={`${inputCls} w-28`} value={issueDays} onChange={(e) => setIssueDays(e.target.value)} />
                      </Field>
                      <Field label="갯수">
                        <input
                          className={`${inputCls} w-28`}
                          value={issueCount}
                          onChange={(e) => setIssueCount(e.target.value)}
                        />
                      </Field>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction({
                          action: "issue-licenses",
                          days: Number(issueDays),
                          count: Number(issueCount),
                        })
                      }
                      className="vx-btn-press mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#04120c] disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      라이선스 뽑기
                    </button>
                    {issuedPreview.length ? (
                      <pre className="mt-4 overflow-auto rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-100">
                        {issuedPreview.join("\n")}
                      </pre>
                    ) : null}
                  </AdminPane>
                  <AdminPane title="발급 목록">
                    <ul className="max-h-96 space-y-1 overflow-auto">
                      {licenses.map((l) => (
                        <li
                          key={l.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm hover:bg-white/[0.03]"
                        >
                          <code className="text-xs text-emerald-200/90">{l.code}</code>
                          <span className="text-[11px] text-[var(--ad-muted)]">
                            {l.days}일 · {l.redeemedAt ? "사용됨" : "미사용"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AdminPane>
                </div>
              ) : null}

              {tab === "partner" ? (
                <div className="space-y-4">
                  <AdminPane title="자동 파트너 설정">
                    <div className="space-y-4">
                      <Field label="홍보 문구">
                        <textarea
                          className={`${inputCls} min-h-28`}
                          value={guild.partnerMessage}
                          onChange={(e) => setGuild({ ...guild, partnerMessage: e.target.value })}
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="웹훅 표시 이름">
                          <input
                            className={inputCls}
                            value={guild.partnerWebhookName}
                            onChange={(e) => setGuild({ ...guild, partnerWebhookName: e.target.value })}
                          />
                        </Field>
                        <Field label="웹훅 아바타 URL">
                          <input
                            className={inputCls}
                            value={guild.partnerWebhookAvatarUrl || ""}
                            onChange={(e) =>
                              setGuild({ ...guild, partnerWebhookAvatarUrl: e.target.value || null })
                            }
                          />
                        </Field>
                        <Field label="시 (KST)">
                          <input
                            type="number"
                            min={0}
                            max={23}
                            className={inputCls}
                            value={guild.partnerHourKst}
                            onChange={(e) => setGuild({ ...guild, partnerHourKst: Number(e.target.value) })}
                          />
                        </Field>
                        <Field label="분 (KST)">
                          <input
                            type="number"
                            min={0}
                            max={59}
                            className={inputCls}
                            value={guild.partnerMinuteKst}
                            onChange={(e) => setGuild({ ...guild, partnerMinuteKst: Number(e.target.value) })}
                          />
                        </Field>
                      </div>
                      <ToggleRow
                        checked={guild.partnerEnabled}
                        onChange={(v) => setGuild({ ...guild, partnerEnabled: v })}
                        label="자동 발송 ON"
                        hint="매일 KST 시각에 등록 웹훅으로 전송"
                      />
                    </div>
                  </AdminPane>
                  <AdminPane title="웹훅">
                    <div className="flex flex-wrap gap-2">
                      <input
                        className={`${inputCls} min-w-[12rem] flex-1`}
                        placeholder="웹훅 URL"
                        value={whUrl}
                        onChange={(e) => setWhUrl(e.target.value)}
                      />
                      <input
                        className={`${inputCls} w-32`}
                        placeholder="라벨"
                        value={whLabel}
                        onChange={(e) => setWhLabel(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction({ action: "add-webhook", url: whUrl, label: whLabel })}
                        className="rounded-xl border border-[var(--ad-border)] px-3 py-2 text-sm text-[var(--ad-text)] hover:bg-white/5"
                      >
                        추가
                      </button>
                    </div>
                    <ul className="mt-4 space-y-2">
                      {webhooks.map((w) => (
                        <li
                          key={w.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--ad-border)] px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--ad-text)]">{w.label}</p>
                            <p className="truncate text-[11px] text-[var(--ad-muted)]">{w.url}</p>
                            {w.lastError ? <p className="text-[11px] text-rose-400">{w.lastError}</p> : null}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-xs text-[var(--ad-muted)]"
                              onClick={() =>
                                void runAction({
                                  action: "toggle-webhook",
                                  webhookId: w.id,
                                  enabled: !w.enabled,
                                })
                              }
                            >
                              {w.enabled ? "ON" : "OFF"}
                            </button>
                            <button
                              type="button"
                              className="text-xs text-rose-400"
                              onClick={() => void runAction({ action: "remove-webhook", webhookId: w.id })}
                            >
                              삭제
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction({ action: "partner-send-now" })}
                      className="vx-btn-press mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#04120c] disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      지금 발송
                    </button>
                  </AdminPane>
                </div>
              ) : null}

              {tab === "logs" ? (
                <AdminPane title="파트너 발송 로그">
                  <ul className="space-y-2 text-sm">
                    {partnerLogs.length === 0 ? (
                      <li className="text-[var(--ad-muted)]">발송 기록이 없어요.</li>
                    ) : (
                      partnerLogs.map((l) => (
                        <li key={l.id} className="rounded-xl border border-[var(--ad-border)] px-3 py-2 text-[var(--ad-muted)]">
                          <span className={l.ok ? "text-emerald-300" : "text-rose-400"}>{l.ok ? "OK" : "FAIL"}</span>{" "}
                          {l.webhookLabel} · {new Date(l.sentAt).toLocaleString("ko-KR")}
                          {l.error ? ` · ${l.error}` : ""}
                        </li>
                      ))
                    )}
                  </ul>
                </AdminPane>
              ) : null}

              {tab === "audit" ? (
                <AdminPane title="감사 로그">
                  <ul className="space-y-2 text-sm text-[var(--ad-muted)]">
                    {audits.length === 0 ? (
                      <li>기록이 없어요.</li>
                    ) : (
                      audits.map((a) => (
                        <li key={a.id} className="rounded-xl border border-[var(--ad-border)] px-3 py-2">
                          <span className="font-medium text-[var(--ad-text)]">{a.action}</span> · {a.actor} · {a.detail} ·{" "}
                          {new Date(a.createdAt).toLocaleString("ko-KR")}
                        </li>
                      ))
                    )}
                  </ul>
                </AdminPane>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
