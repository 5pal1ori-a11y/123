"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  Megaphone,
  MessageCircle,
  Pencil,
  Receipt,
  Store,
  Trash2,
} from "lucide-react";
import { formatKRW, formatDate } from "@/lib/utils";
import { LICENSE_PLAN_LABELS, LICENSE_PLAN_PRICES } from "@/lib/plans";
import type { BankInfo } from "@/lib/bank";
import type { LicensePlan, PlatformNotice, PlatformSupportMessage } from "@/lib/types";
import { SessionIdleGuard } from "@/components/session-idle-guard";

type Tab = "overview" | "pending" | "licenses" | "shops" | "notices" | "support";

type Payload = {
  stats: {
    pendingCount: number;
    moderationPendingCount?: number;
    licenseCount: number;
    shopCount: number;
    revenue: number;
    pendingLicenses: {
      id: string;
      buyerEmail: string;
      amount: number;
      reference: string;
      createdAt: string;
    }[];
  };
  licenses: {
    id: string;
    key: string | null;
    buyerEmail: string;
    plan?: LicensePlan;
    amount: number;
    status: string;
    reference: string;
    depositorName: string | null;
    createdAt: string;
    paidAt: string | null;
  }[];
  shops: {
    id: string;
    slug: string;
    name: string;
    ownerEmail: string;
    status: string;
    moderationStatus?: string;
    moderationReason?: string | null;
    moderationFlaggedAt?: string | null;
    url: string;
    createdAt: string;
  }[];
  bank: BankInfo;
};

