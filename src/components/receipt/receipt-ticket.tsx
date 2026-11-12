"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Sparkles } from "lucide-react";
import type { Order, Product } from "@/lib/types";
import { formatDate, formatKRW } from "@/lib/utils";

export function ReceiptTicket({
  order,
  product,
}: {
  order: Order;
  product: Product | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!order.dispensedCode) return;
    await navigator.clipboard.writeText(order.dispensedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
      className="glass-thick mx-auto max-w-lg overflow-hidden rounded-3xl"
    >
      <div className="border-b border-glass-border bg-green/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-green/20">
            <Sparkles className="size-5 text-green" />
          </div>
          <div>
            <p className="text-[13px] text-text-secondary">Dispensed</p>
            <p className="font-semibold text-text">상품이 발급되었습니다</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div>
          <p className="text-[12px] text-label">상품</p>
          <p className="mt-1 text-xl font-semibold text-text">{product?.name ?? "Product"}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <div className="rounded-2xl bg-fill/60 p-3">
            <p className="text-label">금액</p>
            <p className="mt-1 font-semibold text-text">{formatKRW(order.amount)}</p>
          </div>
          <div className="rounded-2xl bg-fill/60 p-3">
            <p className="text-label">결제</p>
            <p className="mt-1 text-text">계좌이체</p>
          </div>
          <div className="col-span-2 rounded-2xl bg-fill/60 p-3">
            <p className="text-label">주문번호</p>
            <p className="mt-1 font-mono text-[12px] text-text-secondary">{order.orderUuid}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-tint/30 bg-tint-soft/30 p-4">
          <p className="mb-2 text-[12px] font-medium text-label">Your code</p>
          <div className="flex items-center gap-3">
            <code className="flex-1 break-all font-mono text-[15px] font-semibold text-tint">
              {order.dispensedCode ?? "••••••••"}
            </code>
            <button
              type="button"
              onClick={copyCode}
              className="flex items-center gap-1.5 rounded-xl bg-tint px-3 py-2 text-[12px] font-medium text-white"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {order.paidAt && (
          <p className="text-center text-[11px] text-label">
            {formatDate(order.paidAt)} · {order.depositorName}
          </p>
        )}
      </div>
    </motion.div>
  );
}
