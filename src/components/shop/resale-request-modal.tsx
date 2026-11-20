"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, EyeOff, Loader2, PackagePlus, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { CapeFaceImg } from "@/components/capes/cape-face";
import { maskMcNickname, MC_NICKNAME_RE } from "@/lib/mc-account";
import { RESALE_CAPE_CHOICES, RESALE_DEFAULT_FEE_PERCENT, RESALE_TYPES, resalePayout, type ResaleRequest } from "@/lib/resale-shared";

const STATUS: Record<ResaleRequest["status"], { label: string; cls: string }> = {
  pending: { label: "검토 중", cls: "bg-amber-400/15 text-amber-300" },
  approved: { label: "승인됨", cls: "bg-emerald-400/15 text-emerald-300" },
  rejected: { label: "반려", cls: "bg-red-400/15 text-red-300" },
  cancelled: { label: "취소", cls: "bg-white/10 text-neutral-400" },
};

/** 대리판매 등록 신청 — 승인되면 「대리판매」 탭에 올라가고 디스코드 DM 으로 알려 준다 */
export function ResaleRequestModal({ shopSlug, types: typesProp, onClose }: { shopSlug: string; types?: string[]; onClose: () => void }) {
  const types = typesProp?.length ? typesProp : RESALE_TYPES;
  const [type, setType] = useState<string>(types[0] ?? "일반 계정");
  const [capeQuery, setCapeQuery] = useState("");
  const [ign, setIgn] = useState("");
  const [showName, setShowName] = useState(false);
  const [capes, setCapes] = useState<string[]>([]);
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [agree, setAgree] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginExtra, setLoginExtra] = useState("");
  const [payMethod, setPayMethod] = useState<"points" | "bank">("points");
  const [bankAcct, setBankAcct] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fee, setFee] = useState(RESALE_DEFAULT_FEE_PERCENT);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [mine, setMine] = useState<ResaleRequest[]>([]);

  async function load() {
    const res = await fetch("/api/resale", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { requests?: ResaleRequest[]; feePercent?: number; loggedIn?: boolean } | null;
    if (!data) return;
    setMine(data.requests ?? []);
    setFee(data.feePercent ?? RESALE_DEFAULT_FEE_PERCENT);
    setLoggedIn(Boolean(data.loggedIn));
  }
  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceNum = Number(price.replace(/[^0-9]/g, "")) || 0;
  const payout = useMemo(() => resalePayout(priceNum, fee), [priceNum, fee]);
  const feeAmount = priceNum - payout;
  const ignOk = MC_NICKNAME_RE.test(ign.trim());
  const canSubmit = loggedIn && ignOk && priceNum >= 1000 && agree && !busy && (payMethod === "points" || bankAcct.trim().length >= 6);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/resale", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({
          accountType: type,
          ign: ign.trim(),
          showName,
          capes,
          description: desc,
          price: priceNum,
          agree: true,
          login: loginEmail.trim() && loginPw ? { email: loginEmail.trim(), password: loginPw, extra: loginExtra.trim() } : null,
          payoutMethod: payMethod,
          payoutAccount: payMethod === "bank" ? bankAcct.trim() : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "신청하지 못했어요.");
      setMsg({ ok: true, text: "신청했어요! 관리자가 확인하면 디스코드로 알려 드릴게요." });
      setIgn("");
      setCapes([]);
      setLoginEmail("");
      setLoginPw("");
      setLoginExtra("");
      setDesc("");
      setPrice("");
      setAgree(false);
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "신청하지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    await fetch(`/api/resale/${id}`, { method: "PATCH", credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify({ action: "cancel" }) }).catch(() => null);
    await load();
  }

  const field = "toss-admin-field w-full";
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="admin-bento max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-b-none p-5 sm:rounded-b-[inherit] sm:p-6"
      >
        <div className="mb-4 flex items-start gap-3 border-b border-white/10 pb-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-black">
            <PackagePlus className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-extrabold">도스마켓 판매 등록</h3>
            <p className="text-xs text-neutral-400">관리자 확인 후 공개 → 팔리면 계정 자동 전달 → 구매자 보호 24시간 뒤 정산</p>
          </div>
          <button type="button" className="admin-icon-btn" onClick={onClose} aria-label="닫기">
            <X className="size-4" />
          </button>
        </div>

        {loggedIn === false ? (
          <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">로그인한 뒤에 신청할 수 있어요.</p>
        ) : null}

        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">상품 유형 *</span>
            <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-1.5">
            <span className="text-sm font-semibold">마인크래프트 닉네임 (IGN) *</span>
            <input className={`${field} font-mono`} value={ign} onChange={(e) => setIgn(e.target.value)} maxLength={16} placeholder="마인크래프트 닉네임을 입력하세요" />
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, icon: EyeOff, t: "닉네임 가리기", d: ign.trim() ? maskMcNickname(ign) : "Go****3" },
                { v: true, icon: Eye, t: "닉네임 공개", d: ign.trim() || "Gojo123" },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setShowName(o.v)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                    showName === o.v ? "border-white bg-white/10" : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <o.icon className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <b className="block text-[13px]">{o.t}</b>
                    <span className="block truncate font-mono text-neutral-400">상점 표시: {o.d}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">보유 망토 {capes.length ? <span className="text-xs text-neutral-400">· {capes.length}개 선택</span> : null}</span>
              <input
                className="toss-admin-field h-8 w-36 py-1 text-xs"
                value={capeQuery}
                onChange={(e) => setCapeQuery(e.target.value)}
                placeholder="망토 검색"
              />
            </div>
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-white/10 p-3 sm:grid-cols-4">
              {RESALE_CAPE_CHOICES.filter((c) => !capeQuery.trim() || c.label.toLowerCase().includes(capeQuery.trim().toLowerCase())).map((c) => {
                const on = capes.includes(c.type);
                return (
                  <button
                    key={c.type}
                    type="button"
                    onClick={() => setCapes(on ? capes.filter((x) => x !== c.type) : [...capes, c.type])}
                    className="flex items-center gap-2 text-left text-sm"
                  >
                    <span className={`flex size-5 items-center justify-center rounded-full border ${on ? "border-white bg-white text-black" : "border-white/30"}`}>
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <CapeFaceImg hash={c.hash} width={10} alt="" />
                    <span className="truncate">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">상품 상세 설명</span>
            <textarea
              className={`${field} min-h-[96px] resize-y`}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={1000}
              placeholder="서버 스탯, 랭크, 밴 이력 및 기타 상품 정보를 입력해 주세요."
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">희망 판매 가격 *</span>
            <div className="flex items-center gap-2">
              <input className={field} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="100000" />
              <span className="text-sm">원</span>
            </div>
          </label>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p className="mb-3 font-bold">예상 판매 및 정산 금액</p>
            <div className="grid gap-2 text-neutral-300">
              <div className="flex justify-between">
                <span>판매 가격</span>
                <span>{priceNum.toLocaleString("ko-KR")}원</span>
              </div>
              <div className="flex justify-between">
                <span>판매 수수료 ({fee}%)</span>
                <span className="text-red-400">- {feeAmount.toLocaleString("ko-KR")}원</span>
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
              <b>예상 정산 금액</b>
              <b className="text-xl">{payout.toLocaleString("ko-KR")}원</b>
            </div>
            {fee < RESALE_DEFAULT_FEE_PERCENT ? <p className="mt-2 text-xs text-emerald-300">DOES PASS+ 혜택으로 수수료가 {fee}% 예요</p> : null}
          </div>

          <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-bold">계정 로그인 정보 (팔리면 구매자에게 자동 전달)</p>
            <p className="text-[11px] text-neutral-400">암호화해서 저장하고, 관리자가 확인한 뒤 판매가 되면 구매자에게만 전달돼요. 비워 두면 관리자가 따로 연락해요.</p>
            <input className={field} value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="마이크로소프트 로그인 이메일" autoComplete="off" />
            <input className={field} type="password" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} placeholder="비밀번호" autoComplete="new-password" />
            <input className={field} value={loginExtra} onChange={(e) => setLoginExtra(e.target.value)} placeholder="복구 이메일 · 백업 코드 등 (선택)" autoComplete="off" />
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-semibold">정산 받는 방법</span>
            <div className="grid grid-cols-2 gap-2">
              {(["points", "bank"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${payMethod === m ? "border-white bg-white text-black" : "border-white/15 text-neutral-300"}`}
                >
                  {m === "points" ? "포인트 (자동 · 즉시)" : "계좌 송금"}
                </button>
              ))}
            </div>
            {payMethod === "bank" ? (
              <input className={field} value={bankAcct} onChange={(e) => setBankAcct(e.target.value)} maxLength={100} placeholder="은행 · 계좌번호 · 예금주" />
            ) : null}
          </div>

          <button type="button" onClick={() => setAgree(!agree)} className="flex items-center gap-2.5 text-left text-sm">
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${agree ? "border-white bg-white text-black" : "border-white/30"}`}>
              {agree ? <Check className="size-3" /> : null}
            </span>
            본인 소유 상품이며 판매 수수료 및 거래 정책을 확인했습니다.
          </button>

          {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>{msg.text}</p> : null}

          <button type="submit" disabled={!canSubmit} className="toss-admin-primary inline-flex w-full items-center justify-center gap-2 py-3 disabled:opacity-40">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            도스마켓 판매 등록
          </button>
          <p className="-mt-2 text-center text-[11px] text-neutral-500">관리자가 승인하면 디스코드 DM 으로 알려 드려요 (디스코드 연동 필요)</p>
        </div>

        {mine.length ? (
          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="mb-2 text-sm font-bold">내 신청</p>
            <ul className="grid gap-2">
              {mine.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  <span className="min-w-0 flex-1 truncate font-mono">{r.ign}</span>
                  <span className="text-xs text-neutral-400">{r.price.toLocaleString("ko-KR")}원</span>
                  {r.status === "pending" ? (
                    <button type="button" onClick={() => void cancel(r.id)} className="text-xs text-neutral-400 hover:text-white">
                      취소
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {mine.some((r) => r.status === "rejected" && r.rejectReason) ? (
              <p className="mt-2 text-xs text-neutral-500">반려 사유: {mine.find((r) => r.status === "rejected" && r.rejectReason)?.rejectReason}</p>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>,
    document.body,
  );
}
