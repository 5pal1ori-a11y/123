"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Pin } from "lucide-react";
import { PageEnter } from "@/components/platform/page-enter";
import { staggerContainer, staggerItem, vxTransition } from "@/lib/motion";
import { formatNoticeDate } from "@/lib/utils";
import type { PlatformNotice } from "@/lib/types";

type NoticeDetailViewProps = {
  notice: PlatformNotice;
  prev: PlatformNotice | null;
  next: PlatformNotice | null;
};

export function NoticeDetailView({ notice, prev, next }: NoticeDetailViewProps) {
  return (
    <PageEnter className="mx-auto max-w-3xl">
      <Link
        href="/notices"
        className="mb-8 inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
      >
        <ArrowLeft className="size-4" />
        공지 목록
      </Link>

      <motion.header
        className="border-b border-white/10 pb-8"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...vxTransition, delay: 0.06 }}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
          <time dateTime={notice.createdAt} className="font-mono tabular-nums">
            {formatNoticeDate(notice.createdAt)}
          </time>
          {notice.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-neutral-300">
              <Pin className="size-3" />
              고정
            </span>
          )}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{notice.title}</h1>
      </motion.header>

      <motion.div
        className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-neutral-300"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...vxTransition, delay: 0.12 }}
      >
        {notice.body}
      </motion.div>

      {(prev || next) && (
        <motion.nav
          className="mt-6 grid gap-3 sm:grid-cols-2"
          {...staggerContainer}
          initial="initial"
          animate="animate"
        >
          {prev ? (
            <motion.div {...staggerItem}>
              <Link href={`/notices/${prev.id}`} className="quartz-card quartz-lift block px-5 py-4 text-sm">
                <span className="text-neutral-500">이전</span>
                <p className="mt-1 truncate font-medium">{prev.title}</p>
              </Link>
            </motion.div>
          ) : (
            <div />
          )}
          {next ? (
            <motion.div {...staggerItem} className="sm:col-start-2">
              <Link
                href={`/notices/${next.id}`}
                className="quartz-card quartz-lift block px-5 py-4 text-right text-sm"
              >
                <span className="text-neutral-500">다음</span>
                <p className="mt-1 truncate font-medium">{next.title}</p>
              </Link>
            </motion.div>
          ) : null}
        </motion.nav>
      )}
    </PageEnter>
  );
}
