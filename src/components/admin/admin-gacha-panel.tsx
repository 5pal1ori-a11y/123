"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";

type Prize = { id?: string; label: string; weight: string; points: string };

/** 관리자: /랜덤뽑기 가격 · 상품 · 확률 */
export function AdminGachaPanel({ shopSlug, onMessage }: { shopSlug: string; onMessage: (msg: string) => void }) {
  const [price, setPrice] = useState("500");
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/gacha", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" });
        const data = (await res.json()) as { gacha?: { price: number; prizes: { id: string; label: string; weight: number; points: number }[] } };
        if (data.gacha) {
          setPrice(String(data.gacha.price));
          setPrizes(data.gacha.prizes.map((p) => ({ id: p.id, label: p.label, weight: String(p.weight), points: String(p.points) })));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [shopSlug]);

  const total = useMemo(() => prizes.reduce((s, p) => s + (Number(p.weight) || 0), 0), [prizes]);
  const expected = useMemo(
    () => (total > 0 ? prizes.reduce((s, p) => s + ((Number(p.weight) || 0) / total) * (Number(p.points) || 0), 0) : 0),
    [prizes, total],
  );

  const set = (i: number, k: keyof Prize, v: string) => setPrizes((list) => list.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/gacha", {
        method: "PUT",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({
          price: Number(price),
          prizes: prizes.map((p) => ({ id: p.id, label: p.label.trim(), weight: Number(p.weight) || 0, points: Math.floor(Number(p.points) || 0) })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "저장 실패");
      onMessage("랜덤뽑기 설정을 저장했어요. 패널의 확률 표시는 /랜덤뽑기 로 다시 올리면 바뀌어요.");
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-bento flex items-center gap-2 p-6 text-sm text-neutral-400">
        <Loader2 className="size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }

  return (
    <div className="admin-bento space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-white">랜덤뽑기</h2>
        <p className="mt-1 text-sm text-neutral-400">
          디스코드 <code>/랜덤뽑기</code> 패널에서 한 번 누를 때마다 손님 잔액에서 가격만큼 빠져요. 상품마다 가중치(숫자가 클수록 잘 나옴)를 넣으면 확률이 자동으로 계산돼요.
        </p>
      </div>
      <label className="block max-w-xs space-y-1">
        <span className="text-xs text-neutral-400">한 번 가격 (원)</span>
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className="toss-admin-field" />
      </label>

      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_90px_110px_70px_36px] gap-2 px-1 text-[11px] text-neutral-500 sm:grid">
          <span>상품 이름</span>
          <span>가중치</span>
          <span>잔액 지급 (원)</span>
          <span>확률</span>
          <span />
        </div>
        {prizes.map((p, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 p-2 sm:grid-cols-[1fr_90px_110px_70px_36px] sm:border-0 sm:p-0">
            <input value={p.label} onChange={(e) => set(i, "label", e.target.value)} placeholder="예: 꽝 / 1,000원 / 니트로" className="toss-admin-field col-span-2 sm:col-span-1" />
            <input value={p.weight} onChange={(e) => set(i, "weight", e.target.value)} inputMode="decimal" placeholder="가중치" className="toss-admin-field" />
            <input value={p.points} onChange={(e) => set(i, "points", e.target.value)} inputMode="numeric" placeholder="0" className="toss-admin-field" />
            <span className="flex items-center text-sm font-semibold text-white">
              {total > 0 ? `${(((Number(p.weight) || 0) / total) * 100).toFixed(2)}%` : "-"}
            </span>
            <button type="button" className="admin-icon-btn" onClick={() => setPrizes((list) => list.filter((_, j) => j !== i))} aria-label="삭제">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="toss-admin-ghost inline-flex items-center gap-1"
          onClick={() => setPrizes((list) => [...list, { label: "", weight: "1", points: "0" }])}
        >
          <Plus className="size-4" /> 상품 추가
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        잔액 지급이 0 인 상품(니트로 등)은 당첨되면 디스코드 관리자 로그에 남으니 직접 지급해 주세요. 이름에 「꽝」이 들어가고 지급이 0 이면 꽝으로 보여요.
        <br />한 번 뽑을 때 돌려주는 평균 금액: <b className="text-white">{Math.round(expected).toLocaleString("ko-KR")}원</b> (가격 {Number(price || 0).toLocaleString("ko-KR")}원)
      </p>
      <button type="button" disabled={busy} onClick={() => void save()} className="toss-admin-primary inline-flex items-center gap-2 px-6">
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        저장
      </button>
    </div>
  );
}
