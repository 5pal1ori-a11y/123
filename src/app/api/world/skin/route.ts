import { normalizeUuid, profileByUuid } from "@/lib/world/minecraft";

export const dynamic = "force-dynamic";

/** 스킨 PNG 프록시 — three.js 텍스처는 같은 출처여야 깔끔하다 */
export async function GET(request: Request) {
  const uuid = normalizeUuid(new URL(request.url).searchParams.get("uuid"));
  if (!uuid) return new Response("bad uuid", { status: 400 });
  const profile = await profileByUuid(uuid).catch(() => null);

  let upstream: string;
  if (profile?.skinUrl) {
    const url = new URL(profile.skinUrl);
    if (url.hostname !== "textures.minecraft.net") return new Response("bad host", { status: 400 });
    url.protocol = "https:";
    upstream = url.toString();
  } else {
    // Mojang 세션 서버가 Cloudflare 에서 막히는 경우가 있어 스킨 미러로 대신 받는다
    upstream = `https://mc-heads.net/skin/${uuid}`;
  }

  const res = await fetch(upstream, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok || !(res.headers.get("content-type") ?? "").startsWith("image/png")) {
    return new Response("upstream", { status: 502 });
  }
  return new Response(res.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=21600, s-maxage=21600",
      "x-content-type-options": "nosniff",
    },
  });
}
