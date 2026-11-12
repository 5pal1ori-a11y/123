"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { PanelListSkeleton } from "@/components/ui/skeleton";
import { shopHeaders } from "@/lib/shop-client";
import type { WorldMissionType, WorldSettings } from "@/lib/types";
import {
  PanelEmpty,
  PanelField,
  PanelFrame,
  PanelList,
  PanelPrimaryBtn,
  PanelRow,
  PanelTabBody,
} from "./admin-panel-ui";

type ProductOption = { id: string; name: string; price: number; thumbnail: string | null };
type Payload = { world: WorldSettings; hypixel: boolean; products: ProductOption[] };

type RecipeDraft = { id?: string; productId: string; tokens: string };
type AccountDraft = { id?: string; ign: string; productId: string; note: string };

const MISSIONS: { id: WorldMissionType; title: string; desc: string }[] = [
  { id: "attend", title: "다이아몬드 캐기", desc: "출석체크에서 다이아몬드 1개 캐기" },
  { id: "parkour", title: "하늘섬 파쿠르 완주", desc: "내 섬 점프맵 끝까지 올라가기" },
  { id: "build", title: "섬 꾸미기", desc: "내 섬에 블록 놓기/옮기기" },
  { id: "review", title: "후기 남기기", desc: "사이트·디스코드 후기 1개" },
  { id: "end_visit", title: "엔드 탐험", desc: "광장 엔드 포털 들어가기" },
  { id: "purchase", title: "상품 구매하기", desc: "아무 상품 1개 구매" },
];

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function AdminWorldPanel({
  shopSlug,
  onMessage,
}: {
  shopSlug: string;
  onMessage: (message: string | null, kind?: "success" | "error") => void;
}) {
  const [tab, setTab] = useState<"rewards" | "recipes" | "accounts">("rewards");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [coupon, setCoupon] = useState({ enabled: true, amount: "1000", minutes: "10" });
  const [missions, setMissions] = useState<WorldSettings["missions"] | null>(null);
  const [recipes, setRecipes] = useState<RecipeDraft[]>([]);
  const [accounts, setAccounts] = useState<AccountDraft[]>([]);

  const hydrate = (p: Payload) => {
    setData(p);
    setCoupon({
      enabled: p.world.parkourCoupon.enabled,
      amount: String(p.world.parkourCoupon.amount),
      minutes: String(p.world.parkourCoupon.minutes),
    });
    setMissions(p.world.missions);
    setRecipes(p.world.recipes.map((r) => ({ id: r.id, productId: r.productId, tokens: String(r.tokens) })));
    setAccounts(
      p.world.accounts.map((a) => ({ id: a.id, ign: a.ign, productId: a.productId ?? "", note: a.note ?? "" })),
    );
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/world", { credentials: "include", headers: shopHeaders(shopSlug) });
        if (!res.ok) throw new Error("load");
        const json = (await res.json()) as Payload;
        if (!cancelled) hydrate(json);
      } catch {
        if (!cancelled) setError("마크 월드 설정을 불러오지 못했어요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopSlug]);

  const productName = useMemo(() => {
    const map = new Map((data?.products ?? []).map((p) => [p.id, p]));
    return (id: string) => map.get(id);
  }, [data]);

  async function save() {
    if (!missions) return;
    setSaving(true);
    try {
      const body = {
        parkourCoupon: {
          enabled: coupon.enabled,
          amount: Math.max(0, Math.floor(Number(coupon.amount) || 0)),
          minutes: Math.min(1440, Math.max(1, Math.floor(Number(coupon.minutes) || 10))),
        },
        missions,
        recipes: recipes
          .filter((r) => r.productId)
          .map((r) => ({ id: r.id, productId: r.productId, tokens: Math.max(1, Math.floor(Number(r.tokens) || 1)) })),
        accounts: accounts
          .filter((a) => a.ign.trim())
          .map((a) => ({ id: a.id, ign: a.ign.trim(), productId: a.productId || null, note: a.note.trim() })),
      };
      const res = await fetch("/api/admin/world", {
        method: "PUT",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok) {
        onMessage(json.error ?? "저장하지 못했어요.", "error");
        return;
      }
      hydrate(json);
      onMessage("마크 월드 설정을 저장했어요.", "success");
    } catch {
      onMessage("저장하지 못했어요.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <PanelEmpty message={error} />;
  if (!data || !missions) {
    return (
      <div className="admin-bento p-4 sm:p-5">
        <PanelListSkeleton rows={5} />
      </div>
    );
  }

  const saveBar = (
    <div className="flex items-center justify-end gap-3 pt-2">
      <PanelPrimaryBtn onClick={() => void save()} disabled={saving} className="gap-2 px-6">
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        저장
      </PanelPrimaryBtn>
    </div>
  );

  return (
    <PanelFrame
      stats={[
        { label: "제작대 레시피", value: recipes.length },
        { label: "엔드 계정", value: accounts.length },
        { label: "파쿠르 쿠폰", value: coupon.enabled ? won(Number(coupon.amount) || 0) : "꺼짐" },
        { label: "하이픽셀 스탯", value: data.hypixel ? "연결됨" : "키 없음" },
      ]}
      tabs={[
        { id: "rewards", label: "파쿠르 · 미션" },
        { id: "recipes", label: "제작대 교환" },
        { id: "accounts", label: "엔드 계정 전시" },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      {tab === "rewards" && (
        <PanelTabBody tabKey="rewards">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">하늘섬 파쿠르 완주 쿠폰</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  계정당 한 번 지급 · 디스코드 자판기 「쿠폰 사용」이나 충전 탭에서 잔액으로 등록돼요.
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={coupon.enabled}
                  onChange={(e) => setCoupon({ ...coupon, enabled: e.target.checked })}
                  className="size-4 accent-emerald-500"
                />
                사용
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <PanelField label="쿠폰 금액" hint="원">
                <input
                  type="number"
                  min={0}
                  value={coupon.amount}
                  onChange={(e) => setCoupon({ ...coupon, amount: e.target.value })}
                  className="toss-admin-field"
                />
              </PanelField>
              <PanelField label="유효 시간" hint="분">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={coupon.minutes}
                  onChange={(e) => setCoupon({ ...coupon, minutes: e.target.value })}
                  className="toss-admin-field"
                />
              </PanelField>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-neutral-500">
              일일 미션 · 하루에 하나씩 순서대로 돌아가며, 완료하면 토큰을 받아요
            </p>
            <PanelList>
              {MISSIONS.map((m) => (
                <PanelRow key={m.id}>
                  <input
                    type="checkbox"
                    checked={missions[m.id].enabled}
                    onChange={(e) =>
                      setMissions({ ...missions, [m.id]: { ...missions[m.id], enabled: e.target.checked } })
                    }
                    className="size-4 shrink-0 accent-emerald-500"
                    aria-label={`${m.title} 사용`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{m.title}</p>
                    <p className="text-xs text-neutral-500">{m.desc}</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
                    토큰
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={missions[m.id].tokens}
                      onChange={(e) =>
                        setMissions({
                          ...missions,
                          [m.id]: { ...missions[m.id], tokens: Math.max(0, Math.floor(Number(e.target.value) || 0)) },
                        })
                      }
                      className="toss-admin-field w-20"
                    />
                  </label>
                </PanelRow>
              ))}
            </PanelList>
          </div>
          {saveBar}
        </PanelTabBody>
      )}

      {tab === "recipes" && (
        <PanelTabBody tabKey="recipes">
          <p className="text-xs text-neutral-500">
            광장 제작대에서 토큰을 내고 실제 상품으로 교환해요. 교환하면 상품이 바로 지급되고 주문 내역에 0원으로 남아요.
          </p>
          {recipes.length === 0 ? (
            <PanelEmpty message="아직 교환 레시피가 없어요" />
          ) : (
            <PanelList>
              {recipes.map((r, i) => {
                const p = productName(r.productId);
                return (
                  <PanelRow key={r.id ?? `new-${i}`}>
                    <select
                      value={r.productId}
                      onChange={(e) =>
                        setRecipes(recipes.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))
                      }
                      className="toss-admin-field min-w-0 flex-1"
                    >
                      <option value="">상품 선택</option>
                      {data.products.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name} · {won(opt.price)}
                        </option>
                      ))}
                    </select>
                    <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
                      토큰
                      <input
                        type="number"
                        min={1}
                        value={r.tokens}
                        onChange={(e) =>
                          setRecipes(recipes.map((x, j) => (j === i ? { ...x, tokens: e.target.value } : x)))
                        }
                        className="toss-admin-field w-20"
                      />
                    </label>
                    {p ? null : r.productId ? <span className="text-xs text-red-400">없는 상품</span> : null}
                    <button
                      type="button"
                      onClick={() => setRecipes(recipes.filter((_, j) => j !== i))}
                      className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                      aria-label="삭제"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </PanelRow>
                );
              })}
            </PanelList>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={recipes.length >= 54 || data.products.length === 0}
              onClick={() => setRecipes([...recipes, { productId: "", tokens: "10" }])}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/[0.05] disabled:opacity-40"
            >
              <Plus className="size-4" /> 레시피 추가
            </button>
            {saveBar}
          </div>
        </PanelTabBody>
      )}

      {tab === "accounts" && (
        <PanelTabBody tabKey="accounts">
          <p className="text-xs text-neutral-500">
            광장 엔드 포털에서 보여줄 정품 마크 계정이에요. 닉네임을 넣으면 저장할 때 스킨과 기본 닉네임을 불러와요.
            {data.hypixel
              ? " 하이픽셀 스탯도 함께 보여줘요."
              : " 하이픽셀 스탯은 HYPIXEL_API_KEY 시크릿을 등록하면 자동으로 보여요."}
          </p>
          {accounts.length === 0 ? (
            <PanelEmpty message="전시 중인 계정이 없어요" />
          ) : (
            <PanelList>
              {accounts.map((a, i) => (
                <PanelRow key={a.id ?? `new-${i}`} className="flex-wrap">
                  {a.id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://mc-heads.net/avatar/${encodeURIComponent(a.ign)}/32`}
                      alt=""
                      width={32}
                      height={32}
                      className="size-8 shrink-0 rounded [image-rendering:pixelated]"
                    />
                  ) : (
                    <div className="size-8 shrink-0 rounded bg-white/5" />
                  )}
                  <input
                    value={a.ign}
                    placeholder="마크 닉네임"
                    maxLength={16}
                    onChange={(e) =>
                      setAccounts(accounts.map((x, j) => (j === i ? { ...x, ign: e.target.value } : x)))
                    }
                    className="toss-admin-field w-40 font-mono"
                  />
                  <select
                    value={a.productId}
                    onChange={(e) =>
                      setAccounts(accounts.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))
                    }
                    className="toss-admin-field min-w-0 flex-1"
                  >
                    <option value="">연결 상품 없음</option>
                    {data.products.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} · {won(opt.price)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={a.note}
                    placeholder="메모 (예: 풀액세스 · 케이프)"
                    maxLength={80}
                    onChange={(e) =>
                      setAccounts(accounts.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
                    }
                    className="toss-admin-field min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setAccounts(accounts.filter((_, j) => j !== i))}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                    aria-label="삭제"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </PanelRow>
              ))}
            </PanelList>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={accounts.length >= 40}
              onClick={() => setAccounts([...accounts, { ign: "", productId: "", note: "" }])}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-300 hover:bg-white/[0.05] disabled:opacity-40"
            >
              <Plus className="size-4" /> 계정 추가
            </button>
            {saveBar}
          </div>
        </PanelTabBody>
      )}
    </PanelFrame>
  );
}
