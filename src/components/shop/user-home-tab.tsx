"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarCheck,
  Check,
  Clock,
  Coins,
  Crown,
  Package,
  Percent,
  Receipt,
  ShieldHalf,
  ShoppingBag,
  Sparkle,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatKRW, formatTimeAgo } from "@/lib/utils";
import type { ProductWithStock, ShopEvent, ShopTier } from "@/lib/types";
import type { UserOrder } from "./user-dashboard-types";
import { MypageBannerAds } from "@/components/shop/mypage-banner-ads";
import { McHero } from "@/components/shop/mc-hero";

type HomeTab = "products" | "charge" | "history" | "attendance";

const ease = [0.22, 1, 0.36, 1] as const;

export function UserHomeTab({
  userName,
  shopName,
  welcomeMessage,
  points,
  totalCharged,
  tier,
  tierLoading,
  recentOrders,
  ordersLoading,
  activeEvents,
  products,
  onSwitchTab,
  restockNotes = [],
  shopSlug,
  onPointsChange,
}: {
  userName: string;
  shopName: string;
  welcomeMessage: string;
  points: number;
  totalCharged: number;
  tier: ShopTier | null;
  tierLoading: boolean;
  recentOrders: UserOrder[];
  ordersLoading: boolean;
  activeEvents: ShopEvent[];
  products: ProductWithStock[];
  onSwitchTab: (tab: HomeTab) => void;
  restockNotes?: { id: string; title: string; body: string; productId: string | null }[];
  shopSlug: string;
  onPointsChange?: (points: number) => void;
}) {
  const reduce = useReducedMotion();
  const rise = (i: number) => ({
    initial: reduce ? false : ({ opacity: 0, y: 12 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease, delay: 0.25 + i * 0.07 },
  });

  const fields = [
    { icon: Wallet, label: "보유 포인트", value: formatKRW(points) },
    { icon: TrendingUp, label: "누적 충전", value: formatKRW(totalCharged) },
    { icon: Crown, label: "회원 등급", value: tierLoading ? "…" : (tier?.name ?? "일반") },
    { icon: Receipt, label: "최근 구매", value: ordersLoading ? "…" : `${recentOrders.length}건` },
  ];

  const quick: { tab: HomeTab; icon: typeof Wallet; title: string; desc: string }[] = [
    { tab: "products", icon: ShoppingBag, title: "쇼핑하기", desc: "포인트로 바로 구매" },
    { tab: "charge", icon: Coins, title: "포인트 충전", desc: "계좌 · 상품권 · 코인" },
    { tab: "history", icon: Receipt, title: "이용 내역", desc: "구매 · 충전 기록" },
  ];

  return (
    <div className="mf-home">
      {shopSlug === "mfa" ? <McHero onShop={() => onSwitchTab("products")} /> : null}
      <MypageBannerAds shopSlug={shopSlug} points={points} onPointsChange={onPointsChange} />

      {restockNotes.length > 0 ? (
        <div className="grid gap-2">
          {restockNotes.slice(0, 3).map((n, i) => (
            <motion.button
              key={n.id}
              type="button"
              {...rise(i)}
              onClick={() => onSwitchTab("products")}
              className="mf-field is-button"
            >
              <span className="mf-field-icon">
                <BellRing />
              </span>
              <span className="mf-field-body">
                <span className="mf-field-label">재입고 알림</span>
                <span className="mf-field-value is-text">{n.title}</span>
              </span>
              <ArrowUpRight className="mf-arrow" />
            </motion.button>
          ))}
        </div>
      ) : null}

      <div className="mf-shell">
        <aside className="mf-side">
          <div className="mf-side-head">
            <span className="mf-brand-sm">DOES POINT</span>
            <span className="mf-chip is-dark">
              <Check />
              {tierLoading ? "회원" : (tier?.name ?? "일반 회원")}
            </span>
          </div>

          <div className="mf-stage">
            <motion.span
              className="mf-coin"
              aria-hidden
              animate={reduce ? undefined : { y: [0, -10, 0], rotateY: [0, 180, 360] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Coins />
            </motion.span>
            <span className="mf-stage-floor" />
            <p className="mf-stage-label">보유 포인트</p>
            <p className="mf-stage-amount">
              <CountUp value={points} />
            </p>
          </div>

          <div className="mf-identity">
            <span className="mf-identity-name">
              <span className="mf-avatar">{(userName || "?").slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0">
                <b>{userName}</b>
                <small>{shopName}</small>
              </span>
            </span>
            <button type="button" className="mf-btn is-sm" onClick={() => onSwitchTab("charge")}>
              <Coins />
              충전
            </button>
          </div>
          <p className="mf-caption">
            <Sparkle />
            오늘도 좋은 하루 보내세요
          </p>
        </aside>

        <section className="mf-info">
          <header className="mf-info-head">
            <div>
              <h1>
                <Greeting />, {userName}님
              </h1>
              <p>{welcomeMessage || "포인트로 바로 사고, 출석으로 매일 포인트를 받아가세요."}</p>
            </div>
            <button type="button" className="mf-btn is-primary" onClick={() => onSwitchTab("products")}>
              <ShoppingBag />
              <span>쇼핑하기</span>
            </button>
          </header>

          <div className="mf-fields">
            {fields.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.label} className="mf-field" {...rise(i)}>
                  <span className="mf-field-icon">
                    <Icon />
                  </span>
                  <span className="mf-field-body">
                    <span className="mf-field-label">{f.label}</span>
                    <span className="mf-field-value">{f.value}</span>
                  </span>
                </motion.div>
              );
            })}
          </div>

          <motion.button
            type="button"
            className="mf-notice is-button"
            onClick={() => onSwitchTab("attendance")}
            {...rise(4)}
          >
            <span className="mf-notice-icon">
              <CalendarCheck />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <b>오늘 출석체크 하셨나요?</b>
              <p>매일 한 번 다이아몬드를 캐고 최대 3,000원을 받아가세요.</p>
            </span>
            <ArrowRight className="mf-notice-arrow" />
          </motion.button>

          <motion.div className="mf-quick-links" {...rise(5)}>
            {quick.map((q) => {
              const Icon = q.icon;
              return (
                <button key={q.tab} type="button" className="mf-quick" onClick={() => onSwitchTab(q.tab)}>
                  <span className="mf-q-icon">
                    <Icon />
                  </span>
                  <span>
                    <b>{q.title}</b>
                    <small>{q.desc}</small>
                  </span>
                  <ArrowUpRight className="mf-q-arrow" />
                </button>
              );
            })}
            <Link href="/verify" className="mf-quick">
              <span className="mf-q-icon">
                <ShieldHalf />
              </span>
              <span>
                <b>서버 인증</b>
                <small>인증봇 · 복구키</small>
              </span>
              <ArrowUpRight className="mf-q-arrow" />
            </Link>
          </motion.div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.section className="mf-card" {...rise(6)}>
          <CardHead icon={Receipt} title="최근 구매" action="전체 내역" onAction={() => onSwitchTab("history")} />
          {ordersLoading ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((k) => (
                <div key={k} className="mf-skel" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              text="아직 구매 내역이 없어요"
              cta="쇼핑하러 가기"
              onCta={() => onSwitchTab("products")}
            />
          ) : (
            <ul className="grid gap-2">
              {recentOrders.map((order, i) => (
                <motion.li
                  key={order.id}
                  className="mf-row"
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease, delay: 0.5 + i * 0.06 }}
                >
                  <span className="mf-row-icon">
                    <Package />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{order.productName}</span>
                    <span className="mf-row-sub">
                      <Clock />
                      {formatTimeAgo(order.paidAt ?? order.createdAt)}
                    </span>
                  </span>
                  <span className="mf-mono shrink-0 text-[14px] font-semibold">{formatKRW(order.amount)}</span>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.section>

        <motion.section className="mf-card" {...rise(7)}>
          <CardHead icon={Percent} title="진행 중 이벤트" action="제품 보기" onAction={() => onSwitchTab("products")} />
          {activeEvents.length === 0 ? (
            <EmptyState icon={Percent} text="진행 중인 이벤트가 없어요" />
          ) : (
            <ul className="grid gap-2">
              {activeEvents.slice(0, 5).map((ev, i) => {
                const product = products.find((p) => p.id === ev.productId);
                return (
                  <motion.li
                    key={ev.id}
                    className="mf-row"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease, delay: 0.55 + i * 0.06 }}
                  >
                    <span className="mf-row-icon">
                      <Percent />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{product?.name ?? ev.title}</span>
                      <span className="mf-row-sub">{ev.title}</span>
                    </span>
                    <span className="mf-chip is-dark">-{ev.discountPercent}%</span>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </motion.section>
      </div>
    </div>
  );
}

function Greeting() {
  const [text, setText] = useState("안녕하세요");
  useEffect(() => {
    const h = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hour12: false }).format(new Date()),
    );
    setText(h < 6 ? "늦은 밤이에요" : h < 12 ? "좋은 아침이에요" : h < 18 ? "좋은 오후예요" : "좋은 저녁이에요");
  }, []);
  return <>{text}</>;
}

function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(value);
  useEffect(() => {
    if (reduce) {
      setN(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setN(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{formatKRW(n)}</>;
}

function CardHead({
  icon: Icon,
  title,
  action,
  onAction,
}: {
  icon: typeof Wallet;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mf-card-head">
      <span className="mf-q-icon">
        <Icon />
      </span>
      <h3>{title}</h3>
      {action ? (
        <button type="button" onClick={onAction} className="mf-btn is-ghost is-sm ml-auto">
          {action}
          <ArrowRight className="mf-btn-arrow" />
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
  cta,
  onCta,
}: {
  icon: typeof Wallet;
  text: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="mf-empty">
      <span>
        <Icon />
      </span>
      <p>{text}</p>
      {cta ? (
        <button type="button" className="mf-btn is-primary is-sm mt-3" onClick={onCta}>
          {cta}
          <ArrowRight className="mf-btn-arrow" />
        </button>
      ) : null}
    </div>
  );
}
