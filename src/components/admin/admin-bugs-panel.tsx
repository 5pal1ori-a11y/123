"use client";

import { useState } from "react";
import type { BugReport } from "@/lib/types";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelPrimaryBtn,
  PanelRow,
  PanelList,
  PanelTabBody,
} from "./admin-panel-ui";

type Tab = "open" | "report";

export function AdminBugsPanel({
  bugs,
  openCount,
  onSubmit,
  onResolve,
}: {
  bugs: BugReport[];
  openCount: number;
  onSubmit: (body: { email: string; subject: string; body: string }) => Promise<boolean>;
  onResolve: (reportId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("open");
  const [form, setForm] = useState({ email: "", subject: "", body: "" });

  const openBugs = bugs.filter((b) => b.status !== "resolved");

  return (
    <PanelFrame
      stats={[
        { label: "미해결", value: openCount, warn: openCount > 0 },
        { label: "전체", value: bugs.length },
      ]}
      tabs={[
        { id: "open", label: "미해결 목록" },
        { id: "report", label: "제보 작성" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === "open" && (
        <PanelTabBody tabKey="open">
          {openBugs.length === 0 ? (
            <PanelEmpty message="미해결 버그가 없어요" />
          ) : (
            <PanelList>
              {openBugs.map((b) => (
                <PanelRow key={b.id} className="items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{b.subject}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{b.email}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{b.body}</p>
                  </div>
                  <PanelPrimaryBtn
                    className="shrink-0 px-4 py-2 text-xs"
                    onClick={() => onResolve(b.id)}
                  >
                    해결
                  </PanelPrimaryBtn>
                </PanelRow>
              ))}
            </PanelList>
          )}
        </PanelTabBody>
      )}

      {tab === "report" && (
        <PanelTabBody tabKey="report">
          <p className="mb-4 text-xs text-neutral-500">
            누구나 버그를 제보할 수 있습니다 (관리자 로그인 불필요).
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await onSubmit(form);
              if (ok) {
                setForm({ email: "", subject: "", body: "" });
                setTab("open");
              }
            }}
            className="space-y-4"
          >
            <PanelField label="이메일">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="toss-admin-field"
                required
              />
            </PanelField>
            <PanelField label="제목">
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="toss-admin-field"
                required
              />
            </PanelField>
            <PanelField label="내용">
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={5}
                className="toss-admin-field resize-y"
                required
              />
            </PanelField>
            <PanelPrimaryBtn type="submit" className="w-full sm:w-auto sm:min-w-[200px]">
              제보 등록
            </PanelPrimaryBtn>
          </form>
        </PanelTabBody>
      )}
    </PanelFrame>
  );
}
