"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import type { Notice } from "@/lib/types";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelPrimaryBtn,
  PanelRow,
  PanelList,
  PanelTabBody,
} from "./admin-panel-ui";

type Tab = "list" | "write";

export function AdminNoticesPanel({
  shopSlug,
  notices,
  onReload,
  onMessage,
  onDelete,
}: {
  shopSlug: string;
  notices: Notice[];
  onReload: () => Promise<void>;
  onMessage: (msg: string) => void;
  onDelete: (noticeId: string, title: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("list");
  const [form, setForm] = useState({ title: "", body: "" });

  async function postNotice(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/shop", {
      method: "POST",
      credentials: "include",
      headers: shopHeaders(shopSlug),
      body: JSON.stringify({ type: "notice", ...form, pinned: false }),
    });
    onMessage(res.ok ? "공지 등록됨" : "등록 실패");
    if (res.ok) {
      setForm({ title: "", body: "" });
      setTab("list");
      await onReload();
    }
  }

  return (
    <PanelFrame
      stats={[{ label: "공지", value: notices.length }]}
      tabs={[
        { id: "list", label: "공지 목록" },
        { id: "write", label: "공지 작성" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === "list" && (
        <PanelTabBody tabKey="list">
          {notices.length === 0 ? (
            <PanelEmpty
              message="등록된 공지가 없어요"
              action={
                <PanelPrimaryBtn className="px-6" onClick={() => setTab("write")}>
                  공지 작성
                </PanelPrimaryBtn>
              }
            />
          ) : (
            <PanelList>
              {notices.map((n) => (
                <PanelRow key={n.id} className="items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{n.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{n.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDelete(n.id, n.title)}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                    aria-label="삭제"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </PanelRow>
              ))}
            </PanelList>
          )}
        </PanelTabBody>
      )}

      {tab === "write" && (
        <PanelTabBody tabKey="write">
          <form onSubmit={postNotice} className="space-y-4">
            <PanelField label="제목">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="toss-admin-field"
                required
              />
            </PanelField>
            <PanelField label="내용">
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={6}
                className="toss-admin-field resize-y"
                required
              />
            </PanelField>
            <PanelPrimaryBtn type="submit" className="w-full sm:w-auto sm:min-w-[200px]">
              공지 등록
            </PanelPrimaryBtn>
          </form>
        </PanelTabBody>
      )}
    </PanelFrame>
  );
}
