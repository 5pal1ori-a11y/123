"use client";

import { useEffect, useState } from "react";
import { Link2, Repeat, ShieldCheck, Store } from "lucide-react";
import { DosMarketSafe } from "./dosmarket-safe";
import { DosMarketSell } from "./dosmarket-sell";
import { BuybackClient } from "./buyback-client";
import { CareClient } from "./care-client";

type Sub = "market" | "safe" | "buyback" | "care";

/** 도스마켓 — DOES 가 직접 하는 거래 · 보장 서비스 모음 (매입 · 보상판매 / DOES 케어) */
export function DosMarketHub({ shopSlug }: { shopSlug: string }) {
  const [sub, setSub] = useState<Sub>("market");

  // 예전 링크(?tab=care · ?tab=buyback)나 ?sub= 로 들어오면 그 탭을 연다
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("sub") ?? sp.get("tab");
    if (v === "care") setSub("care");
    else if (v === "buyback") setSub("buyback");
    else if (v === "safe") setSub("safe");
  }, []);

  const tabs: { id: Sub; label: string; icon: typeof Repeat }[] = [
    { id: "market", label: "마켓 판매", icon: Store },
    { id: "safe", label: "안전거래", icon: Link2 },
    { id: "buyback", label: "매입 · 보상판매", icon: Repeat },
    { id: "care", label: "DOES 케어", icon: ShieldCheck },
  ];

  return (
    <div className="w-full space-y-4">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-2 sm:grid-cols-4 gap-1 rounded-2xl p-1" style={{ background: "var(--mf-surface-2, rgba(127,127,127,0.12))" }}>
        {tabs.map((t) => {
          const on = sub === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition"
              style={on ? { background: "var(--mf-ink, #111)", color: "var(--mf-on-ink, #fff)" } : { color: "var(--mf-muted, #888)" }}
            >
              <Icon className="size-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {sub === "market" ? <DosMarketSell shopSlug={shopSlug} /> : sub === "safe" ? <DosMarketSafe /> : sub === "buyback" ? <BuybackClient /> : <CareClient />}
    </div>
  );
}