export function PlatformAdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [issuePlan, setIssuePlan] = useState<LicensePlan>("pro");
  const [issueEmail, setIssueEmail] = useState("");
  const [issueCount, setIssueCount] = useState("1");
  const [issuing, setIssuing] = useState(false);
  const [issuedKeys, setIssuedKeys] = useState<string[]>([]);
  const [notices, setNotices] = useState<PlatformNotice[]>([]);
  const [noticeForm, setNoticeForm] = useState({ title: "", body: "", pinned: false });
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [supportMessages, setSupportMessages] = useState<PlatformSupportMessage[]>([]);
  const [supportReplies, setSupportReplies] = useState<Record<string, string>>({});
  const [supportLoading, setSupportLoading] = useState(false);

  const loadSupport = useCallback(async () => {
    setSupportLoading(true);
    try {
      const res = await fetch("/api/platform/support?scope=platform", { credentials: "include" });
      if (res.ok) {
        const json = (await res.json()) as { messages: PlatformSupportMessage[] };
        setSupportMessages(json.messages ?? []);
      }
    } finally {
      setSupportLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/platform/admin", { credentials: "include" });
    if (res.status === 401) {
      router.replace("/platform-admin/login");
      return;
    }
    if (!res.ok) {
      setMsg("관리자 데이터를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }
    setData((await res.json()) as Payload);
    const noticeRes = await fetch("/api/platform/notices");
    if (noticeRes.ok) {
      const json = (await noticeRes.json()) as { notices: PlatformNotice[] };
      setNotices(json.notices);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "support") void loadSupport();
  }, [tab, loadSupport]);

  async function logout() {
    await fetch("/api/auth/platform/logout", { method: "POST", credentials: "include" });
    router.push("/platform-admin/login");
  }

  const sessionPing = useCallback(() => {
    void fetch("/api/auth/platform/me", { credentials: "include" });
  }, []);

  async function issueCodes(e: React.FormEvent) {
    e.preventDefault();
    setIssuing(true);
    setMsg(null);
    try {
      const count = Math.min(20, Math.max(1, Number(issueCount) || 1));
      const res = await fetch("/api/platform/admin/licenses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issue",
          plan: issuePlan,
          buyerEmail: issueEmail.trim() || undefined,
          count,
        }),
      });
      const json = (await res.json()) as { error?: string; keys?: (string | null)[]; licenses?: { key: string | null }[] };
      if (!res.ok) throw new Error(json.error ?? "발급 실패");
      const keys = (json.keys ?? json.licenses?.map((l) => l.key) ?? []).filter(
        (k): k is string => Boolean(k),
      );
      setIssuedKeys(keys);
      setMsg(`${LICENSE_PLAN_LABELS[issuePlan]} 라이선스 ${keys.length}개 발급`);
      setTab("licenses");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "오류");
    } finally {
      setIssuing(false);
    }
  }

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setMsg("코드를 복사했어요.");
    } catch {
      setMsg("복사에 실패했어요.");
    }
  }

  async function copyAllKeys() {
    if (issuedKeys.length === 0) return;
    try {
      await navigator.clipboard.writeText(issuedKeys.join("\n"));
      setMsg("발급된 코드를 모두 복사했어요.");
    } catch {
      setMsg("복사에 실패했어요.");
    }
  }

  async function approveLicense(licenseId: string) {
    setApproving(licenseId);
    setMsg(null);
    try {
      const res = await fetch("/api/platform/admin/licenses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "승인 실패");
      setMsg(`라이선스 발급: ${json.license.key}`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "오류");
    } finally {
      setApproving(null);
    }
  }

  async function removeShop(shopId: string, name: string) {
    if (!confirm(`「${name}」 상점을 정말 삭제할까요?\n관련 상품·주문·회원 데이터가 함께 삭제됩니다.`)) {
      return;
    }
    setMsg(null);
    try {
      const res = await fetch("/api/platform/admin/shops", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      const json = (await res.json()) as { error?: string; name?: string };
      if (!res.ok) throw new Error(json.error ?? "삭제 실패");
      setMsg(`상점「${json.name ?? name}」을(를) 삭제했어요.`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "오류");
    }
  }

  async function reviewShop(shopId: string, decision: "approve" | "reject", name: string) {
    const note =
      decision === "reject"
        ? window.prompt(`「${name}」 거절 사유 (선택)`) ?? undefined
        : undefined;
    if (decision === "reject" && note === null) return;
    setMsg(null);
    try {
      const res = await fetch("/api/platform/admin/shops", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, decision, note: note || undefined }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "처리 실패");
      setMsg(decision === "approve" ? `「${name}」 상점을 승인했어요.` : `「${name}」 상점을 거절했어요.`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "오류");
    }
  }

  function resetNoticeForm() {
    setNoticeForm({ title: "", body: "", pinned: false });
    setEditingNoticeId(null);
  }

  function startEditNotice(notice: PlatformNotice) {
    setEditingNoticeId(notice.id);
    setNoticeForm({
      title: notice.title,
      body: notice.body,
      pinned: notice.pinned,
    });
  }

  async function submitNotice(e: React.FormEvent) {
    e.preventDefault();
    setNoticeSaving(true);
    setMsg(null);
    try {
      const isEdit = Boolean(editingNoticeId);
      const res = await fetch("/api/platform/notices", {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: editingNoticeId, ...noticeForm } : noticeForm),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? (isEdit ? "수정 실패" : "등록 실패"));
      resetNoticeForm();
      setMsg(isEdit ? "공지를 수정했어요." : "공지를 등록했어요.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "오류");
    } finally {
      setNoticeSaving(false);
    }
  }

  async function removeNotice(id: string) {
    if (!confirm("이 공지를 삭제할까요?")) return;
    setMsg(null);
    try {
      const res = await fetch("/api/platform/notices", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "삭제 실패");
      setMsg("공지를 삭제했어요.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "오류");
    }
  }

  if (loading || !data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }

  const moderationPending = data.shops.filter((s) => s.moderationStatus === "pending_review");
  const tabs: { id: Tab; label: string; icon: typeof BarChart3; badge?: number }[] = [
    { id: "overview", label: "개요", icon: BarChart3 },
    { id: "pending", label: "승인 대기", icon: Clock, badge: data.stats.pendingCount },
    { id: "licenses", label: "라이선스", icon: KeyRound },
    {
      id: "shops",
      label: "상점",
      icon: Store,
      badge: data.stats.moderationPendingCount || moderationPending.length || undefined,
    },
    { id: "notices", label: "공지", icon: Megaphone },
    {
      id: "support",
      label: "문의",
      icon: MessageCircle,
      badge: supportMessages.filter((m) => m.status === "open").length || undefined,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-white">
      <SessionIdleGuard onIdle={() => void logout()} onPing={sessionPing} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-500">vendix.team/platform-admin</p>
          <h1 className="text-2xl font-bold">플랫폼 관리</h1>
        </div>
        <button type="button" onClick={logout} className="landing-btn-outline gap-2 text-xs">
          <LogOut className="size-4" /> 로그아웃
        </button>
      </div>

      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto border-b border-white/10 px-4 pb-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                tab === t.id ? "bg-white text-black" : "bg-white/10 text-neutral-300 hover:bg-white/15"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
              {t.badge ? (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">{t.badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {msg && (
        <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          {msg}
        </p>
      )}

      <form onSubmit={issueCodes} className="admin-card space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4" /> 라이선스 코드 발급
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            플랜을 고르면 바로 사용 가능한 키가 만들어져요. Discord로 상점 개설할 때 쓰면 됩니다.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="text-xs text-neutral-500">플랜</span>
            <select
              value={issuePlan}
              onChange={(e) => setIssuePlan(e.target.value as LicensePlan)}
              className="admin-input"
            >
              {(Object.keys(LICENSE_PLAN_LABELS) as LicensePlan[]).map((id) => (
                <option key={id} value={id}>
                  {LICENSE_PLAN_LABELS[id]} · {formatKRW(LICENSE_PLAN_PRICES[id])}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-neutral-500">받는 사람 이메일 (선택)</span>
            <input
              type="email"
              value={issueEmail}
              onChange={(e) => setIssueEmail(e.target.value)}
              placeholder="optional@email.com"
              className="admin-input"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-neutral-500">수량</span>
            <input
              type="number"
              min={1}
              max={20}
              value={issueCount}
              onChange={(e) => setIssueCount(e.target.value)}
              className="admin-input"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={issuing} className="admin-btn w-full disabled:opacity-40">
              {issuing ? <Loader2 className="size-4 animate-spin" /> : "코드 발급"}
            </button>
          </div>
        </div>
        {issuedKeys.length > 0 && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">방금 발급한 코드</p>
              <button type="button" onClick={() => void copyAllKeys()} className="landing-btn-outline px-3 py-1.5 text-xs">
                모두 복사
              </button>
            </div>
            <ul className="space-y-1.5">
              {issuedKeys.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => void copyKey(key)}
                    className="inline-flex max-w-full items-center gap-2 font-mono text-sm text-green-300 hover:text-white"
                  >
                    {key} <Copy className="size-3.5 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      {tab === "overview" && (
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Clock, label: "승인 대기", value: `${data.stats.pendingCount}건`, accent: "text-orange-400" },
              { icon: KeyRound, label: "전체 라이선스", value: `${data.stats.licenseCount}건` },
              { icon: Building2, label: "등록 상점", value: `${data.stats.shopCount}개` },
              { icon: Receipt, label: "누적 매출", value: formatKRW(data.stats.revenue) },
            ].map((s) => (
              <div key={s.label} className="landing-glass-blur rounded-xl p-5">
                <s.icon className={`size-5 ${s.accent ?? "text-neutral-400"}`} />
                <p className="mt-3 text-xs text-neutral-500">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="landing-glass-blur rounded-xl p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Receipt className="size-4" /> 플랫폼 입금 계좌
            </h2>
            <p className="mt-3 text-sm text-neutral-300">
              {data.bank.bankName} {data.bank.accountNumber}
            </p>
            <p className="text-xs text-neutral-500">예금주 {data.bank.accountHolder}</p>
          </div>
        </section>
      )}

      {tab === "pending" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">입금 확인 · 라이선스 승인</h2>
          {data.stats.pendingLicenses.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-neutral-500">
              대기 중인 라이선스 주문이 없습니다.
            </p>
          ) : (
            data.stats.pendingLicenses.map((l) => (
              <div
                key={l.id}
                className="landing-glass-blur flex flex-wrap items-center justify-between gap-4 rounded-xl p-4"
              >
                <div>
                  <p className="font-medium">{l.buyerEmail}</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {formatKRW(l.amount)} · 참조코드{" "}
                    <code className="text-white">{l.reference}</code>
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{formatDate(l.createdAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={approving === l.id}
                  onClick={() => approveLicense(l.id)}
                  className="landing-btn flex items-center gap-2 text-sm disabled:opacity-40"
                >
                  {approving === l.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  승인 · 키 발급
                </button>
              </div>
            ))
          )}
        </section>
      )}

      {tab === "licenses" && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">전체 라이선스</h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/5 text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-3">이메일</th>
                  <th className="px-4 py-3">플랜</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">키</th>
                  <th className="px-4 py-3">금액</th>
                  <th className="px-4 py-3">일시</th>
                </tr>
              </thead>
              <tbody>
                {data.licenses.map((l) => (
                  <tr key={l.id} className="border-b border-white/5">
                    <td className="px-4 py-3">{l.buyerEmail}</td>
                    <td className="px-4 py-3 text-xs">{l.plan ? LICENSE_PLAN_LABELS[l.plan] : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          l.status === "pending"
                            ? "bg-orange-500/20 text-orange-300"
                            : l.status === "unused"
                              ? "bg-green-500/20 text-green-300"
                              : "bg-neutral-500/20 text-neutral-300"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {l.key ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-white"
                          onClick={() => navigator.clipboard.writeText(l.key!)}
                        >
                          {l.key.slice(0, 18)}… <Copy className="size-3" />
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">{formatKRW(l.amount)}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{formatDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "shops" && (
        <section className="space-y-6">
          {moderationPending.length > 0 ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Clock className="size-4 text-amber-300" />
                상점명 검열 대기
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs text-amber-200">
                  {moderationPending.length}
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {moderationPending.map((s) => (
                  <div
                    key={`mod-${s.id}`}
                    className="landing-glass-blur rounded-xl border border-amber-400/25 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="font-mono text-xs text-neutral-400">{s.slug}.vendix.team</p>
                      </div>
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-200">
                        REVIEW
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">{s.ownerEmail}</p>
                    {s.moderationReason ? (
                      <p className="mt-2 rounded-lg bg-black/30 px-2.5 py-2 text-xs leading-relaxed text-amber-100/90">
                        {s.moderationReason}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void reviewShop(s.id, "approve", s.name)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/15 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/25"
                      >
                        <CheckCircle2 className="size-3.5" /> 승인
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewShop(s.id, "reject", s.name)}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-400/15 px-2.5 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-400/25"
                      >
                        거절
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeShop(s.id, s.name)}
                        className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-200"
                      >
                        <Trash2 className="size-3.5" /> 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">등록된 상점</h2>
            {data.shops.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-neutral-500">
                등록된 상점이 없습니다.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.shops.map((s) => (
                  <div key={s.id} className="landing-glass-blur rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{s.name}</p>
                        <p className="font-mono text-xs text-neutral-400">{s.slug}.vendix.team</p>
                      </div>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase">
                        {s.moderationStatus === "pending_review"
                          ? "review"
                          : s.moderationStatus === "rejected"
                            ? "rejected"
                            : s.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">{s.ownerEmail}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-neutral-300 underline"
                      >
                        상점 열기
                      </a>
                      <button
                        type="button"
                        onClick={() => void removeShop(s.id, s.name)}
                        className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-200"
                      >
                        <Trash2 className="size-3.5" /> 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "notices" && (
        <section className="grid gap-6 lg:grid-cols-5">
          <form onSubmit={submitNotice} className="admin-card space-y-4 p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Megaphone className="size-4" /> {editingNoticeId ? "공지 수정" : "공지 작성"}
            </h2>
            <label className="block space-y-1.5">
              <span className="text-xs text-neutral-500">제목</span>
              <input
                value={noticeForm.title}
                onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                className="admin-input"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-neutral-500">내용</span>
              <textarea
                value={noticeForm.body}
                onChange={(e) => setNoticeForm({ ...noticeForm, body: e.target.value })}
                className="admin-input min-h-36 resize-y"
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={noticeForm.pinned}
                onChange={(e) => setNoticeForm({ ...noticeForm, pinned: e.target.checked })}
              />
              상단 고정
            </label>
            <div className="flex gap-2">
              {editingNoticeId ? (
                <button
                  type="button"
                  onClick={resetNoticeForm}
                  className="admin-btn flex-1 bg-white/5 hover:bg-white/10"
                >
                  취소
                </button>
              ) : null}
              <button
                type="submit"
                disabled={noticeSaving}
                className={`admin-btn disabled:opacity-40 ${editingNoticeId ? "flex-1" : "w-full"}`}
              >
                {noticeSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : editingNoticeId ? (
                  "수정 저장"
                ) : (
                  "공지 등록"
                )}
              </button>
            </div>
          </form>

          <div className="space-y-3 lg:col-span-3">
            <h2 className="text-lg font-semibold">공지 목록</h2>
            {notices.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-neutral-500">
                등록된 공지가 없습니다.
              </p>
            ) : (
              notices.map((n) => (
                <div key={n.id} className="landing-glass-blur rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{n.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{n.body}</p>
                      <p className="mt-2 text-xs text-neutral-500">
                        {formatDate(n.createdAt)}
                        {n.pinned ? " · 고정" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditNotice(n)}
                        className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white"
                        aria-label="수정"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeNotice(n.id)}
                        className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-red-300"
                        aria-label="삭제"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {tab === "support" && (
        <section className="admin-card space-y-4 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <MessageCircle className="size-4" /> 상점 문의함
          </h2>
          {supportLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-neutral-500" />
            </div>
          ) : supportMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">아직 문의가 없어요.</p>
          ) : (
            <div className="space-y-4">
              {supportMessages.map((m) => (
                <div key={m.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">
                        {m.shopName}{" "}
                        <span className="text-xs font-normal text-neutral-500">({m.shopSlug})</span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        {m.senderEmail} · {formatDate(m.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] ${
                        m.status === "open" ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300"
                      }`}
                    >
                      {m.status === "open" ? "대기" : "답변완료"}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-300">{m.body}</p>
                  {m.aiReply ? (
                    <div className="mt-3 rounded-xl border border-neutral-500/20 bg-neutral-500/5 p-3 text-sm text-neutral-300">
                      <p className="mb-1 text-xs font-medium text-neutral-300">DOES 안내 AI (1차)</p>
                      <p className="whitespace-pre-wrap">{m.aiReply}</p>
                    </div>
                  ) : null}
                  {m.reply ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-neutral-300">
                      <p className="mb-1 text-xs font-medium text-accent">내 답변</p>
                      {m.reply}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={supportReplies[m.id] ?? ""}
                        onChange={(e) =>
                          setSupportReplies({ ...supportReplies, [m.id]: e.target.value })
                        }
                        placeholder={m.aiReply ? "AI 답변 이후 추가 안내 (선택)" : "답변 작성"}
                        className="admin-input min-h-[80px]"
                      />
                      <button
                        type="button"
                        className="admin-btn text-xs"
                        onClick={async () => {
                          const reply = supportReplies[m.id]?.trim();
                          if (!reply) return;
                          const res = await fetch("/api/platform/support", {
                            method: "PATCH",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: m.id, reply }),
                          });
                          if (res.ok) {
                            setMsg("답변을 등록했어요.");
                            setSupportReplies({ ...supportReplies, [m.id]: "" });
                            await loadSupport();
                          }
                        }}
                      >
                        답변 보내기
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
