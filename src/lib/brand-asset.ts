/** public/brand 의 미리 만든 고화질 GIF 를 워커 안에서 바로 꺼내 응답한다 (Cloudflare 정적 자산 바인딩) */
type AssetsBinding = { fetch(req: Request): Promise<Response> };

export async function serveBrandAsset(name: string, cache = "public, max-age=3600"): Promise<Response | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const assets = (env as { ASSETS?: AssetsBinding }).ASSETS;
    if (!assets) return null;
    const res = await assets.fetch(new Request(`https://assets.local/brand/${name}`));
    if (!res.ok) return null;
    return new Response(res.body, { headers: { "content-type": "image/gif", "cache-control": cache } });
  } catch {
    return null;
  }
}
