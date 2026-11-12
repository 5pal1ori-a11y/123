"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, ExternalLink, Loader2, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";
import type { HypixelStats } from "@/lib/world/minecraft";
import type { MissionStatus, PublicCoupon, PublicRecipe } from "@/lib/world/server";
import { useCountUp } from "@/components/shop/diamond-mine";
import { NextBoxCountdown, type GiftState } from "@/components/shop/random-box-gift";
import { diamondUrl, tokenUrl } from "./pixel-art";
import { drawSkinFront, loadSkin } from "./skin2d";

export type TokenLog = { at: string; delta: number; reason: string };

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function TokenIcon({ size = 18 }: { size?: number }) {
  const mounted = useMounted();
  if (!mounted) return <span style={{ width: size, height: size, display: "inline-block" }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={tokenUrl()} alt="토큰" width={size} height={size} style={{ imageRendering: "pixelated" }} />;
}

function GuiFrame({
  title,
  onClose,
  children,
  wide,
  variant = "chest",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  /** chest: 회색 마크 인벤토리 창 · book: 책과 깃펜 페이지 */
  variant?: "chest" | "book";
}) {
  return (
    <div className="mcw-gui-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className={`mcw-gui ${wide ? "is-wide" : ""} ${variant === "book" ? "is-book" : ""}`}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        role="dialog"
        aria-label={title}
      >
        <div className="mcw-gui-head">
          <b>{title}</b>
          <button type="button" onClick={onClose} aria-label="닫기 (E · ESC)" title="닫기 (E · ESC)">
            <X />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

/** 토큰을 마크 인벤토리처럼 64개씩 묶어 27칸 + 핫바 9칸에 채운다 */
function TokenInventory({ tokens }: { tokens: number }) {
  const stacks = Array.from({ length: 36 }, (_, i) => Math.max(0, Math.min(64, tokens - i * 64)));
  const overflow = tokens > 36 * 64;
  const slot = (n: number, i: number) => (
    <span key={i} className="mcw-slot is-inv">
      {n > 0 ? (
        <>
          <TokenIcon size={24} />
          {n > 1 ? <b>{i === 35 && overflow ? "64+" : n}</b> : null}
        </>
      ) : null}
    </span>
  );
  return (
    <div className="mcw-inv">
      <p className="mcw-gui-sub">인벤토리</p>
      <div className="mcw-inv-grid">{stacks.slice(9).map((n, i) => slot(n, i + 9))}</div>
      <div className="mcw-inv-grid is-hotbar">{stacks.slice(0, 9).map((n, i) => slot(n, i))}</div>
    </div>
  );
}

/* ───────────── 제작대 ───────────── */

export function CraftingGui({
  shopSlug,
  tokens,
  recipes,
  onCrafted,
  onClose,
}: {
  shopSlug: string;
  tokens: number;
  recipes: PublicRecipe[];
  onCrafted: (tokens: number) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<PublicRecipe | null>(recipes[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ name: string; links: { label: string; url: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyCraftable, setOnlyCraftable] = useState(false);

  const slots = useMemo(() => {
    if (!pick) return Array.from({ length: 9 }, () => 0);
    const n = pick.tokens;
    const per = Math.ceil(n / 9);
    return Array.from({ length: 9 }, (_, i) => Math.max(0, Math.min(per, n - i * per)));
  }, [pick]);

  const craft = async () => {
    if (!pick || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/world/craft", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ recipeId: pick.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; tokens?: number; product?: { name: string }; links?: { label: string; url: string }[] };
      if (!res.ok) throw new Error(data.error || "제작에 실패했어요");
      onCrafted(data.tokens ?? tokens - pick.tokens);
      setResult({ name: data.product?.name ?? pick.name, links: data.links ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "제작에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  const enough = pick ? tokens >= pick.tokens : false;
  const ready = Boolean(pick && enough && pick.inStock);
  const shown = onlyCraftable ? recipes.filter((r) => r.inStock && tokens >= r.tokens) : recipes;

  return (
    <GuiFrame title="제작대" onClose={onClose} wide>
      <div className="mcw-craft">
        {/* 레시피 책 */}
        <div className="mcw-book">
          <div className="mcw-book-head">
            <span>레시피 책</span>
            <button type="button" className={`mcw-book-filter ${onlyCraftable ? "is-on" : ""}`} onClick={() => setOnlyCraftable((v) => !v)}>
              {onlyCraftable ? "제작 가능만" : "전체"}
            </button>
          </div>
          {shown.length === 0 ? <p className="mcw-empty">{recipes.length === 0 ? "아직 등록된 제작법이 없어요" : "지금 만들 수 있는 게 없어요"}</p> : null}
          <div className="mcw-book-grid">
            {shown.map((r) => {
              const can = r.inStock && tokens >= r.tokens;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`mcw-slot is-recipe ${can ? "is-can" : "is-cant"} ${pick?.id === r.id ? "is-on" : ""}`}
                  onClick={() => {
                    setPick(r);
                    setResult(null);
                    setError(null);
                  }}
                  title={`${r.name} · 토큰 ${r.tokens}개${r.inStock ? "" : " · 품절"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <span className="mcw-noimg">?</span>}
                  <b>{r.tokens}</b>
                </button>
              );
            })}
          </div>
        </div>

        {/* 제작 칸 */}
        <div className="mcw-table">
          <p className="mcw-gui-sub">제작</p>
          <div className="mcw-table-row">
            <div className="mcw-grid3">
              {slots.map((n, i) => (
                <span key={i} className="mcw-slot">
                  {n > 0 ? (
                    <>
                      <TokenIcon size={30} />
                      {n > 1 ? <b>{n}</b> : null}
                    </>
                  ) : null}
                </span>
              ))}
            </div>
            <span className={`mcw-arrow ${ready ? "is-ready" : ""}`} aria-hidden />
            <button
              type="button"
              className={`mcw-slot is-result ${ready ? "is-ready" : ""}`}
              disabled={!ready || busy}
              onClick={() => void craft()}
              title="클릭해서 제작"
            >
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : pick?.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pick.thumbnail} alt="" />
              ) : pick ? (
                <span className="mcw-noimg">?</span>
              ) : null}
            </button>
          </div>

          {/* 마크 아이템 툴팁 모양 정보 상자 */}
          {pick ? (
            <div className="mcw-tooltip">
              <b>{pick.name}</b>
              <span className="is-lore">정가 {formatKRW(pick.price)}</span>
              <span className={enough ? "is-good" : "is-bad"}>
                재료: 월드 토큰 × {pick.tokens} (보유 {tokens})
              </span>
              {!pick.inStock ? <span className="is-bad">재고 없음</span> : null}
            </div>
          ) : null}

          <button type="button" className="mc-btn is-green" disabled={!ready || busy} onClick={() => void craft()}>
            {busy ? "제작 중…" : !pick ? "제작법을 고르세요" : !pick.inStock ? "품절" : enough ? "제작하기" : `토큰 ${pick.tokens - tokens}개 부족`}
          </button>
          {error ? <p className="mcw-error">{error}</p> : null}
          {result ? (
            <div className="mcw-result">
              <p>
                <Check /> <b>{result.name}</b> 제작 완료! 주문 내역에서도 확인할 수 있어요.
              </p>
              {result.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="mc-btn is-sm">
                  {l.label} <ExternalLink />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <TokenInventory tokens={tokens} />
    </GuiFrame>
  );
}

/* ───────────── 일일 미션 ───────────── */

export function MissionGui({
  shopSlug,
  mission,
  tokens,
  log,
  onClaimed,
  onClose,
}: {
  shopSlug: string;
  mission: MissionStatus;
  tokens: number;
  log: TokenLog[];
  onClaimed: (tokens: number, mission: MissionStatus) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/world/mission", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; tokens?: number; mission?: MissionStatus };
      if (!res.ok) throw new Error(data.error || "보상을 받을 수 없어요");
      onClaimed(data.tokens ?? tokens, data.mission ?? mission);
    } catch (err) {
      setError(err instanceof Error ? err.message : "보상을 받을 수 없어요");
    } finally {
      setBusy(false);
    }
  };

  const progress = !mission ? 0 : mission.claimed || mission.done ? 1 : 0.35;

  return (
    <GuiFrame title="일일 미션" onClose={onClose} variant="book">
      <div className="mcw-book-page">
        <p className="mcw-page-no">{mission ? mission.dayKey : "오늘"} · 1 / 1</p>
        {!mission ? (
          <p className="mcw-empty">오늘은 미션이 없어요. 내일 다시 와 주세요!</p>
        ) : (
          <>
            <h3 className="mcw-mission-title">{mission.title}</h3>
            <p className="mcw-mission-desc">{mission.desc}</p>
            <div className="mcw-mission-reward">
              <span className="mcw-slot is-inv">
                <TokenIcon size={26} />
                {mission.tokens > 1 ? <b>{mission.tokens}</b> : null}
              </span>
              <span>
                보상 · 월드 토큰 <b>{mission.tokens}개</b>
              </span>
            </div>
            {/* 경험치 바 모양 진행도 */}
            <div className={`mcw-xp ${mission.claimed ? "is-claimed" : ""}`} aria-label="진행도">
              <i style={{ width: `${progress * 100}%` }} />
            </div>
            <p className={`mcw-mission-state ${mission.claimed ? "is-claimed" : mission.done ? "is-done" : ""}`}>
              {mission.claimed ? "✔ 오늘 보상을 받았어요" : mission.done ? "★ 미션 완료! 보상을 받으세요" : "… 아직 진행 중이에요"}
            </p>
            <button type="button" className="mc-btn is-green" disabled={!mission.done || mission.claimed || busy} onClick={() => void claim()}>
              {busy ? "받는 중…" : mission.claimed ? "받기 완료" : "보상 받기"}
            </button>
            {error ? <p className="mcw-error">{error}</p> : null}
          </>
        )}
        <div className="mcw-page-rule" />
        <p className="mcw-label">
          보유 토큰 <TokenIcon size={14} /> <b>{tokens}</b> · 스폰 왼쪽 제작대에서 상품으로 바꿔요
        </p>
        <ul className="mcw-log">
          {log.length === 0 ? <li className="mcw-empty">아직 기록이 없어요</li> : null}
          {log.slice(0, 6).map((l, i) => (
            <li key={`${l.at}-${i}`}>
              <span>{l.reason}</span>
              <b className={l.delta > 0 ? "is-plus" : "is-minus"}>
                {l.delta > 0 ? "+" : ""}
                {l.delta}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </GuiFrame>
  );
}

/* ───────────── 출석 광산 ───────────── */

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function lastDays(today: string, n: number) {
  const base = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base.getTime() - (n - 1 - i) * 86_400_000);
    return { key: d.toISOString().slice(0, 10), label: WEEK[d.getUTCDay()] };
  });
}

export function AttendGui({ status, fresh, onClose }: { status: GiftState; fresh: boolean; onClose: () => void }) {
  const mounted = useMounted();
  const reduce = useReducedMotion();
  const amount = status.amount ?? 0;
  const shown = useCountUp(amount, mounted && fresh, reduce);
  const h = status.history;
  const days = h ? lastDays(h.today, 7) : [];
  const got = new Map((h?.days ?? []).map((d) => [d.dayKey, d]));

  return (
    <GuiFrame title="출석 광산" onClose={onClose}>
      <div className="mcw-book-page mcw-attend">
        <div className={`mcw-attend-hero ${status.jackpot ? "is-jackpot" : ""}`}>
          {mounted ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={diamondUrl()} alt="" width={56} height={56} className="mcw-attend-gem" />
          ) : (
            <span style={{ width: 56, height: 56 }} />
          )}
          <div>
            <p className="mcw-label">{status.jackpot ? "대박! 잭팟 다이아" : "오늘의 다이아"}</p>
            <p className="mcw-attend-amount">+{formatKRW(fresh ? shown : amount)}</p>
            <p className="mcw-attend-balance">보유 포인트 {formatKRW(status.balance)}</p>
          </div>
        </div>

        {h ? (
          <>
            <div className="mcw-attend-stats">
              <span>
                연속 <b>{h.streak}일</b>
              </span>
              <span>
                이번 달 <b>{h.monthDays}일</b>
              </span>
              <span>
                최고 연속 <b>{h.bestStreak}일</b>
              </span>
            </div>
            <ol className="mcw-attend-week">
              {days.map((d) => {
                const g = got.get(d.key);
                return (
                  <li key={d.key} className={`${g ? "is-got" : ""} ${g?.jackpot ? "is-jackpot" : ""} ${d.key === h.today ? "is-today" : ""}`}>
                    <span>{d.label}</span>
                    <i aria-hidden />
                    <small>{g ? g.amount.toLocaleString() : "-"}</small>
                  </li>
                );
              })}
            </ol>
          </>
        ) : null}

        <NextBoxCountdown className="mcw-attend-next" />
        <p className="mcw-label">매일 자정(한국 시간)에 원석이 다시 생겨요 · 대시보드 출석과 같은 보상이에요</p>
      </div>
    </GuiFrame>
  );
}

/* ───────────── 엔드: 판매 계정 진열 ───────────── */

export type GalleryAccount = {
  id: string;
  ign: string;
  uuid: string | null;
  slim: boolean;
  hasSkin: boolean;
  note: string;
  stats: HypixelStats | null;
  product: { id: string; slug: string; name: string; price: number; soldOut: boolean } | null;
};

/** 진열된 판매 계정 (스킨 · 하이픽셀 스탯 · 연결된 상품) */
export async function fetchGalleryAccounts(shopSlug: string): Promise<{ accounts: GalleryAccount[]; hypixel: boolean }> {
  const res = await fetch("/api/world/accounts", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { accounts?: GalleryAccount[]; hypixel?: boolean; error?: string };
  if (!res.ok) throw new Error(json.error || "불러오지 못했어요");
  return { accounts: json.accounts ?? [], hypixel: Boolean(json.hypixel) };
}

function SkinFigure({ uuid, slim, hasSkin, size = 6 }: { uuid: string | null; slim: boolean; hasSkin: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!uuid || !hasSkin || !ref.current) return;
    let alive = true;
    loadSkin(`/api/world/skin?uuid=${uuid}`)
      .then((img) => alive && ref.current && drawSkinFront(ref.current, img, slim, size))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [uuid, slim, hasSkin, size]);
  if (!uuid || !hasSkin || failed) return <div className="mcw-skin-empty" style={{ width: 16 * size, height: 32 * size }} />;
  return <canvas ref={ref} className="mcw-skin" style={{ width: 16 * size, height: 32 * size }} />;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mcw-stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function EndGallery({ shopSlug, onClose }: { shopSlug: string; onClose: () => void }) {
  const [data, setData] = useState<{ accounts: GalleryAccount[]; hypixel: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<GalleryAccount | null>(null);

  useEffect(() => {
    let alive = true;
    fetchGalleryAccounts(shopSlug)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "불러오지 못했어요"));
    return () => {
      alive = false;
    };
  }, [shopSlug]);

  return (
    <div className="mcw-end" role="dialog" aria-label="판매 계정">
      <div className="mcw-end-stars" aria-hidden />
      <div className="mcw-end-head">
        <div>
          <p className="mcw-end-kicker">THE END · 판매 계정</p>
          <h2>등록된 마크 계정</h2>
          <p className="mcw-end-sub">스킨 · 기본 닉네임 · 하이픽셀 스탯을 확인하세요</p>
        </div>
        <button type="button" className="mc-btn is-sm" onClick={onClose}>
          광장으로 돌아가기
        </button>
      </div>

      {error ? <p className="mcw-error">{error}</p> : null}
      {!data && !error ? (
        <div className="mcw-end-loading">
          <Loader2 className="animate-spin" />
        </div>
      ) : null}
      {data && data.accounts.length === 0 ? <p className="mcw-end-empty">아직 진열된 계정이 없어요</p> : null}

      {data ? (
        <div className="mcw-end-grid">
          {data.accounts.map((a) => (
            <button key={a.id} type="button" className="mcw-acc" onClick={() => setOpen(a)}>
              <SkinFigure uuid={a.uuid} slim={a.slim} hasSkin={a.hasSkin} size={5} />
              <b className="mcw-acc-name" style={a.stats?.rankColor ? { color: a.stats.rankColor } : undefined}>
                {a.stats?.rank ? `[${a.stats.rank}] ` : ""}
                {a.ign}
              </b>
              {a.stats ? (
                <span className="mcw-acc-meta">
                  Lv.{a.stats.level} · BW ✫{a.stats.bedwars.stars} · SW {a.stats.skywars.level}
                </span>
              ) : (
                <span className="mcw-acc-meta">{data.hypixel ? "하이픽셀 기록 없음" : "하이픽셀 스탯 준비 중"}</span>
              )}
              {a.product ? (
                <span className={`mcw-acc-price ${a.product.soldOut ? "is-out" : ""}`}>
                  {a.product.soldOut ? "품절" : formatKRW(a.product.price)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {open ? <AccountDetail account={open} hypixel={Boolean(data?.hypixel)} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** 계정 상세 창 — 스킨 · 하이픽셀 스탯 · NameMC · 구매 버튼 */
export function AccountDetail({
  account: open,
  hypixel,
  onClose,
  kicker = "기본 닉네임",
  market = false,
}: {
  account: GalleryAccount;
  hypixel: boolean;
  onClose: () => void;
  kicker?: string;
  market?: boolean;
}) {
  return (
    <div className="mcw-gui-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className={`mcw-acc-detail${market ? " is-market" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <button type="button" className="mcw-acc-close" onClick={onClose} aria-label="닫기">
          <X />
        </button>
        <div className="mcw-acc-detail-skin">
          <SkinFigure uuid={open.uuid} slim={open.slim} hasSkin={open.hasSkin} size={8} />
        </div>
        <div className="mcw-acc-detail-body">
          <p className="mcw-end-kicker">{kicker}</p>
          <h3 style={open.stats?.rankColor ? { color: open.stats.rankColor } : undefined}>
            {open.stats?.rank ? `[${open.stats.rank}] ` : ""}
            {open.ign}
          </h3>
          {open.note ? <p className="mcw-end-sub">{open.note}</p> : null}
          {open.stats ? (
            <div className="mcw-stats">
              <StatRow label="네트워크 레벨" value={open.stats.level} />
              <StatRow label="카르마" value={open.stats.karma.toLocaleString()} />
              <StatRow label="업적 포인트" value={open.stats.achievementPoints.toLocaleString()} />
              <StatRow label="베드워즈" value={`✫${open.stats.bedwars.stars} · ${open.stats.bedwars.wins}승 · FKDR ${open.stats.bedwars.fkdr}`} />
              <StatRow label="스카이워즈" value={`${open.stats.skywars.level} · ${open.stats.skywars.wins}승 · KDR ${open.stats.skywars.kdr}`} />
              <StatRow label="듀얼" value={`${open.stats.duels.wins}승 · ${open.stats.duels.kills}킬`} />
              {open.stats.firstLogin ? <StatRow label="첫 접속" value={open.stats.firstLogin.slice(0, 10)} /> : null}
            </div>
          ) : (
            <p className="mcw-end-sub">{hypixel ? "하이픽셀 기록이 없는 계정이에요." : "하이픽셀 스탯은 곧 표시돼요."}</p>
          )}
          {open.uuid ? (
            <a className="mcw-end-link" href={`https://namemc.com/profile/${open.uuid}`} target="_blank" rel="noreferrer">
              NameMC에서 보기 <ExternalLink />
            </a>
          ) : null}
          {open.product ? (
            <a className="mc-btn is-green" href={`/product/${open.product.slug}`}>
              {open.product.soldOut ? "품절 · 상품 보기" : `${formatKRW(open.product.price)} · 구매하러 가기`}
            </a>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

/** 계정 시장 진열대 앞에 서면 뜨는 작은 카드 — 조작은 막지 않고, E(또는 버튼)로 상세 창을 연다 */
export function StallCard({
  account: a,
  stall,
  hypixel,
  touch,
  onOpen,
}: {
  account: GalleryAccount;
  stall: number;
  hypixel: boolean;
  touch: boolean;
  onOpen: () => void;
}) {
  const s = a.stats;
  const price = a.product ? (a.product.soldOut ? "품절" : formatKRW(a.product.price)) : "가격 문의";
  return (
    <motion.div
      key={a.id}
      className="mcw-stall-card"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mcw-stall-skin">
        <SkinFigure uuid={a.uuid} slim={a.slim} hasSkin={a.hasSkin} size={4} />
      </div>
      <div className="mcw-stall-body">
        <p className="mcw-stall-kicker">{stall + 1}번 점포 · 기본 닉네임</p>
        <h4 style={s?.rankColor ? { color: s.rankColor } : undefined}>
          {s?.rank ? `[${s.rank}] ` : ""}
          {a.ign}
        </h4>
        {a.note ? <p className="mcw-stall-note">{a.note}</p> : null}
        {s ? (
          <div className="mcw-stall-stats">
            <span>
              레벨 <b>{s.level}</b>
            </span>
            <span>
              베드워즈 <b>✫{s.bedwars.stars}</b>
            </span>
            <span>
              스카이워즈 <b>{s.skywars.level}</b>
            </span>
            <span>
              듀얼 <b>{s.duels.wins}승</b>
            </span>
          </div>
        ) : (
          <p className="mcw-stall-note">{hypixel ? "하이픽셀 기록이 없는 계정이에요" : "하이픽셀 스탯 준비 중"}</p>
        )}
        <div className="mcw-stall-foot">
          <span className={`mcw-stall-price${a.product?.soldOut ? " is-out" : ""}`}>{price}</span>
          <button type="button" className="mcw-stall-open" onClick={onOpen}>
            {touch ? null : <kbd>E</kbd>}
            자세히 · 구매
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ───────────── 점프맵 쿠폰 ───────────── */

function useRemaining(expiresAt: string) {
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(new Date(expiresAt).getTime() - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  return Math.max(0, left);
}

export function CouponPopup({
  shopSlug,
  coupon,
  minutes,
  onClose,
  onRedeemed,
}: {
  shopSlug: string;
  coupon: PublicCoupon;
  minutes: number;
  onClose: () => void;
  onRedeemed: (balance: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [used, setUsed] = useState(Boolean(coupon.usedAt));
  const left = useRemaining(coupon.expiresAt);
  const mm = String(Math.floor(left / 60000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("쿠폰 번호", coupon.code);
    }
  };

  const redeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/coupon/redeem", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ code: coupon.code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; balance?: number; amount?: number };
      if (!res.ok) throw new Error(data.error || "사용할 수 없어요");
      setUsed(true);
      setMsg(`${formatKRW(data.amount ?? coupon.amount)} 충전 완료!`);
      onRedeemed(data.balance ?? 0);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "사용할 수 없어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mcw-gui-back">
      <motion.div
        className="cpn"
        initial={{ opacity: 0, scale: 0.9, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        role="dialog"
        aria-label="점프맵 쿠폰"
      >
        <p className="cpn-title">점프맵 완주!</p>
        <p className="cpn-amount">자판기 잔액 {formatKRW(coupon.amount)}</p>
        <p className="cpn-rule">
          {minutes}분 안에 사용 · 계정당 한 번
        </p>
        <p className="cpn-guide">디스코드 🏧 | 자판기의 쿠폰 사용에 입력하세요</p>
        <div className="cpn-code">{coupon.code}</div>
        <p className={`cpn-timer ${left === 0 || used ? "is-off" : ""}`}>
          {used ? "사용 완료된 쿠폰이에요" : left === 0 ? "사용 기한이 지났어요" : `남은 시간 ${mm}:${ss}`}
        </p>
        <div className="cpn-actions">
          <button type="button" className="cpn-btn is-primary" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "복사됨" : "복사"}
          </button>
          <button type="button" className="cpn-btn" onClick={onClose}>
            닫기
          </button>
        </div>
        {!used && left > 0 ? (
          <button type="button" className="cpn-link" disabled={busy} onClick={() => void redeem()}>
            {busy ? "사용 중…" : "사이트에서 바로 사용하기"}
          </button>
        ) : null}
        {msg ? <p className="cpn-msg">{msg}</p> : null}
      </motion.div>
    </div>
  );
}

/* ───────────── 사망 ───────────── */

export function DeathScreen({ killer, onRespawn }: { killer: string | null; onRespawn: () => void }) {
  const [wait, setWait] = useState(2);
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);
  return (
    <motion.div className="mcw-death" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <h2>사망했습니다!</h2>
      <p>{killer ? `${killer}님에게 당했어요` : "다시 일어나세요"}</p>
      <button type="button" className="mc-btn" disabled={wait > 0} onClick={onRespawn}>
        {wait > 0 ? `리스폰 (${wait})` : "리스폰"}
      </button>
    </motion.div>
  );
}
