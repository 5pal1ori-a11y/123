"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  Hash,
  Key,
  Loader2,
  MessageSquareText,
  Radio,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { fadeUp, vxTransition } from "@/lib/motion";
import { shopHeaders } from "@/lib/shop-client";
import {
  PanelField,
  PanelFrame,
  PanelTabBody,
} from "@/components/admin/admin-panel-ui";
import { AdminToastViewport, type AdminToastState } from "./admin-toast";

/* ─────────────────────────────────── types ─── */
type DiscordConfig = {
  discordBotEnabled: boolean;
  discordGuildId: string | null;
  discordOwnerId: string | null;
  discordOwnerUsername: string | null;
  discordOwnerAvatar: string | null;
  discordPurchaseLogChannelId: string | null;
  discordChargeLogChannelId: string | null;
  discordAdminLogChannelId: string | null;
  discordReviewLogChannelId: string | null;
  discordRestockLogChannelId: string | null;
  discordRandomBoxLogChannelId: string | null;
  discordStockChannelId: string | null;
  spendRoles: { minAmount: number; roleId: string }[];
  discordAdminRoleId: string | null;
  discordApplicationId: string | null;
  hasBotToken: boolean;
  hasPublicKey: boolean;
  discordEmbedTitle: string;
  discordEmbedDescription: string;
  discordEmbedColor: number;
  discordShowNotices: boolean;
  discordShowProducts: boolean;
  discordShowBuy: boolean;
  discordShowCharge: boolean;
  discordShowInfo: boolean;
  discordBtnStyleNotices: number;
  discordBtnStyleProducts: number;
  discordBtnStyleBuy: number;
  discordBtnStyleCharge: number;
  discordBtnStyleInfo: number;
  discordBtnLabelNotices: string;
  discordBtnLabelProducts: string;
  discordBtnLabelBuy: string;
  discordBtnLabelCharge: string;
  discordBtnLabelInfo: string;
  discordPurchaseLogTitle: string;
  discordPurchaseLogTemplate: string;
  discordReviewLogTitle: string;
  discordReviewLogTemplate: string;
  interactionsUrl: string;
  linkedRoleVerificationUrl?: string;
  termsUrl?: string;
  privacyUrl?: string;
  linkedRoleRedirectUri?: string;
};

type GuildChannel = { id: string; name: string; type: number };

type TabId = "connect" | "menu" | "logs" | "channels" | "roles";

const TABS: { id: TabId; label: string }[] = [
  { id: "connect", label: "연동" },
  { id: "menu", label: "메뉴 UI" },
  { id: "logs", label: "로그 문구" },
  { id: "channels", label: "채널" },
  { id: "roles", label: "누적 역할" },
];

const DEFAULT_PURCHASE_LOG_TEMPLATE =
  "**{user}** 구매\n상품 `{product}`\n금액 **{amount}**\n주문 `{order}`";
const DEFAULT_REVIEW_LOG_TEMPLATE = "{product}\n{body}";

const emptyForm = {
  discordBotEnabled: false,
  discordGuildId: "",
  discordPurchaseLogChannelId: "",
  discordChargeLogChannelId: "",
  discordAdminLogChannelId: "",
  discordReviewLogChannelId: "",
  discordRestockLogChannelId: "",
  discordRandomBoxLogChannelId: "",
  discordStockChannelId: "",
  spendRoles: [] as { minAmount: string; roleId: string }[],
  discordAdminRoleId: "",
  discordApplicationId: "",
  discordBotToken: "",
  discordPublicKey: "",
  discordEmbedTitle: "자판기",
  discordEmbedDescription: "원하는 메뉴를 선택하세요.",
  discordEmbedColor: "#5865F2",
  discordShowNotices: true,
  discordShowProducts: true,
  discordShowBuy: true,
  discordShowCharge: true,
  discordShowInfo: true,
  discordBtnStyleNotices: 2,
  discordBtnStyleProducts: 1,
  discordBtnStyleBuy: 3,
  discordBtnStyleCharge: 3,
  discordBtnStyleInfo: 2,
  discordBtnLabelNotices: "공지",
  discordBtnLabelProducts: "제품 보기",
  discordBtnLabelBuy: "구매 하기",
  discordBtnLabelCharge: "충전 하기",
  discordBtnLabelInfo: "정보",
  discordPurchaseLogTitle: "구매 로그",
  discordPurchaseLogTemplate: DEFAULT_PURCHASE_LOG_TEMPLATE,
  discordReviewLogTitle: "후기 로그",
  discordReviewLogTemplate: DEFAULT_REVIEW_LOG_TEMPLATE,
};

