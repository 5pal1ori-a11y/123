"use client";

import { useCallback, useEffect, useState } from "react";
import { MC_ACCOUNT_CATEGORIES } from "@/lib/mc-account";
import { shopHeaders } from "@/lib/shop-client";

/** 관리자가 정한 마크 계정 카테고리 (불러오기 전에는 기본 목록) */
export function useMcCategories(shopSlug: string) {
  const [list, setList] = useState<string[]>([...MC_ACCOUNT_CATEGORIES]);
  const reload = useCallback(async () => {
    const res = await fetch("/api/mc-categories", { headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { categories?: string[] } | null;
    if (data?.categories?.length) setList(data.categories);
  }, [shopSlug]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { categories: list, setCategories: setList, reload };
}
