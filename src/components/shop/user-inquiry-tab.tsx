"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, MessageCircle, Send, Sparkles } from "lucide-react";
import type { ShopInquiry } from "@/lib/types";
import { cn } from "@/lib/utils";

const QUICK_SUBJECTS = [
  "충전이 안 됐어요",
  "구매한 상품이 안 와요",
  "포인트/잔액 문의",
  "계정/로그인 문제",
  "기타 문의",
];

type SubTab = "write" | "list";

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function UserInquiryTab({
  loading,
  inquiries,
  saving,
  sub: controlledSub,
  onSubChange,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  onSubmit,
}: {
  loading: boolean;
  inquiries: ShopInquiry[];
  saving: boolean;
  sub?: SubTab;
  onSubChange?: (tab: SubTab) => void;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const [internalSub, setInternalSub] = useState<SubTab>("write");
  const sub = controlledSub ?? internalSub;
  const setSub = onSubChange ?? setInternalSub;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pending = useMemo(() => inquiries.filter((i) => i.status !== "answered").length, [inquiries]);
  const bodyLen = body.trim().length;
  const canSubmit = subject.trim().length >= 2 && body.trim().length >= 10 && !saving;

  return (
    <div className="inquiry-panel w-full space-y-4">
      <div className="inquiry-hero rounded-3xl border border-white/10 bg-gradient-to-br from-neutral-500/10 via-transparent to-emerald-500/10 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <MessageCircle className="size-6 text-neutral-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">고객 지원</p>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-white">AI가 먼저 답하는 문의</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
              오른쪽 아래 문의 버튼으로 채팅하세요. 상품·공지를 검색해 AI가 안내하고, 관리자가 들어오면 AI는 꺼집니다.
            </p>
            <button
              type="button"
              className="toss-admin-ghost mt-3"
              onClick={() => window.dispatchEvent(new CustomEvent("does-open-inquiry"))}
            >
              채팅 열기
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5">
            <p className="text-[10px] text-neutral-500">전체</p>
            <p className="text-lg font-bold text-white">{inquiries.length}</p>
          </div>
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 px-3 py-2.5">
            <p className="text-[10px] text-orange-300/80">답변 대기</p>
            <p className="text-lg font-bold text-orange-200">{pending}</p>
          </div>
          <div className="col-span-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 sm:col-span-1">
            <p className="text-[10px] text-emerald-300/80">답변 완료</p>
            <p className="text-lg font-bold text-emerald-200">{inquiries.length - pending}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {(
          [
            { id: "write" as const, label: "문의 작성", icon: Sparkles },
            { id: "list" as const, label: `내역 ${inquiries.length}`, icon: MessageCircle },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSub(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              sub === id
                ? "bg-white/10 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-300",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {sub === "write" ? (
        <form onSubmit={onSubmit} className="inquiry-form space-y-5 rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
          <div>
            <p className="text-sm font-medium text-white">빠른 주제 선택</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_SUBJECTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSubjectChange(preset)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    subject === preset
                      ? "border-neutral-400/50 bg-neutral-500/15 text-neutral-200"
                      : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/20 hover:text-neutral-200",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-neutral-300">제목</span>
            <input
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="예: 충전했는데 포인트가 안 들어왔어요"
              className="ios-input"
              maxLength={80}
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="flex items-center justify-between text-sm font-medium text-neutral-300">
              <span>내용</span>
              <span className={cn("text-xs font-normal", bodyLen >= 10 ? "text-emerald-400" : "text-neutral-600")}>
                {bodyLen}/500 · 최소 10자
              </span>
            </span>
            <textarea
              value={body}
              onChange={(e) => onBodyChange(e.target.value.slice(0, 500))}
              rows={6}
              placeholder="언제, 어떤 상황인지 자세히 적어주시면 더 빨리 도와드릴 수 있어요."
              className="ios-input min-h-[140px] resize-y leading-relaxed"
              required
              minLength={10}
            />
          </label>

          <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3 text-xs leading-relaxed text-neutral-500">
            개인정보(비밀번호, 전체 카드번호 등)는 적지 마세요. 영업일 기준 1~2일 내 확인됩니다.
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="user-dash-btn flex w-full items-center justify-center gap-2 py-3.5 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-4" />
                문의 보내기
              </>
            )}
          </button>
        </form>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-7 animate-spin text-neutral-500" />
        </div>
      ) : inquiries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
          <MessageCircle className="mx-auto size-10 text-neutral-600" />
          <p className="mt-3 font-medium text-neutral-300">아직 문의 내역이 없어요</p>
          <p className="mt-1 text-sm text-neutral-500">궁금한 점이 있으면 작성 탭에서 남겨 주세요.</p>
          <button type="button" className="user-dash-btn mt-5 px-6 py-2.5 text-sm" onClick={() => setSub("write")}>
            문의 작성하기
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {inquiries.map((inq) => {
            const open = expandedId === inq.id;
            const answered = inq.status === "answered";
            return (
              <li key={inq.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : inq.id)}
                  className="inquiry-card w-full rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition hover:border-white/18"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                        answered ? "bg-emerald-500/15 text-emerald-400" : "bg-orange-500/15 text-orange-400",
                      )}
                    >
                      {answered ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">{inq.subject}</p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            answered
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-orange-500/15 text-orange-300",
                          )}
                        >
                          {answered ? "답변완료" : "검토중"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{inq.body}</p>
                      <p className="mt-2 text-[11px] text-neutral-600">{formatWhen(inq.createdAt)}</p>
                    </div>
                  </div>

                  {open ? (
                    <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
                      <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">내 문의</p>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{inq.body}</p>
                      </div>
                      {answered ? (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">
                            상점 답변
                          </p>
                          <p className="mt-1.5 text-sm leading-relaxed text-emerald-100/90">
                            관리자가 확인을 완료했어요. 추가 문의가 필요하면 새로 작성해 주세요.
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-2xl border border-orange-500/15 bg-orange-500/5 px-4 py-3 text-sm text-orange-200/90">
                          <Loader2 className="size-4 shrink-0 animate-spin opacity-70" />
                          답변을 준비하고 있어요. 조금만 기다려 주세요.
                        </div>
                      )}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
