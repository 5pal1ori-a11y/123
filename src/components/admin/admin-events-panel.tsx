"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";
import type { ProductWithStock, ShopEvent, TraderDeal } from "@/lib/types";
import { TraderFace } from "@/components/shop/trader-popup";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelPrimaryBtn,
  PanelRow,
  PanelList,
  PanelTabBody,
} from "./admin-panel-ui";

type Tab = "events" | "create-event" | "trader";

type AdminDeal = Omit<TraderDeal, "buyers"> & { buyerCount: number };

const DURATIONS = [10, 27, 60, 180, 720];

function dealStatus(deal: AdminDeal, now: number) {
  const start = new Date(deal.startsAt).getTime();
  const end = new Date(deal.endsAt).getTime();
  if (now < start) return { label: `${Math.ceil((start - now) / 60_000)}분 후 등장`, live: false };
  if (now >= end) return { label: "종료됨", live: false };
  const m = Math.ceil((end - now) / 60_000);
  return { label: m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분 남음` : `${m}분 남음`, live: true };
}

function TraderDealSettings({
  shopSlug,
  products,
  onMessage,
}: {
  shopSlug: string;
  products: ProductWithStock[];
  onMessage: (msg: string) => void;
}) {
  const [deal, setDeal] = useState<AdminDeal | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ productId: "", dealPrice: "", quantity: "1", minutes: "27", startIn: "0" });

  const product = products.find((p) => p.id === form.productId);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/trader", { credentials: "include", headers: shopHeaders(shopSlug), cache: "no-store" });
    if (res.ok) setDeal(((await res.json()) as { deal: AdminDeal | null }).deal);
  }, [shopSlug]);

  useEffect(() => {
    void load();
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trader", {
        method: "PUT",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({
          productId: form.productId,
          dealPrice: Number(form.dealPrice),
          quantity: Number(form.quantity),
          minutes: Number(form.minutes),
          startInMinutes: Number(form.startIn) || 0,
        }),
      });
      const data = (await res.json()) as { deal?: AdminDeal | null; error?: string };
      if (!res.ok) throw new Error(data.error || "등록 실패");
      setDeal(data.deal ?? null);
      setNow(Date.now());
      onMessage("떠돌이 상인 Deal이 등록됐어요");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/trader", { method: "DELETE", credentials: "include", headers: shopHeaders(shopSlug) });
      if (res.ok) {
        setDeal(null);
        onMessage("상인을 돌려보냈어요");
      } else onMessage("종료 실패");
    } finally {
      setBusy(false);
    }
  }

  const status = deal ? dealStatus(deal, now) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <span className="shrink-0 overflow-hidden rounded-lg">
          <TraderFace size={40} />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {deal && status ? (
            <>
              <p className="font-medium text-white">
                {products.find((p) => p.id === deal.productId)?.name ?? "삭제된 상품"} · {formatKRW(deal.originalPrice)} →{" "}
                {formatKRW(deal.dealPrice)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {status.label} · 판매 {deal.sold}/{deal.quantity} · 구매자 {deal.buyerCount}명
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-white">지금은 상인이 없어요</p>
              <p className="mt-1 text-xs text-neutral-500">
                Deal을 등록하면 손님 화면 오른쪽 아래에 Wandering Trader가 나타나요. 시간이 끝나면 자동으로 사라져요.
              </p>
            </>
          )}
        </div>
        {deal ? (
          <button type="button" className="toss-admin-ghost shrink-0 px-3 py-1.5 text-xs text-red-400" onClick={() => void stop()} disabled={busy}>
            {status?.live ? "지금 종료" : "삭제"}
          </button>
        ) : null}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <PanelField label="할인할 상품">
          <select
            value={form.productId}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              setForm({ ...form, productId: e.target.value, dealPrice: p ? String(Math.floor(p.price * 0.9 / 100) * 100) : "" });
            }}
            className="toss-admin-field"
            required
          >
            <option value="">상품 선택</option>
            {products
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatKRW(p.price)}
                </option>
              ))}
          </select>
        </PanelField>
        <div className="grid gap-4 sm:grid-cols-2">
          <PanelField label={product ? `Deal 가격 (원래 ${formatKRW(product.price)})` : "Deal 가격 (원)"}>
            <input
              type="number"
              min={0}
              value={form.dealPrice}
              onChange={(e) => setForm({ ...form, dealPrice: e.target.value })}
              className="toss-admin-field"
              required
            />
          </PanelField>
          <PanelField label="준비 수량 (1인 1회)">
            <input
              type="number"
              min={1}
              max={999}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="toss-admin-field"
              required
            />
          </PanelField>
        </div>
        <PanelField label="머무는 시간 (분)">
          <div className="flex flex-wrap items-center gap-2">
            {DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForm({ ...form, minutes: String(m) })}
                className={`toss-admin-ghost px-3 py-1.5 text-xs ${form.minutes === String(m) ? "!border-white/40 text-white" : ""}`}
              >
                {m >= 60 ? `${m / 60}시간` : `${m}분`}
              </button>
            ))}
            <input
              type="number"
              min={1}
              value={form.minutes}
              onChange={(e) => setForm({ ...form, minutes: e.target.value })}
              className="toss-admin-field w-28"
              required
            />
          </div>
        </PanelField>
        <PanelField label="등장 시점 (몇 분 뒤, 0 = 바로)">
          <input
            type="number"
            min={0}
            value={form.startIn}
            onChange={(e) => setForm({ ...form, startIn: e.target.value })}
            className="toss-admin-field w-32"
          />
        </PanelField>
        <PanelPrimaryBtn type="submit" disabled={busy} className="w-full sm:w-auto sm:min-w-[200px]">
          {deal ? "새 Deal로 교체" : "상인 부르기"}
        </PanelPrimaryBtn>
      </form>
    </div>
  );
}

export function AdminEventsPanel({
  shopSlug,
  events,
  products,
  onReload,
  onMessage,
  onDeleteEvent,
}: {
  shopSlug: string;
  events: ShopEvent[];
  products: ProductWithStock[];
  onReload: () => Promise<void>;
  onMessage: (msg: string) => void;
  onDeleteEvent: (eventId: string, title: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("events");
  const [eventForm, setEventForm] = useState({
    title: "",
    discountPercent: "10",
    productId: "",
    days: "7",
  });

  async function postEvent(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/shop", {
      method: "POST",
      credentials: "include",
      headers: shopHeaders(shopSlug),
      body: JSON.stringify({
        type: "event",
        title: eventForm.title,
        discountPercent: Number(eventForm.discountPercent),
        productId: eventForm.productId || null,
        days: Number(eventForm.days),
      }),
    });
    onMessage(res.ok ? "이벤트 등록됨" : "등록 실패");
    if (res.ok) {
      setEventForm({ title: "", discountPercent: "10", productId: "", days: "7" });
      setTab("events");
      await onReload();
    }
  }

  return (
    <PanelFrame
      stats={[{ label: "이벤트", value: events.length }]}
      tabs={[
        { id: "events", label: "이벤트 목록" },
        { id: "create-event", label: "이벤트 등록" },
        { id: "trader", label: "떠돌이 상인" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === "events" && (
        <PanelTabBody tabKey="events">
          {events.length === 0 ? (
            <PanelEmpty
              message="등록된 이벤트가 없어요"
              action={
                <PanelPrimaryBtn className="px-6" onClick={() => setTab("create-event")}>
                  이벤트 등록
                </PanelPrimaryBtn>
              }
            />
          ) : (
            <PanelList>
              {events.map((ev) => (
                <PanelRow key={ev.id}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{ev.title}</p>
                    <p className="text-xs text-neutral-500">{ev.discountPercent}% 할인 · 진행 중</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteEvent(ev.id, ev.title)}
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

      {tab === "create-event" && (
        <PanelTabBody tabKey="create-event">
          <form onSubmit={postEvent} className="space-y-4">
            <PanelField label="이벤트 제목">
              <input
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                className="toss-admin-field"
                required
              />
            </PanelField>
            <div className="grid gap-4 sm:grid-cols-2">
              <PanelField label="할인율 (%)">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={eventForm.discountPercent}
                  onChange={(e) => setEventForm({ ...eventForm, discountPercent: e.target.value })}
                  className="toss-admin-field"
                  required
                />
              </PanelField>
              <PanelField label="기간 (일)">
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={eventForm.days}
                  onChange={(e) => setEventForm({ ...eventForm, days: e.target.value })}
                  className="toss-admin-field"
                />
              </PanelField>
            </div>
            <PanelField label="대상 상품">
              <select
                value={eventForm.productId}
                onChange={(e) => setEventForm({ ...eventForm, productId: e.target.value })}
                className="toss-admin-field"
              >
                <option value="">전체 상품</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </PanelField>
            <PanelPrimaryBtn type="submit" className="w-full sm:w-auto sm:min-w-[200px]">
              이벤트 등록
            </PanelPrimaryBtn>
          </form>
        </PanelTabBody>
      )}

      {tab === "trader" && (
        <PanelTabBody tabKey="trader">
          <TraderDealSettings shopSlug={shopSlug} products={products} onMessage={onMessage} />
        </PanelTabBody>
      )}
    </PanelFrame>
  );
}
