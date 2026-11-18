import { NextResponse } from "next/server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PlayerDb = {
  data?: {
    player?: {
      username?: string;
      raw_id?: string;
      properties?: { name: string; value: string }[];
    };
  };
};

function decode(b64: string) {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** GET /api/capes/skin?name=Notch → { name, skinHash, slim, capeHash } */
export async function GET(request: Request) {
  const rl = rateLimit(`capeskin:${clientIp(request)}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return NextResponse.json({ error: "닉네임을 확인해 주세요" }, { status: 400 });
  try {
    const res = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`, {
      headers: { "User-Agent": "VendixShop/1.0", Accept: "application/json" },
    });
    const data = (await res.json().catch(() => null)) as PlayerDb | null;
    const p = data?.data?.player;
    const prop = p?.properties?.find((x) => x.name === "textures");
    if (!p || !prop) return NextResponse.json({ error: "그 닉네임을 찾지 못했어요" }, { status: 404 });
    const tex = JSON.parse(decode(prop.value)) as {
      textures?: { SKIN?: { url?: string; metadata?: { model?: string } }; CAPE?: { url?: string } };
    };
    const hashOf = (u?: string) => u?.split("/").pop() ?? null;
    const skinHash = hashOf(tex.textures?.SKIN?.url);
    if (!skinHash) return NextResponse.json({ error: "스킨 정보가 없어요" }, { status: 404 });
    return NextResponse.json(
      {
        name: p.username ?? name,
        skinHash,
        slim: tex.textures?.SKIN?.metadata?.model === "slim",
        capeHash: hashOf(tex.textures?.CAPE?.url),
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
    );
  } catch {
    return NextResponse.json({ error: "조회에 실패했어요. 잠시 후 다시 시도해 주세요" }, { status: 502 });
  }
}
