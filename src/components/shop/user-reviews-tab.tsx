"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MessageSquareQuote, RefreshCw, Search } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import type { ReviewFeed, ReviewFeedItem } from "@/lib/review-feed";

type Filter = "all" | "site" | "discord";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "site", label: "사이트" },
  { id: "discord", label: "Discord" },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function UserReviewsTab({ shopSlug }: { shopSlug: string }) {
  const reduceMotion = useReducedMotion();
  const [feed, setFeed] = useState<ReviewFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(30);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/reviews/feed?limit=500", { headers: shopHeaders(shopSlug), cache: "no-store" });
      const data = (await res.json()) as ReviewFeed & { error?: string };
      if (!res.ok) throw new Error(data.error || "후기를 불러오지 못했어요");
      setFeed(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "후기를 불러오지 못했어요");
    } finally {
      setRefreshing(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (feed?.items ?? []).filter((r) => {
      if (filter !== "all" && r.source !== filter) return false;
      if (!q) return true;
      return [r.body, r.displayName, r.username, r.product, r.authorId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [feed, filter, query]);

  return (
    <div className="rv">
      <section className="mf-card rv-summary">
        <div className="rv-score">
          <span className="rv-live">
            <span className="mf-pulse" aria-hidden />
            실시간
          </span>
          <b className="tabular-nums">{feed ? feed.total.toLocaleString() : "-"}</b>
          <small>개의 후기 · 디스코드 후기 채널과 바로 연동돼요</small>
        </div>
      </section>

      <section className="mf-card">
        <div className="rv-tools">
          <label className="rv-search">
            <Search aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="내용, 디스코드 아이디, 상품으로 검색"
            />
          </label>
          <div className="rv-filters" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={filter === f.id ? "is-on" : ""}
                onClick={() => {
                  setFilter(f.id);
                  setShown(30);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className="mf-btn is-sm" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            새로고침
          </button>
        </div>

        {!feed && !error ? (
          <div className="rv-list">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="mf-skel" style={{ height: 96 }} />
            ))}
          </div>
        ) : error && !feed ? (
          <div className="mf-empty">
            <span>
              <MessageSquareQuote />
            </span>
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="mf-empty">
            <span>
              <MessageSquareQuote />
            </span>
            {feed?.total ? "조건에 맞는 후기가 없어요" : "아직 등록된 후기가 없어요"}
          </div>
        ) : (
          <>
            <ul className="rv-list">
              {items.slice(0, shown).map((r, i) => (
                <ReviewCard key={r.id} review={r} index={i} reduceMotion={Boolean(reduceMotion)} />
              ))}
            </ul>
            {items.length > shown ? (
              <button type="button" className="mf-btn rv-more" onClick={() => setShown((n) => n + 30)}>
                후기 더 보기 ({(items.length - shown).toLocaleString()}개 남음)
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function ReviewCard({ review: r, index, reduceMotion }: { review: ReviewFeedItem; index: number; reduceMotion: boolean }) {
  const initial = (r.displayName || "?").slice(0, 1).toUpperCase();
  return (
    <motion.li
      className="rv-card"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 10) * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="rv-card-head">
        {r.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="rv-avatar" src={r.avatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="rv-avatar">{initial}</span>
        )}
        <div className="rv-who">
          <b>{r.displayName}</b>
          <span>
            {r.username ? `@${r.username}` : null}
            {r.authorId ? <em>ID {r.authorId}</em> : null}
          </span>
        </div>
        <div className="rv-meta">
          <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
        </div>
      </div>
      <p className="rv-body">{r.body}</p>
      <div className="rv-tags">
        {r.product ? <span className="mf-chip">{r.product}</span> : null}
        <span className={`rv-src is-${r.source}`}>{r.source === "discord" ? "Discord" : "사이트"}</span>
      </div>
    </motion.li>
  );
}
