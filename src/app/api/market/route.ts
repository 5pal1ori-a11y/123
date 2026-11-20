import { NextResponse } from "next/server";
import { isShop, requireShop, serverError } from "@/lib/api";
import { initStore } from "@/lib/store";
import { forecastGroup, getMarketHistory, groupLabel, updateMarketIndex } from "@/lib/market-index";
import { CAPE_BY_TYPE } from "@/lib/capes-data";

export const dynamic = "force-dynamic";

/** 계정 차트 — 그룹별 일별 시세 · 내일 추세 (공개) */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  try {
    let hist = await getMarketHistory(shop.id);
    if (!hist.length) {
      await updateMarketIndex(shop.id, true);
      hist = await getMarketHistory(shop.id);
    }
    const days = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get("days")) || 60));
    const recent = hist.slice(-days);
    const last = recent[recent.length - 1];
    const ids = Object.keys(last?.groups ?? {}).sort((a, b) => (last!.groups[b]!.count - last!.groups[a]!.count) || a.localeCompare(b));
    const groups = ids.map((id) => ({
      id,
      label: groupLabel(id, (t) => CAPE_BY_TYPE[t]?.title),
      kind: id === "all" ? "all" : id.startsWith("cape:") ? "cape" : "category",
      today: last!.groups[id],
      series: recent.map((p) => ({ date: p.date, avg: p.groups[id]?.avg ?? null, soldAvg: p.groups[id]?.soldAvg ?? null, count: p.groups[id]?.count ?? 0 })),
      forecast: forecastGroup(recent, id),
    }));
    return NextResponse.json({ updatedAt: last?.at ?? null, groups }, { headers: { "cache-control": "public, max-age=60, s-maxage=60" } });
  } catch (err) {
    return serverError(err);
  }
}
