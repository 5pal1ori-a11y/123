"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ImageIcon, Loader2, Megaphone } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { shopHeaders } from "@/lib/shop-client";

type ActiveAd = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  period: "week" | "month";
  endsAt: string | null;
};

type MineAd = {
  id: string;
  title: string;
  status: string;
  period: "week" | "month";
  amount: number;
  rejectReason: string | null;
};

export function MypageBannerAds({
  shopSlug,
  points,
  onPointsChange,
}: {
  shopSlug: string;
  points: number;
  onPointsChange?: (points: number) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [weeklyPrice, setWeeklyPrice] = useState(0);
  const [monthlyPrice, setMonthlyPrice] = useState(0);
  const [active, setActive] = useState<ActiveAd[]>([]);
  const [mine, setMine] = useState<MineAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/banners", {
        credentials: "include",
        headers: shopHeaders(shopSlug, false),
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        enabled: boolean;
        weeklyPrice: number;
        monthlyPrice: number;
        active: ActiveAd[];
        mine: MineAd[];
      };
      setEnabled(json.enabled);
      setWeeklyPrice(json.weeklyPrice);
      setMonthlyPrice(json.monthlyPrice);
      setActive(json.active ?? []);
      setMine(json.mine ?? []);
    } finally {
      setLoading(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (active.length <= 1) return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % active.length), 5000);
    return () => window.clearInterval(t);
  }, [active.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/banners", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({
          title,
          body,
          imageUrl: imageUrl.trim() || null,
          linkUrl: linkUrl.trim() || null,
          period,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        user?: { points: number };
      };
      if (!res.ok) throw new Error(json.error ?? "신청 실패");
      if (json.user && onPointsChange) onPointsChange(json.user.points);
      setMsg("배너 광고를 신청했어요. 관리자 승인 후 노출됩니다.");
      setOpenForm(false);
      setTitle("");
      setBody("");
      setImageUrl("");
      setLinkUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !enabled) return null;

  const current = active[slide] ?? active[0] ?? null;
  const price = period === "week" ? weeklyPrice : monthlyPrice;

  return (
    <div className="space-y-3">
      {current ? (
        <a
          href={current.linkUrl || undefined}
          target={current.linkUrl ? "_blank" : undefined}
          rel={current.linkUrl ? "noreferrer" : undefined}
          className={`mypage-ad-banner relative block overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a1d24] to-[#101217] ${
            current.linkUrl ? "cursor-pointer" : "cursor-default"
          }`}
          onClick={(e) => {
            if (!current.linkUrl) e.preventDefault();
          }}
        >
          {current.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.imageUrl}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-35"
            />
          ) : null}
          <div className="relative flex min-h-[88px] flex-col justify-center px-5 py-4 sm:min-h-[104px] sm:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
              AD
            </p>
            <p className="mt-1 text-base font-semibold text-white sm:text-lg">{current.title}</p>
            {current.body ? (
              <p className="mt-1 line-clamp-2 text-xs text-neutral-300 sm:text-sm">{current.body}</p>
            ) : null}
            {current.linkUrl ? (
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-neutral-300">
                자세히 보기 <ExternalLink className="size-3" />
              </span>
            ) : null}
          </div>
          {active.length > 1 ? (
            <div className="absolute bottom-2 right-3 flex gap-1">
              {active.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  aria-label={`배너 ${i + 1}`}
                  className={`size-1.5 rounded-full ${i === slide ? "bg-white" : "bg-white/30"}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSlide(i);
                  }}
                />
              ))}
            </div>
          ) : null}
        </a>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-4 text-center">
          <Megaphone className="mx-auto size-5 text-neutral-500" />
          <p className="mt-2 text-sm text-neutral-400">아직 노출 중인 배너가 없어요</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          주 {formatKRW(weeklyPrice)} · 월 {formatKRW(monthlyPrice)} · 보유 {formatKRW(points)}
        </p>
        <button
          type="button"
          onClick={() => setOpenForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.08]"
        >
          <ImageIcon className="size-3.5" />
          {openForm ? "닫기" : "배너 광고 신청"}
        </button>
      </div>

      {msg ? <p className="text-xs text-emerald-400">{msg}</p> : null}
      {error ? <p className="text-xs text-amber-300">{error}</p> : null}

      {openForm ? (
        <form
          onSubmit={(e) => void submit(e)}
          className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
        >
          <div className="flex gap-2">
            {(
              [
                ["week", `주간 ${formatKRW(weeklyPrice)}`],
                ["month", `월간 ${formatKRW(monthlyPrice)}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPeriod(id)}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  period === id
                    ? "bg-white text-black"
                    : "border border-white/10 text-neutral-400 hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={80}
            placeholder="배너 제목"
            className="toss-wizard-input w-full text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={280}
            placeholder="짧은 소개 (선택)"
            className="toss-wizard-input min-h-[72px] w-full resize-y text-sm"
          />
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="이미지 URL (선택)"
            className="toss-wizard-input w-full text-sm"
          />
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="클릭 시 이동 링크 (선택)"
            className="toss-wizard-input w-full text-sm"
          />
          <button
            type="submit"
            disabled={submitting || points < price}
            className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="mx-auto size-4 animate-spin" />
            ) : (
              `${formatKRW(price)} 포인트로 신청`
            )}
          </button>
        </form>
      ) : null}

      {mine.length > 0 ? (
        <ul className="space-y-1.5">
          {mine.slice(0, 3).map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[11px] text-neutral-400"
            >
              <span className="truncate">
                {m.title} · {m.period === "week" ? "주간" : "월간"}
              </span>
              <span
                className={
                  m.status === "pending"
                    ? "text-amber-300"
                    : m.status === "active"
                      ? "text-emerald-300"
                      : m.status === "rejected"
                        ? "text-red-300"
                        : ""
                }
              >
                {m.status === "pending"
                  ? "승인 대기"
                  : m.status === "active"
                    ? "노출 중"
                    : m.status === "rejected"
                      ? "거절됨"
                      : m.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
