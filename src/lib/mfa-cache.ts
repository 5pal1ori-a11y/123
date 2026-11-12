/**
 * MFA MARKET 재고 캐시 (isolate 메모리).
 * 전체 DB 가 KV 한 키에 저장되므로 재고 조회 때마다 persist 하지 않도록 메모리에만 둔다.
 */
const cache = new Map<string, { count: number; at: number }>();

export function getMfaStockCache(productId: string) {
  return cache.get(productId) ?? null;
}

export function setMfaStockCache(productId: string, count: number) {
  cache.set(productId, { count: Math.max(0, Math.floor(count)), at: Date.now() });
}

export function clearMfaStockCache(productId: string) {
  cache.delete(productId);
}
