"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Megaphone } from "lucide-react";
import { PageEnter } from "@/components/platform/page-enter";
import { vxTransition } from "@/lib/motion";

export function NoticesPageHeader() {
  return (
    <PageEnter className="mx-auto max-w-3xl">
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
      >
        <ArrowLeft className="size-4" />
        메인으로
      </Link>

      <motion.header
        className="mb-12 border-b border-white/10 pb-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...vxTransition, delay: 0.08 }}
      >
        <div className="landing-icon-chip landing-icon-float-a mb-5 inline-flex">
          <Megaphone className="size-5" strokeWidth={1.75} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">공지사항</h1>
        <p className="mt-3 text-text-secondary">DOES의 새 소식과 업데이트</p>
      </motion.header>
    </PageEnter>
  );
}
