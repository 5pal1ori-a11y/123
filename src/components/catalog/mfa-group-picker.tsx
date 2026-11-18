"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Layers } from "lucide-react";
import type { McAccountInfo } from "@/lib/mc-account";
import type { ProductWithStock } from "@/lib/types";
import { CAPE_BY_TYPE } from "@/lib/capes-data";
import { CapeFaceImg } from "@/components/capes/cape-face";
import { shopHeaders } from "@/lib/shop-client";
import { shopPath, useShopBase } from "@/lib/shop-nav";
import { formatKRW } from "@/lib/utils";

type Cape = { title: string; hash: string };

function capesOf(p: ProductWithStock, info: McAccountInfo | null | undefined): Cape[] {
  if (Array.isArray(p.mcCapes)) return p.mcCapes.flatMap((t) => (CAPE_BY_TYPE[t] ? [{ title: CAPE_BY_TYPE[t].title, hash: CAPE_BY_TYPE[t].hash }] : []));
  return (info?.capes ?? []).flatMap((c) => (c.hash ? [{ title: c.title ?? "망토", hash: c.hash }] : []));
}

/** MFA 묶음 상품 상세: 묶인 계정 목록에서 하나를 고른다 (고르면 그 계정 상세로 바뀌고, 그대로 구매) */
export function MfaGroupPicker({ current, shopSlug }: { current: ProductWithStock; shopSlug: string }) {
  const router = useRouter();
  const base = useShopBase();
  const [list, setList] = useState<ProductWithStock[] | null>(null);
  const [infos, setInfos] = useState<Record<string, McAccountInfo | null>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/products", { headers: shopHeaders(shopSlug, false), cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ products: ProductWithStock[] }>) : null))
      .then((d) => {
        if (!alive || !d) return;
        const group = d.products.filter((p) => p.productKind === "mc_account" && p.mcGroup && (p.availableCount > 0 || p.id === current.id));
        setList(group.sort((a, b) => a.price - b.price));
      })
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [current.id, shopSlug]);

  useEffect(() => {
    if (!list) return;
    for (const p of list) {
      if (Array.isArray(p.mcCapes) || p.id in infos) continue;
      fetch(`/api/mc-account/${encodeURIComponent(p.id)}?v=${encodeURIComponent(p.mcVersion ?? "0")}`)
        .then((r) => (r.ok ? (r.json() as Promise<McAccountInfo>) : null))
        .then((d) => setInfos((m) => ({ ...m, [p.id]: d })))
        .catch(() => setInfos((m) => ({ ...m, [p.id]: null })));
    }
  }, [list, infos]);

  if (!list || list.length < 2) return null;
  return (
    <section className="mt-5 rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.04] p-3">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
          <Layers className="size-4 text-indigo-300" /> 계정 선택
        </p>
        <span className="text-xs text-neutral-400">{list.length}개 중 하나를 골라 주세요</span>
      </div>
      <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {list.map((p) => {
          const on = p.id === current.id;
          const capes = capesOf(p, infos[p.id]);
          const name = p.mcMaskedName || p.name;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => !on && router.replace(shopPath(base, `/product/${p.slug}`), { scroll: false })}
                className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition ${
                  on ? "border-white bg-white/[0.08]" : "border-white/10 bg-black/20 hover:border-white/40"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/mc-account/${encodeURIComponent(p.id)}?asset=skin&v=${encodeURIComponent(p.mcVersion ?? "0")}`}
                  alt=""
                  loading="lazy"
                  className="size-12 shrink-0 rounded-lg bg-white/5 object-contain object-top"
                  style={{ imageRendering: "pixelated" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {p.tags?.[0] ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-neutral-300">{p.tags[0]}</span> : null}
                    {capes.length ? (
                      capes.slice(0, 6).map((c) => (
                        <span key={c.hash} title={c.title} className="inline-flex h-5 w-[13px] items-center justify-center overflow-hidden rounded-[3px] bg-white/10">
                          <CapeFaceImg hash={c.hash} width={10} alt={c.title} />
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-neutral-500">망토 없음</span>
                    )}
                    {capes.length > 6 ? <span className="text-[11px] text-neutral-400">+{capes.length - 6}</span> : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-extrabold text-white">{formatKRW(p.price)}</p>
                  {on ? (
                    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-300">
                      <Check className="size-3" /> 선택됨
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
