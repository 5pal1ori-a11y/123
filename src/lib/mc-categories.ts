/** 마크 계정 카테고리 — 관리자가 추가 · 삭제한다 (KV). 「대리판매」 는 신청 기능에 쓰여 항상 남긴다 */
import { MC_ACCOUNT_CATEGORIES, MC_RESALE_CATEGORY } from "@/lib/mc-account";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

const key = (shopId: string) => `mc-categories:v1:${shopId}`;

export function cleanMcCategories(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const c = raw.replace(/\s+/g, " ").trim().slice(0, 20);
    if (!c || c === "all" || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  if (!out.includes(MC_RESALE_CATEGORY)) out.push(MC_RESALE_CATEGORY);
  return out.slice(0, 20);
}

export async function getMcCategories(shopId: string): Promise<string[]> {
  const saved = await kvGetJson<string[]>(key(shopId));
  return saved?.length ? cleanMcCategories(saved) : [...MC_ACCOUNT_CATEGORIES];
}

export async function setMcCategories(shopId: string, list: string[]) {
  const clean = cleanMcCategories(list);
  await kvPutJson(key(shopId), clean);
  return clean;
}
