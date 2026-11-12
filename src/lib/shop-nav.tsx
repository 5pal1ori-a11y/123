"use client";

import { createContext, useContext } from "react";

export { shopPath } from "@/lib/shop-path";

const ShopBaseContext = createContext("");

/** Shop links are relative on {slug}.vendix.team — no /s/{slug} prefix. */
export function ShopBaseProvider({
  shopSlug: _shopSlug,
  children,
}: {
  shopSlug: string;
  children: React.ReactNode;
}) {
  return <ShopBaseContext.Provider value="">{children}</ShopBaseContext.Provider>;
}

export function useShopBase() {
  return useContext(ShopBaseContext);
}