const MENU_BTNS = [
  {
    showKey: "discordShowNotices",
    labelKey: "discordBtnLabelNotices",
    styleKey: "discordBtnStyleNotices",
    fallback: "공지",
    kind: "section" as const,
    sectionTitle: "공지사항",
    sectionHint: "등록된 공지사항을 한눈에 확인 가능해요.",
  },
  {
    showKey: "discordShowInfo",
    labelKey: "discordBtnLabelInfo",
    styleKey: "discordBtnStyleInfo",
    fallback: "정보",
    kind: "section" as const,
    sectionTitle: "정보확인",
    sectionHint: "자판기에 등록된 정보를 확인할수있어요.",
  },
  {
    showKey: "discordShowProducts",
    labelKey: "discordBtnLabelProducts",
    styleKey: "discordBtnStyleProducts",
    fallback: "제품 보기",
    kind: "row" as const,
  },
  {
    showKey: "discordShowCharge",
    labelKey: "discordBtnLabelCharge",
    styleKey: "discordBtnStyleCharge",
    fallback: "충전 하기",
    kind: "row" as const,
  },
  {
    showKey: "discordShowBuy",
    labelKey: "discordBtnLabelBuy",
    styleKey: "discordBtnStyleBuy",
    fallback: "구매 하기",
    kind: "row" as const,
  },
] as const;

const LOG_CHANNELS = [
  ["discordPurchaseLogChannelId", "구매"],
  ["discordChargeLogChannelId", "충전"],
  ["discordAdminLogChannelId", "관리"],
  ["discordReviewLogChannelId", "후기"],
  ["discordRestockLogChannelId", "재입고"],
  ["discordRandomBoxLogChannelId", "랜덤박스"],
  ["discordStockChannelId", "재고현황"],
] as const;

/* ─────────────────────────────────── helpers ─── */
function normalizeColor(raw: string) {
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : "#5865F2";
}

function PlaceholderChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <code
          key={t}
          className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-neutral-500"
        >
          {`{${t}}`}
        </code>
      ))}
    </div>
  );
}

/* ─────────────────────────────────── CopyField ─── */
function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-neutral-950 px-3 py-2.5">
      <code className="flex-1 break-all font-mono text-[11px] leading-relaxed text-neutral-400">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-neutral-400 transition hover:border-white/15 hover:text-white"
      >
        {copied ? (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <Check className="size-3" /> 복사됨
          </span>
        ) : (
          "복사"
        )}
      </button>
    </div>
  );
}

