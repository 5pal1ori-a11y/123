"use client";

import { useEffect, useState } from "react";
import type { McAccountInfo } from "@/lib/mc-account";

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
              {c.front ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/mc-account/${encodeURIComponent(productId)}?asset=cape&i=${i}&v=${v}`}
                  alt=""
                  className="h-[19px] w-[12px]"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : null}
              {c.title ?? (c.source === "optifine" ? "OptiFine" : "Minecraft Cape")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
