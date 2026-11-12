"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Pin } from "lucide-react";
import { staggerContainer, staggerItem, vxTransition } from "@/lib/motion";
import { formatNoticeDate } from "@/lib/utils";
import type { PlatformNotice } from "@/lib/types";

export function NoticesList({ notices }: { notices: PlatformNotice[] }) {
  if (notices.length === 0) {
    return (
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={vxTransition}
        className="py-16 text-center text-sm text-neutral-500"
      >
        아직 등록된 공지가 없어요.
      </motion.p>
    );
  }

  return (
    <motion.nav
      aria-label="공지 목록"
      className="border-t border-white/10"
      {...staggerContainer}
      initial="initial"
      animate="animate"
    >
      {notices.map((notice) => (
        <motion.div key={notice.id} {...staggerItem}>
          <Link
            href={`/notices/${notice.id}`}
            className="group flex flex-col gap-2 border-b border-white/10 py-5 transition hover:bg-white/[0.02] sm:flex-row sm:items-baseline sm:gap-10 sm:px-2 sm:py-6"
          >
            <time
              dateTime={notice.createdAt}
              className="shrink-0 font-mono text-sm tabular-nums text-neutral-500 transition group-hover:text-neutral-400"
            >
              {formatNoticeDate(notice.createdAt)}
            </time>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {notice.pinned ? (
                <Pin className="size-3.5 shrink-0 text-neutral-500" aria-label="고정" />
              ) : null}
              <span className="truncate font-medium text-neutral-200 transition group-hover:text-white">
                {notice.title}
              </span>
            </span>
          </Link>
        </motion.div>
      ))}
    </motion.nav>
  );
}
