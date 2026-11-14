"use client";

import { useEffect, useState } from "react";
import type { McAccountInfo } from "@/lib/mc-account";
import { CapeIcon } from "@/components/shop/mc-account-card";

/** 마크계정 상품 상세: 스킨 렌더 + 보유 망토(이름) */
export function useMcAccountInfo(productId: string, version: string | null | undefined, enabled: boolean) {
  const [info, setInfo] = useState<McAccountInfo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch(`/api/mc-account/${encodeURIComponent(productId)}?v=${encodeURIComponent(version ?? "0")}`)
      .then((r) => (r.ok ? (r.json() as Promise<McAccountInfo>) : null))
      .then((d) => alive && setInfo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [productId, version, enabled]);
  return info;
}

export function McSkinHero({ productId, version, alt }: { productId: string; version?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/mc-account/${encodeURIComponent(productId)}?asset=skin&v=${encodeURIComponent(version ?? "0")}`}
      alt={alt}
      className="product-detail-image"
      style={{ objectFit: "contain", imageRendering: "pixelated", background: "#0b1020" }}
      onError={() => setFailed(true)}
    />
  );
}

export function McCapeChips({
  productId,
  version,
  info,
}: {
  productId: string;
  version?: string | null;
  info: McAccountInfo | null;
}) {
  if (!info) return null;
  const v = encodeURIComponent(version ?? "0");
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">망토</p>
      {info.capes.length === 0 ? (
        <p className="text-sm text-neutral-500">보유한 망토가 없어요</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {info.capes.map((c, i) => (
            <span
              key={`${c.title ?? c.source}-${i}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] py-1 pl-1.5 pr-2.5 text-xs font-semibold text-neutral-200"
            >
              <CapeIcon cape={c} src={`/api/mc-account/${encodeURIComponent(productId)}?asset=cape&i=${i}&v=${v}`} />
              {c.title ?? (c.source === "optifine" ? "OptiFine" : "Minecraft Cape")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const HY_TABS = ["bedwars", "skywars", "duels"] as const;
type HyTab = (typeof HY_TABS)[number];
const HY_LABEL: Record<HyTab, string> = { bedwars: "BEDWARS", skywars: "SKYWARS", duels: "DUELS" };

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

/** 상세 페이지: 하이픽셀 랭크 · 레벨 · 게임별 스탯 */
export function McHypixelPanel({ info }: { info: McAccountInfo | null }) {
  const [tab, setTab] = useState<HyTab>("bedwars");
  if (!info || info.hypixel === undefined) return null;
  const h = info.hypixel;
  const box = "rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2";
  const stat = (label: string, value: string | number) => (
    <div className={box}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-neutral-100">
        {typeof value === "number" ? value.toLocaleString("ko-KR") : value}
      </p>
    </div>
  );
  return (
    <div className="mt-5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Hypixel</p>
      {!h ? (
        <p className="text-sm text-neutral-500">하이픽셀 접속 기록이 없어요</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className={box}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">랭크</p>
              <p className="mt-0.5 text-sm font-extrabold" style={{ color: h.rank ? h.rankColor : "#a3a3a3" }}>
                {h.rank ? `[${h.rank}]` : "NON"}
              </p>
            </div>
            {stat("레벨", Math.floor(h.level))}
            {stat("첫 접속", fmtDate(h.firstLogin))}
            {stat("마지막 접속", fmtDate(h.lastLogin))}
          </div>
          <div className="mt-3 flex gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {HY_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md py-1.5 text-[11px] font-bold tracking-wide transition ${
                  tab === t ? "bg-white/15 text-white" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {HY_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tab === "bedwars" ? (
              <>
                {stat("별", `${h.bedwars.stars}✫`)}
                {stat("승리", h.bedwars.wins)}
                {stat("파이널 킬", h.bedwars.finalKills)}
                {stat("FKDR", h.bedwars.fkdr)}
              </>
            ) : tab === "skywars" ? (
              <>
                {stat("레벨", h.skywars.level)}
                {stat("승리", h.skywars.wins)}
                {stat("킬", h.skywars.kills)}
                {stat("KDR", h.skywars.kdr)}
              </>
            ) : (
              <>
                {stat("승리", h.duels.wins)}
                {stat("킬", h.duels.kills)}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