/* ─────────────────────────────────── ToggleSwitch ─── */
function ToggleSwitch({
  checked,
  onChange,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const thumb = size === "sm" ? "size-4" : "size-5";
  const move = size === "sm" ? "translate-x-4" : "translate-x-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${track} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? "bg-[#5865F2]" : "bg-white/10"
      }`}
    >
      <span
        className={`inline-block ${thumb} rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? move : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ChannelSelect({
  channels,
  value,
  onChange,
  disabled,
}: {
  channels: GuildChannel[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="toss-admin-field"
    >
      <option value="">선택 안 함</option>
      {value && !channels.some((c) => c.id === value) ? (
        <option value={value}>#{value} (저장된 값)</option>
      ) : null}
      {channels.map((ch) => (
        <option key={ch.id} value={ch.id}>
          #{ch.name}
        </option>
      ))}
    </select>
  );
}

function LivePreview({
  shopName,
  enabled,
  title,
  description,
  sections,
  rowButtons,
}: {
  shopName: string;
  enabled: boolean;
  title: string;
  description: string;
  sections: { key: string; title: string; hint: string; label: string }[];
  rowButtons: { key: string; label: string }[];
}) {
  const header =
    description.trim().length > 0
      ? `${title || "자판기"}\n${description.trim()}`
      : title || "자판기";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-neutral-950">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio className={`size-3.5 ${enabled ? "text-emerald-400" : "text-neutral-600"}`} />
          <span className="text-xs font-medium text-neutral-400">미리보기 · Components V2</span>
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
            enabled ? "bg-emerald-500/12 text-emerald-300" : "bg-white/[0.05] text-neutral-500"
          }`}
        >
          {enabled ? "ON" : "OFF"}
        </span>
      </div>

      <div className="bg-[#313338] px-4 py-4">
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#4e5058]">
            <Bot className="size-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-[13px] font-semibold text-[#f2f3f5]">{shopName} Bot</span>
              <span className="rounded bg-[#4e5058] px-1 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                APP
              </span>
              <span className="text-[11px] text-[#949ba4]">방금</span>
            </div>
            <p className="mt-0.5 text-[12px] text-[#b5bac1]">/버튼 · /자판기</p>

            <div className="mt-2.5 overflow-hidden rounded-xl border border-white/[0.06] bg-[#2b2d31]">
              <div className="space-y-0 px-3 py-3">
                <div>
                  <p className="text-[16px] font-bold leading-snug text-white">
                    {title || "자판기"}
                  </p>
                  {description.trim() ? (
                    <p className="mt-1 text-[12px] leading-relaxed text-[#949ba4]">
                      {description.trim()}
                    </p>
                  ) : null}
                </div>

                <div className="my-2.5 h-px bg-white/[0.08]" />

                {sections.length === 0 && rowButtons.length === 0 ? (
                  <p className="text-[11px] italic text-[#6a737d]">표시할 메뉴 없음</p>
                ) : null}

                {sections.map((sec, i) => (
                  <div key={sec.key}>
                    <div className="flex items-center justify-between gap-3 py-1.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#f2f3f5]">{sec.title}</p>
                        <p className="mt-0.5 text-[12px] leading-snug text-[#b5bac1]">
                          &gt; {sec.hint}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-[3px] bg-[#4e5058] px-2.5 py-1 text-[12px] font-medium text-white">
                        {sec.label}
                      </span>
                    </div>
                    {i < sections.length - 1 || rowButtons.length > 0 ? (
                      <div className="my-2 h-px bg-white/[0.08]" />
                    ) : null}
                  </div>
                ))}

                {rowButtons.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {rowButtons.map((btn) => (
                      <span
                        key={btn.key}
                        className="inline-flex items-center rounded-[3px] bg-[#4e5058] px-2.5 py-1 text-[12px] font-medium text-white"
                      >
                        {btn.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <p className="mt-2 text-[10px] text-[#6a737d]">
              실제 Discord와 동일 · 회색(Secondary) 버튼
            </p>
            <span className="sr-only">{header}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────── main ─── */
export function DiscordBotPanel({
  shopSlug,
  shopName = "상점",
  shopPlan = "pro",
}: {
  shopSlug: string;
  shopName?: string;
  shopPlan?: "free" | "lite" | "pro" | "pro_max";
}) {
  const canPersonalBot = shopPlan === "pro_max";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [toast, setToast] = useState<AdminToastState>(null);
  const [form, setForm] = useState(emptyForm);
  const [interactionsUrl, setInteractionsUrl] = useState("");
  const [portalUrls, setPortalUrls] = useState({
    linkedRoleVerificationUrl: "",
    termsUrl: "",
    privacyUrl: "",
    linkedRoleRedirectUri: "",
  });
  const [hasToken, setHasToken] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [channels, setChannels] = useState<GuildChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("connect");
  const [showPortalUrls, setShowPortalUrls] = useState(false);

  const showToast = (msg: string, kind: "success" | "error" = "success") => setToast({ msg, kind });
  const dismissToast = () => setToast(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/discord/register", { headers: shopHeaders(shopSlug) });
      const data = (await res.json().catch(() => ({}))) as DiscordConfig & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "load failed");
      setOwnerUsername(data.discordOwnerUsername ?? null);
      setOwnerId(data.discordOwnerId ?? null);
      setForm({
        discordBotEnabled: data.discordBotEnabled,
        discordGuildId: data.discordGuildId ?? "",
        discordPurchaseLogChannelId: data.discordPurchaseLogChannelId ?? "",
        discordChargeLogChannelId: data.discordChargeLogChannelId ?? "",
        discordAdminLogChannelId: data.discordAdminLogChannelId ?? "",
        discordReviewLogChannelId: data.discordReviewLogChannelId ?? "",
        discordRestockLogChannelId: data.discordRestockLogChannelId ?? "",
        discordRandomBoxLogChannelId: data.discordRandomBoxLogChannelId ?? "",
        discordStockChannelId: data.discordStockChannelId ?? "",
        spendRoles: (data.spendRoles ?? []).map((r) => ({
          minAmount: String(r.minAmount),
          roleId: r.roleId,
        })),
        discordAdminRoleId: data.discordAdminRoleId ?? "",
        discordApplicationId: data.discordApplicationId ?? "",
        discordBotToken: "",
        discordPublicKey: "",
        discordEmbedTitle: data.discordEmbedTitle || "자판기",
        discordEmbedDescription: data.discordEmbedDescription || "원하는 메뉴를 선택하세요.",
        discordEmbedColor: `#${(data.discordEmbedColor >>> 0).toString(16).padStart(6, "0")}`.toUpperCase(),
        discordShowNotices: data.discordShowNotices !== false,
        discordShowProducts: data.discordShowProducts !== false,
        discordShowBuy: data.discordShowBuy !== false,
        discordShowCharge: data.discordShowCharge !== false,
        discordShowInfo: data.discordShowInfo !== false,
        discordBtnStyleNotices: data.discordBtnStyleNotices ?? 2,
        discordBtnStyleProducts: data.discordBtnStyleProducts ?? 1,
        discordBtnStyleBuy: data.discordBtnStyleBuy ?? 3,
        discordBtnStyleCharge: data.discordBtnStyleCharge ?? 3,
        discordBtnStyleInfo: data.discordBtnStyleInfo ?? 2,
        discordBtnLabelNotices: data.discordBtnLabelNotices || "공지",
        discordBtnLabelProducts: data.discordBtnLabelProducts || "제품 보기",
        discordBtnLabelBuy: data.discordBtnLabelBuy || "구매 하기",
        discordBtnLabelCharge: data.discordBtnLabelCharge || "충전 하기",
        discordBtnLabelInfo: data.discordBtnLabelInfo || "정보",
        discordPurchaseLogTitle: data.discordPurchaseLogTitle || "구매 로그",
        discordPurchaseLogTemplate:
          data.discordPurchaseLogTemplate || DEFAULT_PURCHASE_LOG_TEMPLATE,
        discordReviewLogTitle: data.discordReviewLogTitle || "후기 로그",
        discordReviewLogTemplate: data.discordReviewLogTemplate || DEFAULT_REVIEW_LOG_TEMPLATE,
      });
      setHasToken(Boolean(data.hasBotToken));
      setHasKey(Boolean(data.hasPublicKey));
      setInteractionsUrl(data.interactionsUrl);
      setPortalUrls({
        linkedRoleVerificationUrl: data.linkedRoleVerificationUrl || "https://vendix.team/linked-role",
        termsUrl: data.termsUrl || "https://vendix.team/terms",
        privacyUrl: data.privacyUrl || "https://vendix.team/privacy",
        linkedRoleRedirectUri:
          data.linkedRoleRedirectUri || "https://vendix.team/api/discord/linked-role/callback",
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "설정을 불러오지 못했어요.", "error");
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadChannels = useCallback(async () => {
    if (!form.discordGuildId) {
      setChannels([]);
      return;
    }
    setChannelsLoading(true);
    setChannelsError(null);
    try {
      const res = await fetch("/api/discord/channels", { headers: shopHeaders(shopSlug) });
      const data = (await res.json().catch(() => ({}))) as {
        channels?: GuildChannel[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "채널 목록 실패");
      setChannels(data.channels ?? []);
    } catch (err) {
      setChannels([]);
      setChannelsError(err instanceof Error ? err.message : "채널 목록 실패");
    } finally {
      setChannelsLoading(false);
    }
  }, [form.discordGuildId, shopSlug]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const previewSections = useMemo(() => {
    const out: { key: string; title: string; hint: string; label: string }[] = [];
    for (const btn of MENU_BTNS) {
      if (btn.kind !== "section" || !form[btn.showKey]) continue;
      out.push({
        key: btn.showKey,
        title: btn.sectionTitle,
        hint: btn.sectionHint,
        label: form[btn.labelKey] || btn.fallback,
      });
    }
    return out;
  }, [form]);
  const previewRowButtons = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    for (const btn of MENU_BTNS) {
      if (btn.kind !== "row" || !form[btn.showKey]) continue;
      out.push({
        key: btn.showKey,
        label: form[btn.labelKey] || btn.fallback,
      });
    }
    return out;
  }, [form]);
  const accent = normalizeColor(form.discordEmbedColor);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/discord/register", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          ...form,
          discordGuildId: form.discordGuildId || null,
          discordPurchaseLogChannelId: form.discordPurchaseLogChannelId || null,
          discordChargeLogChannelId: form.discordChargeLogChannelId || null,
          discordAdminLogChannelId: form.discordAdminLogChannelId || null,
          discordReviewLogChannelId: form.discordReviewLogChannelId || null,
          discordRestockLogChannelId: form.discordRestockLogChannelId || null,
          discordRandomBoxLogChannelId: form.discordRandomBoxLogChannelId || null,
          discordStockChannelId: form.discordStockChannelId || null,
          spendRoles: form.spendRoles
            .map((r) => ({ minAmount: Number(r.minAmount), roleId: r.roleId.trim() }))
            .filter((r) => r.roleId && Number.isFinite(r.minAmount) && r.minAmount >= 0),
          discordAdminRoleId: form.discordAdminRoleId || null,
          discordApplicationId: form.discordApplicationId || null,
          // omit blank secrets so API keeps previously saved token/key
          ...(form.discordBotToken.trim()
            ? { discordBotToken: form.discordBotToken.trim() }
            : { discordBotToken: undefined }),
          ...(form.discordPublicKey.trim()
            ? { discordPublicKey: form.discordPublicKey.trim() }
            : { discordPublicKey: undefined }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "저장 실패");
      showToast("봇 자판기 설정이 저장됐어요 ✓");
      setForm((f) => ({ ...f, discordBotToken: "", discordPublicKey: "" }));
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }

  async function registerCommands() {
    setRegistering(true);
    try {
      const res = await fetch("/api/discord/register", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-commands" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "명령 등록 실패");
      showToast("슬래시 명령 등록 완료 ✓ (/버튼 /자판기 /연동 /충전 /설정 /웹패널 …)");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "명령 등록 실패", "error");
    } finally {
      setRegistering(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">봇 설정 불러오는 중…</p>
        </div>
      </div>
    );
  }

  const setupSteps = [
    {
      n: "1",
      done: Boolean(form.discordGuildId),
      title: "서버 연결",
      desc: "Guild ID 저장",
    },
    {
      n: "2",
      done: form.discordBotEnabled,
      title: "봇 활성화",
      desc: "응답 ON",
    },
    {
      n: "3",
      done: Boolean(form.discordGuildId && form.discordBotEnabled),
      title: "명령 등록",
      desc: "슬래시 명령",
    },
  ];

  return (
    <>
      <AdminToastViewport toast={toast} onDismiss={dismissToast} />

      <motion.form
        onSubmit={save}
        className="space-y-5"
        initial={fadeUp.initial}
        animate={fadeUp.animate}
        transition={vxTransition}
      >
        {/* Hero */}
        <div className="admin-hero relative overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
          <div
            className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full opacity-30 blur-3xl"
            style={{ background: accent }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-lg"
                style={{ background: `linear-gradient(145deg, ${accent}, #1a1b1e)` }}
              >
                <Bot className="size-6 text-white" />
              </div>
              <div>
                <p className="admin-hero-badge mb-2">Discord · Components V2</p>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">봇 자판기</h2>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-white/55">
                  {canPersonalBot
                    ? "메인 봇으로 바로 운영하거나, PRO MAX 개인봇 토큰을 연결하세요."
                    : "DOES 메인 봇으로 서버에 자판기를 붙입니다. Guild ID만 있으면 시작해요."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-black/25 px-4 py-3 backdrop-blur-sm">
              <div className="text-right">
                <p className="text-xs font-semibold text-white/90">봇 활성화</p>
                <p className="text-[10px] text-white/45">
                  {form.discordBotEnabled ? "서버에서 응답 중" : "꺼진 상태"}
                </p>
              </div>
              <ToggleSwitch
                checked={form.discordBotEnabled}
                onChange={(v) => setForm({ ...form, discordBotEnabled: v })}
              />
            </div>
          </div>

          <div className="relative mt-6 grid gap-2 sm:grid-cols-3">
            {setupSteps.map((step) => (
              <div
                key={step.n}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${
                  step.done
                    ? "border-emerald-400/25 bg-emerald-400/10"
                    : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    step.done ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/50"
                  }`}
                >
                  {step.done ? <Check className="size-3.5" /> : step.n}
                </span>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${step.done ? "text-emerald-100" : "text-white/80"}`}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-white/40">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status strip */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            {
              ok: true,
              label: canPersonalBot ? (hasToken ? "개인봇" : "메인 봇") : "메인 봇",
              hint: canPersonalBot
                ? hasToken
                  ? "자체 토큰 사용"
                  : "공용 봇 사용 중"
                : "DOES 공용",
              icon: <Key className="size-3.5" />,
            },
            {
              ok: !!form.discordGuildId,
              label: "Guild ID",
              hint: form.discordGuildId ? "연결됨" : "입력 필요",
              icon: <Hash className="size-3.5" />,
            },
            {
              ok: form.discordBotEnabled,
              label: "응답",
              hint: form.discordBotEnabled ? "ON" : "OFF",
              icon: <Radio className="size-3.5" />,
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`admin-bento flex items-center gap-2.5 px-3 py-3 ${
                s.ok ? "!border-emerald-500/20" : ""
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${
                  s.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.05] text-neutral-600"
                }`}
              >
                {s.icon}
              </span>
              <div className="min-w-0">
                <p className={`truncate text-xs font-semibold ${s.ok ? "text-white" : "text-neutral-400"}`}>
                  {s.label}
                </p>
                <p className="text-[10px] text-neutral-500">{s.hint}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <PanelFrame
            tabs={TABS}
            activeTab={tab}
            onTabChange={(id) => setTab(id as TabId)}
          >
            <AnimatePresence mode="wait">
              {tab === "connect" ? (
                <PanelTabBody tabKey="connect" className="mt-5 space-y-5">
                  {ownerUsername ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-white/[0.06] to-transparent px-4 py-3.5">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white">
                        <Bot className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                          Discord 계정
                        </p>
                        <p className="truncate text-sm font-semibold text-white">
                          {ownerUsername}
                          {ownerId ? (
                            <span className="ml-2 font-mono text-[11px] font-normal text-neutral-500">
                              {ownerId}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-3.5 text-[13px] leading-relaxed text-neutral-400">
                    {canPersonalBot ? (
                      <>
                        기본은 <span className="font-medium text-neutral-200">DOES 메인 봇</span>
                        입니다. 아래에서 자체 토큰을 넣으면 개인봇으로 전환됩니다.
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-neutral-200">메인 봇</span>이 이미
                        플랫폼에 연결되어 있어요. 서버 ID만 넣고 활성화 → 슬래시 명령 등록하면
                        끝입니다.
                      </>
                    )}
                  </div>

                  <PanelField label="서버 (Guild) ID" hint="Discord 서버 설정 → 고급 → 개발자 모드 → 서버 우클릭">
                    <div className="relative">
                      <Hash className="absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
                      <input
                        value={form.discordGuildId}
                        onChange={(e) => setForm({ ...form, discordGuildId: e.target.value })}
                        className="toss-admin-field pl-10 font-mono text-sm"
                        placeholder="예: 123456789012345678"
                      />
                    </div>
                  </PanelField>

                  {canPersonalBot ? (
                    <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                      <div>
                        <p className="text-xs font-semibold text-neutral-200">개인봇 (PRO MAX)</p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          비워 두면 메인 봇을 그대로 씁니다.
                        </p>
                      </div>
                      <PanelField
                        label="봇 토큰"
                        hint={hasToken ? "저장됨 · 바꿀 때만 입력" : "선택"}
                      >
                        <div className="relative">
                          <Key className="absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
                          <input
                            type="password"
                            value={form.discordBotToken}
                            onChange={(e) => setForm({ ...form, discordBotToken: e.target.value })}
                            className="toss-admin-field pl-10"
                            placeholder={hasToken ? "••••••••••" : "자체 봇 토큰"}
                            autoComplete="off"
                          />
                        </div>
                      </PanelField>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <PanelField label="Application ID">
                          <input
                            value={form.discordApplicationId}
                            onChange={(e) =>
                              setForm({ ...form, discordApplicationId: e.target.value })
                            }
                            className="toss-admin-field font-mono text-sm"
                            placeholder="숫자 ID"
                          />
                        </PanelField>
                        <PanelField label="Public Key" hint={hasKey ? "저장됨" : "선택"}>
                          <input
                            value={form.discordPublicKey}
                            onChange={(e) =>
                              setForm({ ...form, discordPublicKey: e.target.value })
                            }
                            className="toss-admin-field font-mono text-xs"
                            placeholder={hasKey ? "••••" : "공개 키"}
                            autoComplete="off"
                          />
                        </PanelField>
                      </div>
                    </div>
                  ) : null}

                  {interactionsUrl ? (
                    <div className="space-y-2">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300">
                        <Terminal className="size-3.5 text-neutral-500" />
                        Interactions Endpoint
                      </p>
                      <CopyField value={interactionsUrl} />
                      <p className="text-[11px] text-neutral-600">
                        Developer Portal → General → Interactions Endpoint URL
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowPortalUrls((v) => !v)}
                      className="flex w-full items-center justify-between bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.05]"
                    >
                      <span className="text-xs font-semibold text-neutral-300">
                        Developer Portal URL
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        {showPortalUrls ? "접기" : "펼치기"}
                      </span>
                    </button>
                    {showPortalUrls ? (
                      <div className="space-y-3 border-t border-white/[0.06] p-4">
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-neutral-500">연결된 역할 인증 URL</p>
                          <CopyField value={portalUrls.linkedRoleVerificationUrl} />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-neutral-500">이용 약관 URL</p>
                          <CopyField value={portalUrls.termsUrl} />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-neutral-500">개인정보 보호 정책 URL</p>
                          <CopyField value={portalUrls.privacyUrl} />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-neutral-500">OAuth2 Redirect (연결 역할)</p>
                          <CopyField value={portalUrls.linkedRoleRedirectUri} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </PanelTabBody>
              ) : null}

              {tab === "menu" ? (
                <PanelTabBody tabKey="menu" className="mt-5 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <PanelField label="패널 제목">
                      <input
                        value={form.discordEmbedTitle}
                        onChange={(e) => setForm({ ...form, discordEmbedTitle: e.target.value })}
                        className="toss-admin-field"
                        placeholder="자판기"
                      />
                    </PanelField>
                    <PanelField label="액센트">
                      <div className="flex items-center gap-2">
                        <div
                          className="relative h-10 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-inner"
                          style={{ background: accent }}
                        >
                          <input
                            type="color"
                            value={accent}
                            onChange={(e) => setForm({ ...form, discordEmbedColor: e.target.value })}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          />
                        </div>
                        <input
                          value={form.discordEmbedColor}
                          onChange={(e) => setForm({ ...form, discordEmbedColor: e.target.value })}
                          className="toss-admin-field w-[108px] font-mono text-sm uppercase"
                          maxLength={7}
                        />
                      </div>
                    </PanelField>
                  </div>

                  <PanelField label="부제목">
                    <textarea
                      value={form.discordEmbedDescription}
                      onChange={(e) => setForm({ ...form, discordEmbedDescription: e.target.value })}
                      className="toss-admin-field min-h-[88px] resize-y"
                      rows={3}
                      placeholder="자판기 서비스 이용을 환영합니다."
                    />
                  </PanelField>

                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-neutral-300">메뉴 구성</p>
                      <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-neutral-500">
                        Secondary · 회색 버튼
                      </span>
                    </div>
                    <div className="space-y-2">
                      {MENU_BTNS.map((btn) => {
                        const on = form[btn.showKey];
                        return (
                          <div
                            key={btn.showKey}
                            className={`flex flex-wrap items-center gap-3 rounded-2xl border px-3.5 py-3 transition ${
                              on
                                ? "border-white/[0.1] bg-white/[0.035]"
                                : "border-white/[0.04] bg-transparent opacity-50"
                            }`}
                          >
                            <ToggleSwitch
                              size="sm"
                              checked={on}
                              onChange={(v) => setForm({ ...form, [btn.showKey]: v })}
                            />
                            <div className="min-w-0 flex-1">
                              {"sectionTitle" in btn ? (
                                <p className="mb-1 text-[10px] font-medium text-neutral-500">
                                  {btn.sectionTitle}
                                </p>
                              ) : (
                                <p className="mb-1 text-[10px] font-medium text-neutral-500">
                                  하단 버튼
                                </p>
                              )}
                              <input
                                value={form[btn.labelKey]}
                                onChange={(e) =>
                                  setForm({ ...form, [btn.labelKey]: e.target.value })
                                }
                                className="toss-admin-field w-full sm:max-w-[220px]"
                                placeholder={btn.fallback}
                                disabled={!on}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </PanelTabBody>
              ) : null}

              {tab === "logs" ? (
                <PanelTabBody tabKey="logs">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="size-3.5 text-neutral-500" />
                      <p className="text-xs font-semibold text-neutral-300">구매 로그</p>
                    </div>
                    <PanelField label="제목">
                      <input
                        value={form.discordPurchaseLogTitle}
                        onChange={(e) =>
                          setForm({ ...form, discordPurchaseLogTitle: e.target.value })
                        }
                        className="toss-admin-field"
                        placeholder="구매 로그"
                      />
                    </PanelField>
                    <PanelField label="템플릿">
                      <textarea
                        value={form.discordPurchaseLogTemplate}
                        onChange={(e) =>
                          setForm({ ...form, discordPurchaseLogTemplate: e.target.value })
                        }
                        className="toss-admin-field min-h-[110px] resize-y font-mono text-xs leading-relaxed"
                        rows={4}
                        placeholder={DEFAULT_PURCHASE_LOG_TEMPLATE}
                      />
                    </PanelField>
                    <PlaceholderChips items={["user", "product", "amount", "order"]} />
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="size-3.5 text-neutral-500" />
                      <p className="text-xs font-semibold text-neutral-300">후기 로그</p>
                    </div>
                    <PanelField label="제목">
                      <input
                        value={form.discordReviewLogTitle}
                        onChange={(e) =>
                          setForm({ ...form, discordReviewLogTitle: e.target.value })
                        }
                        className="toss-admin-field"
                        placeholder="후기 로그"
                      />
                    </PanelField>
                    <PanelField label="템플릿">
                      <textarea
                        value={form.discordReviewLogTemplate}
                        onChange={(e) =>
                          setForm({ ...form, discordReviewLogTemplate: e.target.value })
                        }
                        className="toss-admin-field min-h-[90px] resize-y font-mono text-xs leading-relaxed"
                        rows={3}
                        placeholder={DEFAULT_REVIEW_LOG_TEMPLATE}
                      />
                    </PanelField>
                    <PlaceholderChips items={["body", "product", "user"]} />
                  </div>
                </PanelTabBody>
              ) : null}

              {tab === "channels" ? (
                <PanelTabBody tabKey="channels">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-neutral-500">
                      봇이 가입한 서버의 텍스트 채널에서 선택합니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadChannels()}
                      disabled={channelsLoading || !form.discordGuildId}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-white/[0.07] disabled:opacity-40"
                    >
                      <RefreshCw className={`size-3 ${channelsLoading ? "animate-spin" : ""}`} />
                      {channelsLoading ? "불러오는 중…" : "새로고침"}
                    </button>
                  </div>

                  {channelsError ? (
                    <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      {channelsError}
                    </p>
                  ) : null}

                  {!channelsError && channels.length > 0 ? (
                    <p className="text-[11px] text-neutral-600">텍스트 채널 {channels.length}개</p>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {LOG_CHANNELS.map(([key, label]) => (
                      <PanelField
                        key={key}
                        label={key === "discordStockChannelId" ? "재고현황 채널" : `${label} 로그`}
                      >
                        <ChannelSelect
                          channels={channels}
                          value={form[key]}
                          onChange={(v) => setForm({ ...form, [key]: v })}
                          disabled={!channels.length}
                        />
                      </PanelField>
                    ))}
                  </div>
                </PanelTabBody>
              ) : null}

              {tab === "roles" ? (
                <PanelTabBody tabKey="roles">
                  <p className="text-xs text-neutral-500">
                    누적 구매금액이 기준 이상이면 디스코드 역할을 자동 지급합니다. 상품별 구매 역할은 상품 등록에서 설정하세요.
                  </p>
                  <div className="space-y-3">
                    {form.spendRoles.map((rule, idx) => (
                      <div key={`${rule.roleId}-${idx}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <PanelField label="누적 금액(원)">
                          <input
                            type="number"
                            min={0}
                            value={rule.minAmount}
                            onChange={(e) => {
                              const next = [...form.spendRoles];
                              next[idx] = { ...rule, minAmount: e.target.value };
                              setForm({ ...form, spendRoles: next });
                            }}
                            className="toss-admin-field"
                            placeholder="50000"
                          />
                        </PanelField>
                        <PanelField label="역할 ID">
                          <input
                            value={rule.roleId}
                            onChange={(e) => {
                              const next = [...form.spendRoles];
                              next[idx] = { ...rule, roleId: e.target.value };
                              setForm({ ...form, spendRoles: next });
                            }}
                            className="toss-admin-field font-mono text-sm"
                            placeholder="1234567890"
                          />
                        </PanelField>
                        <button
                          type="button"
                          className="toss-admin-ghost self-end px-3 py-2 text-xs text-red-300"
                          onClick={() =>
                            setForm({
                              ...form,
                              spendRoles: form.spendRoles.filter((_, i) => i !== idx),
                            })
                          }
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="toss-admin-ghost"
                      onClick={() =>
                        setForm({
                          ...form,
                          spendRoles: [...form.spendRoles, { minAmount: "", roleId: "" }],
                        })
                      }
                    >
                      누적 역할 추가
                    </button>
                  </div>
                </PanelTabBody>
              ) : null}
            </AnimatePresence>
          </PanelFrame>

          {/* Sticky preview */}
          <aside className="xl:sticky xl:top-4 xl:self-start space-y-3">
            <LivePreview
              shopName={shopName}
              enabled={form.discordBotEnabled}
              title={form.discordEmbedTitle}
              description={form.discordEmbedDescription}
              sections={previewSections}
              rowButtons={previewRowButtons}
            />
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-[11px] leading-relaxed text-neutral-500">
              메뉴 UI를 바꾸면 미리보기가 바로 갱신됩니다. 저장 후 Discord에서{" "}
              <code className="text-neutral-400">/버튼</code> 또는{" "}
              <code className="text-neutral-400">/자판기</code>로 확인하세요.
            </div>
          </aside>
        </div>

        {/* Actions */}
        <div className="admin-bento flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-5">
          <motion.button
            type="submit"
            disabled={saving}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100 disabled:opacity-40"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 저장 중…
              </>
            ) : (
              <>
                <Check className="size-4" /> 설정 저장
              </>
            )}
          </motion.button>
          <motion.button
            type="button"
            disabled={registering || !form.discordGuildId}
            onClick={() => void registerCommands()}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-neutral-200 transition hover:bg-white/[0.08] disabled:opacity-40"
          >
            {registering ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 등록 중…
              </>
            ) : (
              <>
                <Terminal className="size-4" /> 슬래시 명령 등록
              </>
            )}
          </motion.button>
          <p className="w-full text-[11px] text-neutral-600 sm:ml-auto sm:w-auto">
            Guild ID 저장 → 활성화 → 명령 등록 순서로 진행하세요.
          </p>
        </div>
      </motion.form>
    </>
  );
}
