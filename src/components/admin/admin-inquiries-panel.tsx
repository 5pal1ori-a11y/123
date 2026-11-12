"use client";

import { useMemo, useState } from "react";
import type { ShopInquiry } from "@/lib/types";
import {
  PanelEmpty,
  PanelFrame,
  PanelList,
  PanelPrimaryBtn,
  PanelRow,
  PanelTabBody,
} from "./admin-panel-ui";

export function AdminInquiriesPanel({
  inquiries,
  userLabel,
  onReply,
}: {
  inquiries: ShopInquiry[];
  userLabel: (userId: string) => string;
  onReply?: (inquiryId: string, reply: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"open" | "answered" | "all">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return inquiries;
    return inquiries.filter((i) => i.status === filter);
  }, [inquiries, filter]);

  const openCount = inquiries.filter((i) => i.status === "open").length;

  return (
    <PanelFrame
      stats={[
        { label: "전체", value: inquiries.length },
        { label: "대기", value: openCount, warn: openCount > 0 },
        { label: "답변됨", value: inquiries.length - openCount },
      ]}
      tabs={[
        { id: "open", label: "대기" },
        { id: "answered", label: "답변됨" },
        { id: "all", label: "전체" },
      ]}
      activeTab={filter}
      onTabChange={(id) => setFilter(id as typeof filter)}
    >
      <PanelTabBody tabKey={filter}>
        {filtered.length === 0 ? (
          <PanelEmpty message="문의가 없어요" />
        ) : (
          <PanelList>
            {filtered.map((inq) => (
              <PanelRow key={inq.id} className="items-start">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{inq.subject}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        inq.status === "open"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-emerald-500/15 text-emerald-300"
                      }`}
                    >
                      {inq.status === "open" ? "대기" : "답변됨"}
                    </span>
                    {inq.discordChannelId ? (
                      <span className="rounded-full bg-neutral-500/15 px-2 py-0.5 text-[10px] text-neutral-300">
                        Discord 동기화
                      </span>
                    ) : null}
                    {inq.aiEnabled === false ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                        AI 꺼짐 · 관리자
                      </span>
                    ) : (
                      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                        AI 응대 중
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(inq.messages?.length ? inq.messages : [{ id: "b", from: "user" as const, body: inq.body, createdAt: inq.createdAt }]).map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-xl px-3 py-2 text-[13px] ${
                          m.from === "user"
                            ? "bg-white/[0.04] text-neutral-300"
                            : m.from === "admin"
                              ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-50"
                              : "border border-violet-400/20 bg-violet-500/10 text-violet-50"
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-neutral-500">
                          {m.from === "user" ? "구매자" : m.from === "admin" ? "관리자" : "AI"}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}
                  </div>
                  {onReply ? (
                    <div className="space-y-2">
                      <textarea
                        value={drafts[inq.id] ?? ""}
                        onChange={(e) => setDrafts({ ...drafts, [inq.id]: e.target.value })}
                        placeholder="관리자 답변 — 보내면 AI 안내가 꺼집니다"
                        rows={3}
                        className="toss-admin-field min-h-[72px]"
                      />
                      <PanelPrimaryBtn
                        className="text-xs"
                        disabled={busyId === inq.id || !(drafts[inq.id] ?? "").trim()}
                        onClick={async () => {
                          const reply = (drafts[inq.id] ?? "").trim();
                          if (!reply) return;
                          setBusyId(inq.id);
                          try {
                            await onReply(inq.id, reply);
                            setDrafts({ ...drafts, [inq.id]: "" });
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        관리자로 답변 (AI 끄기)
                      </PanelPrimaryBtn>
                    </div>
                  ) : null}
                  <p className="text-[11px] text-neutral-500">
                    {userLabel(inq.userId)} · {new Date(inq.createdAt).toLocaleString("ko-KR")}
                  </p>
                </div>
              </PanelRow>
            ))}
          </PanelList>
        )}
      </PanelTabBody>
    </PanelFrame>
  );
}
