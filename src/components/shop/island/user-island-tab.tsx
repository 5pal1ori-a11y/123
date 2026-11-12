"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Copy, Flag, Gem, Gift, Loader2, Maximize2, Minimize2, Sparkles, TreePine } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import type { IslandView } from "@/lib/island/world";
import { IslandWorld } from "./island-world";

const EARN = [
  { icon: CalendarCheck, label: "출석체크", reward: "잔디 블록", key: "attendance" as const },
  { icon: Gem, label: "거래 완료", reward: "다이아 블록", key: "orders" as const },
  { icon: TreePine, label: "후기 작성", reward: "참나무", key: "reviews" as const },
  { icon: Gift, label: "이벤트 · 상인 Deal", reward: "한정 장식품", key: "events" as const },
  { icon: Flag, label: "디스코드 인증", reward: "인증 깃발", key: "verified" as const },
];

export function UserIslandTab({ shopSlug, userName }: { shopSlug: string; userName: string }) {
  const [island, setIsland] = useState<IslandView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/island", { credentials: "include", headers: shopHeaders(shopSlug), cache: "no-store" });
      const data = (await res.json()) as { island?: IslandView; error?: string };
      if (!res.ok || !data.island) throw new Error(data.error || "섬을 불러오지 못했어요");
      setIsland(data.island);
    } catch (err) {
      setError(err instanceof Error ? err.message : "섬을 불러오지 못했어요");
    }
  }, [shopSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.pointerLockElement && setFull(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  const shareId = island?.owner.discordId || island?.userId || "";
  const share = async () => {
    const url = `${window.location.origin}/main?island=${encodeURIComponent(shareId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("섬 링크", url);
    }
  };

  if (error) {
    return (
      <div className="mf-card">
        <div className="mf-empty">
          <span>
            <TreePine />
          </span>
          {error}
        </div>
      </div>
    );
  }
  if (!island) {
    return (
      <div className="mf-card isl-tab-loading">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="isl-tab">
      <section className={`isl-stage ${full ? "is-full" : ""}`}>
        <IslandWorld shopSlug={shopSlug} island={island} editable onIslandChange={setIsland} onPortal={() => window.location.assign("/main")}>
          <div className="isl-owner">
            <b>{island.owner.name || userName}의 섬</b>
            <span>Lv.{island.level}</span>
          </div>
          <button type="button" className="isl-full-btn" onClick={() => setFull((f) => !f)} aria-label={full ? "작게 보기" : "전체 화면"}>
            {full ? <Minimize2 /> : <Maximize2 />}
          </button>
        </IslandWorld>
      </section>

      <div className="isl-side">
        <section className="mf-card">
          <div className="mf-card-head">
            <span className="mf-q-icon">
              <Sparkles />
            </span>
            <h3>활동으로 섬 키우기</h3>
          </div>
          <p className="isl-note">결제 금액이 아니라 활동과 업적으로 블록을 모아요. 얻은 블록은 꾸미기 버튼을 눌러 원하는 곳에 놓을 수 있어요.</p>
          <a href="/main" className="mc-btn is-green is-sm isl-world-link">
            월드 입장 · 광장 · 파쿠르
          </a>
          <ul className="isl-earn">
            {EARN.map((e) => {
              const Icon = e.icon;
              const value = e.key === "verified" ? (island.stats.verified ? "완료" : "미인증") : `${island.stats[e.key]}회`;
              return (
                <li key={e.key}>
                  <span className="isl-earn-icon">
                    <Icon />
                  </span>
                  <span className="isl-earn-text">
                    <b>{e.label}</b>
                    <small>→ {e.reward}</small>
                  </span>
                  <em>{value}</em>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mf-card">
          <div className="mf-card-head">
            <h3>친구에게 자랑하기</h3>
          </div>
          <p className="isl-note">
            디스코드에서 <code>/island @닉네임</code> 을 입력하면 섬 사진이 바로 떠요.
          </p>
          <button type="button" className="mf-btn is-sm" onClick={() => void share()} disabled={!shareId}>
            <Copy />
            {copied ? "링크 복사됨!" : "내 섬 링크 복사"}
          </button>
        </section>
      </div>
    </div>
  );
}
