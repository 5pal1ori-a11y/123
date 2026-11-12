"use client";

import { QuartzCursor } from "@/components/platform/quartz-cursor";

export function QuartzShellDecor() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="qx-veil" />
        <div className="quartz-orb quartz-orb-a" />
        <div className="quartz-orb quartz-orb-b" />
      </div>
      <QuartzCursor />
    </>
  );
}
