/**
 * 마크계정 상품: 닉네임 → UUID / 스킨 렌더 / 망토 텍스처 조회 (서버 전용).
 * 닉네임은 클라이언트에 노출하지 않고, 이미지도 이 서버를 거쳐서 내려준다.
 */
import type { McCapeInfo, McCapeSource } from "@/lib/mc-account";

const UA = "VendixShop/1.0 (+minecraft account listing)";
const TTL_MS = 30 * 60 * 1000;

type ResolvedCape = McCapeInfo & { url: string };
export type ResolvedProfile = {
  uuid: string;
  name: string;
  capes: ResolvedCape[];
};

const cache = new Map<string, { at: number; value: ResolvedProfile | null }>();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function lookupUuid(name: string): Promise<{ id: string; name: string } | null> {
  const enc = encodeURIComponent(name);
  const sources = [
    `https://api.mojang.com/users/profiles/minecraft/${enc}`,
    `https://api.minecraftservices.com/minecraft/profile/lookup/name/${enc}`,
  ];
  for (const url of sources) {
    const data = await getJson<{ id?: string; name?: string }>(url);
    if (data?.id) return { id: data.id.replace(/-/g, ""), name: data.name ?? name };
  }
  // 일부 Cloudflare IP는 Mojang이 막는 경우가 있어 공개 미러로 한 번 더 시도
  const ashcon = await getJson<{ uuid?: string; username?: string }>(
    `https://api.ashcon.app/mojang/v2/user/${enc}`,
  );
  if (ashcon?.uuid) return { id: ashcon.uuid.replace(/-/g, ""), name: ashcon.username ?? name };
  return null;
}

function decodeBase64(b64: string): string {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

async function mojangCapeUrl(uuid: string): Promise<string | null> {
  const data = await getJson<{ properties?: { name: string; value: string }[] }>(
    `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`,
  );
  const prop = data?.properties?.find((p) => p.name === "textures");
  if (!prop) return null;
  try {
    const decoded = JSON.parse(decodeBase64(prop.value)) as {
      textures?: { CAPE?: { url?: string } };
    };
    const url = decoded.textures?.CAPE?.url;
    return url ? url.replace(/^http:\/\//, "https://") : null;
  } catch {
    return null;
  }
}

async function optifineCapeUrl(name: string): Promise<string | null> {
  const url = `http://s.optifine.net/capes/${encodeURIComponent(name)}.png`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.startsWith("image/")) return null;
    return url;
  } catch {
    return null;
  }
}

export async function resolveMcProfile(nickname: string): Promise<ResolvedProfile | null> {
  const key = nickname.trim().toLowerCase();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const profile = await lookupUuid(nickname.trim());
  let value: ResolvedProfile | null = null;
  if (profile) {
    const [mojang, optifine] = await Promise.all([
      mojangCapeUrl(profile.id),
      optifineCapeUrl(profile.name),
    ]);
    const capes: ResolvedCape[] = [];
    const push = (source: McCapeSource, url: string | null, baseWidth: number) => {
      if (url) capes.push({ source, url, baseWidth });
    };
    push("minecraft", mojang, 64);
    push("optifine", optifine, 46);
    value = { uuid: profile.id, name: profile.name, capes };
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** 3D 상반신 렌더 후보 (위에서부터 순서대로 시도) */
export function skinRenderUrls(uuid: string): string[] {
  return [
    `https://starlightskins.lunareclipse.studio/render/default/${uuid}/bust`,
    `https://visage.surgeplay.com/bust/512/${uuid}`,
    `https://mc-heads.net/body/${uuid}/512`,
  ];
}

export async function fetchImage(urls: string[]): Promise<Response | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" } });
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && type.startsWith("image/")) {
        return new Response(res.body, {
          headers: {
            "Content-Type": type,
            "Cache-Control": "public, max-age=1800, s-maxage=1800",
          },
        });
      }
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}
