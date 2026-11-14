/**
 * 마크계정 상품: 닉네임 → UUID / 스킨 렌더 / 망토 텍스처 조회 (서버 전용).
 * 닉네임은 클라이언트에 노출하지 않고, 이미지도 이 서버를 거쳐서 내려준다.
 */
import { CAPE_ORDER, type McCapeInfo, type McCapeSource } from "@/lib/mc-account";
import { CAPE_TITLES, capeTypeFromTextureUrl } from "@/lib/mc-cape-catalog";

const UA = "VendixShop/1.0 (+minecraft account listing)";
const TTL_MS = 30 * 60 * 1000;

type ResolvedCape = McCapeInfo & { url: string };

type CapesMeCatalog = { type: string; title: string; order?: number; hidden?: boolean }[];
let capesCatalog: { at: number; byType: Map<string, { title: string; order: number }> } | null = null;

/** capes.me 망토 목록 (이름·기본 순서) — 하루 캐시 */
async function capeCatalog() {
  if (capesCatalog && Date.now() - capesCatalog.at < 24 * 3600 * 1000) return capesCatalog.byType;
  const list = await getJson<CapesMeCatalog>("https://capes.me/api/capes");
  const byType = new Map<string, { title: string; order: number }>();
  for (const c of list ?? []) byType.set(c.type, { title: c.title, order: c.order ?? 999 });
  if (byType.size) capesCatalog = { at: Date.now(), byType };
  return byType;
}

/** capes.me 로 계정이 가진 Mojang 망토 전체 (착용 안 한 것 포함) */
async function ownedCapes(name: string): Promise<ResolvedCape[] | null> {
  const data = await getJson<{ capes?: { type: string; removed?: boolean }[] }>(
    `https://capes.me/api/user/${encodeURIComponent(name)}`,
  );
  if (!data || !Array.isArray(data.capes)) return null;
  const catalog = await capeCatalog();
  const rank = (type: string) => {
    const i = CAPE_ORDER.indexOf(type);
    return i >= 0 ? i : 100 + (catalog.get(type)?.order ?? 900);
  };
  return data.capes
    .filter((c) => c && typeof c.type === "string" && !c.removed)
    .sort((a, b) => rank(a.type) - rank(b.type))
    .map((c) => ({
      source: "minecraft" as const,
      baseWidth: 10,
      front: true,
      title: catalog.get(c.type)?.title ?? CAPE_TITLES[c.type] ?? c.type,
      url: `https://capes.me/images/capes/${encodeURIComponent(c.type)}.png`,
    }));
}
export type ResolvedProfile = {
  /** UUID를 못 찾으면 null — 그래도 닉네임으로 스킨 렌더는 시도한다 */
  uuid: string | null;
  name: string;
  capes: ResolvedCape[];
};

type PlayerDb = {
  success?: boolean;
  data?: {
    player?: {
      raw_id?: string;
      id?: string;
      username?: string;
      properties?: { name: string; value: string }[];
    };
  };
};

/** playerdb.co — Mojang API가 Cloudflare 워커 IP를 막을 때도 동작하는 공개 미러 */
async function lookupPlayerDb(name: string) {
  const data = await getJson<PlayerDb>(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`);
  const p = data?.data?.player;
  const id = (p?.raw_id || p?.id || "").replace(/-/g, "");
  if (!id) return null;
  return { id, name: p?.username || name, properties: p?.properties ?? [] };
}

function capeFromProperties(props: { name: string; value: string }[] | undefined): string | null {
  const prop = props?.find((p) => p.name === "textures");
  if (!prop) return null;
  try {
    const decoded = JSON.parse(decodeBase64(prop.value)) as { textures?: { CAPE?: { url?: string } } };
    const url = decoded.textures?.CAPE?.url;
    return url ? url.replace(/^http:\/\//, "https://") : null;
  } catch {
    return null;
  }
}

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

  const name = nickname.trim();
  // 1) playerdb (UUID + 텍스처를 한 번에) → 2) Mojang 직접
  const pdb = await lookupPlayerDb(name);
  const profile = pdb ?? (await lookupUuid(name));
  const uuid = profile?.id ?? null;
  const realName = profile?.name ?? name;

  const [owned, optifine] = await Promise.all([ownedCapes(realName), optifineCapeUrl(realName)]);

  const capes: ResolvedCape[] = [];
  const push = (source: McCapeSource, url: string | null, baseWidth: number, title?: string) => {
    if (url) capes.push({ source, url, baseWidth, ...(title ? { title } : {}) });
  };
  if (owned) {
    // capes.me: 보유한 Mojang 망토 전체 (정해 둔 순서)
    capes.push(...owned);
  } else {
    // capes.me 가 안 되면 지금 착용 중인 망토 하나만
    let mojang = capeFromProperties(pdb?.properties);
    if (!mojang && uuid) mojang = await mojangCapeUrl(uuid);
    const type = mojang ? capeTypeFromTextureUrl(mojang) : null;
    push("minecraft", mojang, 64, (type && CAPE_TITLES[type]) || "Minecraft Cape");
  }
  push("optifine", optifine, 46, "OptiFine");
  const value: ResolvedProfile = { uuid, name: realName, capes };
  // UUID를 못 찾은 결과는 짧게만 캐시 (일시 장애일 수 있음)
  cache.set(key, { at: uuid ? Date.now() : Date.now() - TTL_MS + 2 * 60 * 1000, value });
  return value;
}

/** 3D 상반신 렌더 후보 (위에서부터 순서대로 시도). UUID가 없으면 닉네임으로 요청한다 */
export function skinRenderUrls(id: string): string[] {
  const k = encodeURIComponent(id);
  return [
    `https://starlightskins.lunareclipse.studio/render/default/${k}/bust`,
    `https://visage.surgeplay.com/bust/512/${k}`,
    `https://mc-heads.net/body/${k}/512`,
    `https://minotar.net/armor/body/${k}/300.png`,
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
