"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Package } from "lucide-react";
import type { ProductWithStock } from "@/lib/types";
import { formatKRW } from "@/lib/utils";
import { StockBadge } from "@/components/ui/stock-badge";
import { shopPath, useShopBase } from "@/lib/shop-nav";

export function ProductCard({
  product,
  index,
}: {
  product: ProductWithStock;
  index: number;
}) {
  const base = useShopBase();
  const disabled = product.stockStatus === "sold_out";

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={disabled ? "#" : shopPath(base, `/product/${product.slug}`)}
        aria-disabled={disabled}
        className={disabled ? "pointer-events-none opacity-50" : undefined}
      >
        <div className="glass-thick group flex h-full flex-col overflow-hidden p-0 transition hover:border-white/15 active:scale-[0.98] quartz-lift">
          {product.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.thumbnail}
              alt=""
              referrerPolicy="no-referrer"
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-neutral-900 to-black text-neutral-600">
              <Package className="size-8 opacity-40" />
            </div>
          )}
          <div className="flex flex-1 flex-col p-5">
          <div className="mb-3 flex items-start justify-between">
            <span className="ios-pill bg-fill text-[11px] text-label">{product.category}</span>
            <StockBadge status={product.stockStatus} />
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-text">{product.name}</h3>
          <p className="mt-2 line-clamp-2 flex-1 text-[13px] leading-relaxed text-text-secondary">
            {product.description}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-glass-border pt-4">
            <span className="text-[16px] font-semibold text-text">{formatKRW(product.price)}</span>
            <span className="flex items-center gap-1 text-[12px] text-neutral-400">
              구매
              <ChevronRight className="size-4" />
            </span>
          </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
