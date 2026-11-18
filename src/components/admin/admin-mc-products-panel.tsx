"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, Plus, Trash2, User, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { MC_NICKNAME_RE, MC_RESALE_CATEGORY, maskMcNickname, mcAccountCategory } from "@/lib/mc-account";
import { useMcCategories } from "@/lib/use-mc-categories";
import { productDiscountPercent } from "@/lib/pricing";
import { CAPES } from "@/lib/capes-data";
import { CapeFaceImg } from "@/components/capes/cape-face";
import type { ProductWithStock, ShopCategory } from "@/lib/types";

type Form = {
  nickname: string;
  price: string;
  discount: string;
  tag: string;
  category: string;
  description: string;
  email: string;
  password: string;
  recoveryEmail: string;
  recoveryCode: string;
  memo: string;
  /** "" 표시 안 함 · "no" 밴 없음 · "yes" 밴 */
  hyBan: string;
  hyReason: string;
  donutBan: string;
};

type Tri = "" | "no" | "yes";
const triToBool = (v: string) => (v === "yes" ? true : v === "no" ? false : null);
const boolToTri = (v: boolean | null | undefined): Tri => (v === true ? "yes" : v === false ? "no" : "");
function statusPatch(hy: string, reason: string, donut: string) {
  const st = { hypixelBanned: triToBool(hy), hypixelReason: hy === "yes" ? reason.trim() || null : null, donutBanned: triToBool(donut) };
  return st.hypixelBanned === null && st.donutBanned === null ? null : st;
}

const EMPTY: Form = {
  nickname: "",
  price: "",
  discount: "",
  tag: "NON",
  category: "",
  description: "",
  email: "",
  password: "",
  recoveryEmail: "",
  recoveryCode: "",
  memo: "",
  hyBan: "",
  hyReason: "",
  donutBan: "",
};

/** 구매자에게 지급될 계정 정보 한 줄 */
function deliveryText(f: Form) {
  return [
    `닉네임: ${f.nickname.trim()}`,
    `이메일: ${f.email.trim()}`,
    `비밀번호: ${f.password.trim()}`,
    f.recoveryEmail.trim() ? `복구 이메일: ${f.recoveryEmail.trim()}` : "",
    f.recoveryCode.trim() ? `복구 코드: ${f.recoveryCode.trim()}` : "",
    f.memo.trim() ? `메모: ${f.memo.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

/** deliveryText 로 만든 한 줄을 다시 칸별로 나눈다 */
function parseDelivery(code: string): Pick<Form, "email" | "password" | "recoveryEmail" | "recoveryCode" | "memo"> {
  const out = { email: "", password: "", recoveryEmail: "", recoveryCode: "", memo: "" };
  const keys: Record<string, keyof typeof out> = {
    이메일: "email",
    비밀번호: "password",
    "복구 이메일": "recoveryEmail",
    "복구 코드": "recoveryCode",
    메모: "memo",
  };
  let matched = false;
  for (const part of code.split(" | ")) {
    const i = part.indexOf(": ");
    if (i < 0) continue;
    const k = keys[part.slice(0, i).trim()];
    if (k) {
      out[k] = part.slice(i + 2).trim();
      matched = true;
    }
  }
  // 직접 넣은 다른 형식이면 통째로 메모에 둔다 (지우지 않게)
  if (!matched) out.memo = code;
  return out;
}

function randomSlug() {
  return `mc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function AdminMcProductsPanel({
  shopSlug,
  products,
  categories,
  onReload,
  onMessage,
  onDeleteProduct,
}: {
  shopSlug: string;
  products: ProductWithStock[];
  categories: ShopCategory[];
  onReload: () => Promise<void>;
  onMessage: (msg: string) => void;
  onDeleteProduct: (productId: string, name: string) => void;
}) {
  const list = useMemo(() => products.filter((p) => p.productKind === "mc_account"), [products]);
  const [form, setForm] = useState<Form>({ ...EMPTY, category: "일반 계정" });
  void categories;
  const [busy, setBusy] = useState(false);
  const { categories: mcCats, setCategories: setMcCats } = useMcCategories(shopSlug);
  const [newCat, setNewCat] = useState("");

  async function saveCats(next: string[], ok: string) {
    try {
      const res = await fetch("/api/mc-categories", { method: "PUT", credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify({ categories: next }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; categories?: string[] };
      if (!res.ok) throw new Error(data.error || "저장하지 못했어요");
      setMcCats(data.categories ?? next);
      onMessage(ok);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "저장하지 못했어요");
    }
  }
  /** MFA MARKET 연동 — 켜면 계정 정보를 MFA 재고로 보내고, 팔리면 구매자에게 16자리 코드가 간다 */
  const [useMfa, setUseMfa] = useState(true);
  /** MFA 묶음 — 개별 카드 대신 「MFA 계정」 카드 하나에 모아 보여 주고, 상세에서 계정을 골라 산다 */
  const [asGroup, setAsGroup] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    nickname: string;
    price: string;
    discount: string;
    tag: string;
    category: string;
    showName: boolean;
    group?: boolean;
    /** 판매된 계정 — 지급 정보를 고쳐 다시 판매중으로 올릴 수 있다 */
    sold?: boolean;
    relist?: boolean;
    mfaProduct?: string | null;
    mfaAccountId?: number | null;
    hyBan: string;
    hyReason: string;
    donutBan: string;
    /** 판매 전 재고(지급 정보) — 불러오기 전 undefined, 없으면 null */
    invId?: string | null;
    invNote?: string;
    acct?: Pick<Form, "email" | "password" | "recoveryEmail" | "recoveryCode" | "memo">;
    acctOrig?: string;
    acctNick?: string;
    /** 직접 지정한 망토 (null 이면 닉네임으로 자동 감지) */
    capes?: string[] | null;
  } | null>(null);

  /** 수정 창을 열면 그 상품의 판매 전 재고를 불러와 칸에 채운다 */
  async function openEdit(base: {
    id: string;
    nickname: string;
    price: string;
    discount: string;
    tag: string;
    category: string;
    showName: boolean;
    group?: boolean;
    capes?: string[] | null;
    mfaProduct?: string | null;
    hyBan: string;
    hyReason: string;
    donutBan: string;
  }) {
    setEditing({ ...base });
    if (base.mfaProduct) {
      // MFA MARKET 연동 계정: 지급 정보는 MFA 재고에 있다
      try {
        const res = await fetch(`/api/admin/mfa-inventory/accounts?q=${encodeURIComponent(base.nickname)}`, {
          credentials: "include",
          headers: shopHeaders(shopSlug, false),
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          accounts?: { id: number; product: string | null; status: string; email: string; password: string; recovery_email: string | null; recovery_code: string | null; memo: string | null }[];
        };
        const a = (data.accounts ?? []).find((x) => (x.product ?? "") === base.mfaProduct) ?? null;
        if (!a) {
          setEditing((e) => (e && e.id === base.id ? { ...e, invId: null, invNote: "MFA MARKET 에서 이 계정을 찾지 못했어요.", acct: undefined } : e));
          return;
        }
        const acct = { email: a.email ?? "", password: a.password ?? "", recoveryEmail: a.recovery_email ?? "", recoveryCode: a.recovery_code ?? "", memo: a.memo ?? "" };
        const sold = a.status === "sold";
        setEditing((e) =>
          e && e.id === base.id
            ? {
                ...e,
                invId: null,
                mfaAccountId: a.id,
                sold,
                relist: false,
                acct,
                acctOrig: JSON.stringify(acct),
                acctNick: base.nickname,
                invNote: sold
                  ? "MFA MARKET 에서 판매된 계정이에요. 정보를 고치고 「다시 판매중으로 올리기」 를 켜면 다시 판매돼요."
                  : "MFA MARKET 연동 계정 · 구매자에게 16자리 코드로 지급돼요.",
              }
            : e,
        );
      } catch {
        setEditing((e) => (e && e.id === base.id ? { ...e, invId: null, invNote: "MFA MARKET 정보를 불러오지 못했어요." } : e));
      }
      return;
    }
    try {
      const res = await fetch(`/api/inventory?productId=${encodeURIComponent(base.id)}`, {
        credentials: "include",
        headers: shopHeaders(shopSlug, false),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { inventories?: { id: string; codeValue: string; status: string }[] };
      const list = data.inventories ?? [];
      const item = list.find((i) => i.status === "available") ?? null;
      const soldItem = !item ? list.find((i) => i.status === "sold") : null;
      if (soldItem) {
        // 판매된 계정: 마지막 지급 정보를 채워 두고, '다시 판매중으로' 를 켜면 새 재고로 올린다
        const acct = parseDelivery(soldItem.codeValue);
        setEditing((e) =>
          e && e.id === base.id
            ? { ...e, invId: null, sold: true, relist: false, acct, acctOrig: "", acctNick: base.nickname, invNote: "판매된 계정이에요. 정보를 고친 뒤 「다시 판매중으로 올리기」 를 켜면 새 재고로 다시 올라가요." }
            : e,
        );
        return;
      }
      if (!item) {
        setEditing((e) =>
          e && e.id === base.id
            ? { ...e, invId: null, invNote: list.some((i) => i.status === "sold") ? "이미 판매된 계정이라 지급 정보는 고칠 수 없어요." : list.length ? "결제 대기 중인 재고라 지금은 고칠 수 없어요." : "등록된 지급 정보가 없어요. 아래에 넣으면 새로 추가돼요.", acct: list.length ? undefined : { email: "", password: "", recoveryEmail: "", recoveryCode: "", memo: "" } }
            : e,
        );
        return;
      }
      const acct = parseDelivery(item.codeValue);
      setEditing((e) => (e && e.id === base.id ? { ...e, invId: item.id, acct, acctOrig: JSON.stringify(acct), acctNick: base.nickname } : e));
    } catch {
      setEditing((e) => (e && e.id === base.id ? { ...e, invId: null, invNote: "지급 정보를 불러오지 못했어요." } : e));
    }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function api(path: string, method: string, body: unknown) {
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: shopHeaders(shopSlug),
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; product?: { id: string } };
    if (!res.ok) throw new Error(data.error || "요청 실패");
    return data;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nickname = form.nickname.trim();
    const price = Number(form.price);
    const discount = form.discount.trim() ? Number(form.discount) : 0;
    if (!MC_NICKNAME_RE.test(nickname)) return onMessage("닉네임은 영문·숫자·_ 3~16자예요.");
    if (!Number.isInteger(price) || price < 0) return onMessage("가격을 확인해 주세요.");
    if (!Number.isInteger(discount) || discount < 0 || discount > 90) return onMessage("할인율은 0~90 사이예요.");
    if (!form.email.trim() || !form.password.trim()) return onMessage("이메일과 비밀번호는 꼭 넣어 주세요.");
    setBusy(true);
    try {
      const masked = maskMcNickname(nickname);
      const slug = randomSlug();
      const mfaName = `DOES ${slug}`.slice(0, 40);
      const created = await api("/api/products", "POST", {
        // 상품명은 디스코드 구매 로그 등에 공개되므로 실제 닉네임 대신 가린 이름을 쓴다
        name: `마크 계정 ${masked}`,
        slug,
        price,
        category: form.category || "일반 계정",
        description: form.description.trim(),
        tags: form.tag.trim() ? [form.tag.trim().slice(0, 32)] : [],
        productKind: "mc_account",
        mcNickname: nickname,
        discountPercent: discount || null,
        listingKind: "individual",
        fulfillment: "auto",
        purchaseLimitPerUser: null,
        ...(useMfa ? { mfaProduct: mfaName } : {}),
        ...(asGroup ? { mcGroup: true } : {}),
        mcStatus: statusPatch(form.hyBan, form.hyReason, form.donutBan),
      });
      const productId = created.product?.id;
      let note = "";
      if (productId && useMfa) {
        try {
          await api("/api/admin/mfa-inventory/accounts", "POST", {
            nickname,
            email: form.email.trim(),
            password: form.password.trim(),
            recoveryEmail: form.recoveryEmail.trim() || null,
            recoveryCode: form.recoveryCode.trim() || null,
            memo: form.memo.trim() || null,
            product: mfaName,
          });
          note = " · MFA MARKET 연동 (16자리 코드로 지급)";
        } catch (err) {
          // 연동이 안 되면 예전처럼 직접 지급 재고로 둔다
          await api(`/api/products/${productId}`, "PATCH", { mfaProduct: null }).catch(() => null);
          await api("/api/inventory", "POST", { productId, codes: [deliveryText(form)] });
          note = ` · MFA 연동 실패라 직접 지급으로 등록 (${err instanceof Error ? err.message : "오류"})`;
        }
      } else if (productId) {
        await api("/api/inventory", "POST", { productId, codes: [deliveryText(form)] });
      }
      onMessage(`${masked} 계정을 등록했어요${note}`);
      setForm({ ...EMPTY, category: form.category, tag: form.tag });
      await onReload();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const nickname = editing.nickname.trim();
    const price = Number(editing.price);
    const discount = editing.discount.trim() ? Number(editing.discount) : 0;
    if (!MC_NICKNAME_RE.test(nickname)) return onMessage("닉네임은 영문·숫자·_ 3~16자예요.");
    if (!Number.isInteger(price) || price < 0) return onMessage("가격을 확인해 주세요.");
    if (!Number.isInteger(discount) || discount < 0 || discount > 90) return onMessage("할인율은 0~90 사이예요.");
    setBusy(true);
    try {
      await api(`/api/products/${editing.id}`, "PATCH", {
        name: `마크 계정 ${maskMcNickname(nickname)}`,
        mcNickname: nickname,
        price,
        discountPercent: discount || null,
        tags: editing.tag.trim() ? [editing.tag.trim().slice(0, 32)] : [],
        mcCapes: editing.capes ?? null,
        category: editing.category,
        mcShowName: editing.showName,
        mcGroup: Boolean(editing.group),
        mcStatus: statusPatch(editing.hyBan, editing.hyReason, editing.donutBan),
      });
      // 지급 정보(이메일·비밀번호·복구코드)가 바뀌었으면 재고도 고친다
      const acct = editing.acct;
      const blankNew = editing.invId === null && acct && !acct.email.trim() && !acct.password.trim();
      if (editing.mfaAccountId && acct) {
        const changed = JSON.stringify(acct) !== editing.acctOrig || editing.nickname !== editing.acctNick;
        if (changed || editing.relist) {
          if (!acct.email.trim() || !acct.password.trim()) throw new Error("이메일과 비밀번호는 꼭 넣어 주세요.");
          await api(`/api/admin/mfa-inventory/accounts/${editing.mfaAccountId}`, "PUT", {
            nickname,
            email: acct.email.trim(),
            password: acct.password.trim(),
            recoveryEmail: acct.recoveryEmail.trim() || null,
            recoveryCode: acct.recoveryCode.trim() || null,
            memo: acct.memo.trim() || null,
            product: editing.mfaProduct,
          });
        }
        if (editing.sold && editing.relist) {
          await api(`/api/admin/mfa-inventory/accounts/${editing.mfaAccountId}/release`, "POST", {});
          await api(`/api/products/${editing.id}`, "PATCH", { active: true });
        }
      } else if (editing.sold) {
        if (editing.relist && acct) {
          if (!acct.email.trim() || !acct.password.trim()) throw new Error("이메일과 비밀번호는 꼭 넣어 주세요.");
          await api("/api/inventory", "POST", { productId: editing.id, codes: [deliveryText({ ...EMPTY, ...acct, nickname })] });
          await api(`/api/products/${editing.id}`, "PATCH", { active: true });
        }
      } else if (acct && !blankNew && (JSON.stringify(acct) !== editing.acctOrig || editing.nickname !== editing.acctNick)) {
        if (!acct.email.trim() || !acct.password.trim()) throw new Error("이메일과 비밀번호는 꼭 넣어 주세요.");
        const code = deliveryText({ ...EMPTY, ...acct, nickname });
        if (editing.invId) await api("/api/inventory", "PATCH", { id: editing.invId, code });
        else if (editing.invId === null) await api("/api/inventory", "POST", { productId: editing.id, codes: [code] });
      }
      onMessage("수정했어요");
      setEditing(null);
      await onReload();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  const field = "toss-admin-field";

  return (
    <div className="space-y-5">
      <section className="admin-bento p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">마크 계정 카테고리</h3>
          <span className="text-xs text-neutral-500">상점 「마인크래프트 계정」 탭 순서대로 보여요</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mcCats.map((c, i) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm font-semibold">
              {i > 0 ? (
                <button type="button" title="앞으로" className="text-neutral-500 hover:text-white" onClick={() => {
                  const next = [...mcCats];
                  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                  void saveCats(next, "순서를 바꿨어요");
                }}>‹</button>
              ) : null}
              {c}
              {c === MC_RESALE_CATEGORY ? (
                <span className="text-[10px] font-normal text-neutral-500">신청용 · 고정</span>
              ) : (
                <button
                  type="button"
                  title="삭제"
                  className="text-neutral-500 hover:text-red-400"
                  onClick={() => {
                    if (!confirm(`「${c}」 카테고리를 지울까요? 이 카테고리 계정은 「${mcCats.find((x) => x !== c && x !== MC_RESALE_CATEGORY) ?? "첫 카테고리"}」 에 보여요.`)) return;
                    void saveCats(mcCats.filter((x) => x !== c), "카테고리를 지웠어요");
                  }}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          ))}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newCat.trim();
              if (!name) return;
              if (mcCats.includes(name)) return onMessage("이미 있는 카테고리예요");
              // 대리판매는 항상 맨 뒤 근처에 두고 새 카테고리는 그 앞에 넣는다
              const at = mcCats.indexOf(MC_RESALE_CATEGORY);
              const next = at >= 0 ? [...mcCats.slice(0, at), name, ...mcCats.slice(at)] : [...mcCats, name];
              setNewCat("");
              void saveCats(next, `「${name}」 카테고리를 추가했어요`);
            }}
          >
            <input className="toss-admin-field h-9 w-36 py-1 text-sm" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={20} placeholder="새 카테고리" />
            <button type="submit" className="toss-admin-primary inline-flex h-9 items-center gap-1 px-3 text-sm">
              <Plus className="size-4" /> 추가
            </button>
          </form>
        </div>
      </section>

      <section className="admin-bento p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">마크 계정 등록</h3>
          <span className="text-xs text-neutral-500">등록하면 상점 「마인크래프트 계정」 탭에 스킨 카드로 올라가요</span>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">마인크래프트 닉네임 (IGN)</span>
            <input className={`${field} font-mono`} value={form.nickname} onChange={set("nickname")} placeholder="Notch" maxLength={16} required />
            {form.nickname ? <span className="text-[11px] text-neutral-500">상점 표시: {maskMcNickname(form.nickname)}</span> : null}
          </label>
          <div className="grid grid-cols-[1fr_96px_88px] gap-2">
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">가격 (원)</span>
              <input className={field} type="number" min={0} value={form.price} onChange={set("price")} required />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">할인 %</span>
              <input className={field} type="number" min={0} max={90} value={form.discount} onChange={set("discount")} placeholder="0" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">표시 태그</span>
              <input className={field} value={form.tag} onChange={set("tag")} placeholder="NON" maxLength={12} />
            </label>
          </div>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">이메일</span>
            <input className={field} value={form.email} onChange={set("email")} placeholder="account@outlook.com" required />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">비밀번호</span>
            <input className={field} value={form.password} onChange={set("password")} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">복구 이메일 (선택)</span>
            <input className={field} value={form.recoveryEmail} onChange={set("recoveryEmail")} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">복구 코드 (선택)</span>
            <input className={field} value={form.recoveryCode} onChange={set("recoveryCode")} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">카테고리</span>
            <select className={field} value={form.category} onChange={set("category")}>
              {mcCats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">메모 (구매자에게 같이 전달)</span>
            <input className={field} value={form.memo} onChange={set("memo")} placeholder="구매 후 24시간 안에 보안 정보를 변경해 주세요" />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-neutral-400">상품 설명 (상세 페이지에 표시)</span>
            <textarea className={`${field} min-h-[72px] resize-y`} value={form.description} onChange={set("description")} />
          </label>

          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">Hypixel 밴</span>
              <select className={field} value={form.hyBan} onChange={set("hyBan")}>
                <option value="">표시 안 함</option>
                <option value="no">밴 없음 (Unbanned)</option>
                <option value="yes">밴 (Banned)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">Hypixel 밴 사유 (선택)</span>
              <input className={field} value={form.hyReason} onChange={set("hyReason")} placeholder="cheating" maxLength={40} disabled={form.hyBan !== "yes"} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">DonutSMP 밴</span>
              <select className={field} value={form.donutBan} onChange={set("donutBan")}>
                <option value="">표시 안 함</option>
                <option value="no">밴 없음 (Unbanned)</option>
                <option value="yes">밴 (Banned)</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={useMfa} onChange={(e) => setUseMfa(e.target.checked)} />
            MFA MARKET 연동 — 계정 정보를 MFA 재고로 보내고, 구매자에게는 16자리 코드로 지급해요
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500/5 px-3 py-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={asGroup} onChange={(e) => setAsGroup(e.target.checked)} />
            MFA 상품으로 올리기 — 개별 카드 대신 「MFA 계정」 카드 안에 들어가고, 구매자가 상세에서 계정(이름·망토)을 골라 사요
          </label>
          <div className="flex justify-end sm:col-span-2">
            <button type="submit" disabled={busy} className="toss-admin-primary inline-flex items-center gap-2 px-6">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              계정 등록
            </button>
          </div>
        </form>
      </section>

      <section className="admin-bento p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-bold">
          등록된 마크 계정 <span className="text-sm font-medium text-neutral-500">{list.length}</span>
        </h3>
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">아직 등록된 계정이 없어요</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {list.map((p) => {
              const d = productDiscountPercent(p);
              const final = Math.round(p.price * (1 - d / 100));
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#0b1020]">
                    {p.active ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/mc-account/${encodeURIComponent(p.id)}?asset=skin&v=${encodeURIComponent(p.mcVersion ?? p.mcNickname ?? "0")}`}
                        alt=""
                        className="size-12 object-contain"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    ) : (
                      <User className="size-5 text-neutral-600" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {p.mcNickname || "-"}{" "}
                      <span className="text-xs font-normal text-neutral-500">({p.mcMaskedName || maskMcNickname(p.mcNickname ?? "")})</span>
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {d > 0 ? (
                        <>
                          <s>{p.price.toLocaleString("ko-KR")}원</s> → <b className="text-red-400">{final.toLocaleString("ko-KR")}원</b> ({d}%)
                        </>
                      ) : (
                        `${p.price.toLocaleString("ko-KR")}원`
                      )}
                      {" · "}
                      {p.availableCount > 0 ? "판매중" : "판매됨/재고 없음"}
                      {" · "}
                      {mcAccountCategory(p.category, mcCats)}
                      {p.mfaProduct ? " · MFA 연동" : ""}
                      {p.tags?.[0] ? ` · ${p.tags[0]}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    title="수정"
                    onClick={() =>
                      void openEdit({
                        id: p.id,
                        nickname: p.mcNickname ?? "",
                        price: String(p.price),
                        discount: d ? String(d) : "",
                        tag: p.tags?.[0] ?? "",
                        category: mcAccountCategory(p.category, mcCats),
                        showName: Boolean(p.mcShowName),
                        group: Boolean(p.mcGroup),
                        capes: p.mcCapes ?? null,
                        mfaProduct: p.mfaProduct ?? null,
                        hyBan: boolToTri(p.mcStatus?.hypixelBanned),
                        hyReason: p.mcStatus?.hypixelReason ?? "",
                        donutBan: boolToTri(p.mcStatus?.donutBanned),
                      })
                    }
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button type="button" className="admin-icon-btn" title="삭제" onClick={() => onDeleteProduct(p.id, p.name)}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-neutral-500">
          계정 정보(이메일·비밀번호)는 상품의 재고로 저장돼 구매 즉시 구매자에게 지급돼요. 연필 버튼으로 바로 고칠 수 있어요.
        </p>
      </section>

      {editing && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(0,0,0,0.55)] p-4" onClick={() => setEditing(null)}>
              <form className="admin-bento grid max-h-[92vh] w-full max-w-lg gap-3 overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
                <div className="flex items-center justify-between">
                  <h3 className="text-[17px] font-extrabold">마크 계정 수정</h3>
                  <button type="button" className="admin-icon-btn" onClick={() => setEditing(null)}>
                    <X className="size-4" />
                  </button>
                </div>
                <label className="space-y-1">
                  <span className="text-xs text-neutral-400">닉네임 (IGN) — 바꾸면 스킨·망토도 바로 새로 받아와요</span>
                  <input className={`${field} font-mono`} value={editing.nickname} onChange={(e) => setEditing({ ...editing, nickname: e.target.value })} maxLength={16} />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-neutral-400">가격</span>
                    <input className={field} type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-neutral-400">할인 %</span>
                    <input className={field} type="number" value={editing.discount} onChange={(e) => setEditing({ ...editing, discount: e.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-neutral-400">태그</span>
                    <input className={field} value={editing.tag} onChange={(e) => setEditing({ ...editing, tag: e.target.value })} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-neutral-400">카테고리</span>
                    <select className={field} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                      {mcCats.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-neutral-400">상점 닉네임 표시</span>
                    <select className={field} value={editing.showName ? "show" : "mask"} onChange={(e) => setEditing({ ...editing, showName: e.target.value === "show" })}>
                      <option value="mask">가리기 ({maskMcNickname(editing.nickname)})</option>
                      <option value="show">공개 ({editing.nickname})</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-neutral-400">진열 방식</span>
                    <select className={field} value={editing.group ? "group" : "single"} onChange={(e) => setEditing({ ...editing, group: e.target.value === "group" })}>
                      <option value="single">개별 카드</option>
                      <option value="group">MFA 상품 (묶음에서 골라 구매)</option>
                    </select>
                  </label>
                </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">Hypixel 밴</span>
              <select className={field} value={editing.hyBan} onChange={(e) => setEditing({ ...editing, hyBan: e.target.value })}>
                <option value="">표시 안 함</option>
                <option value="no">밴 없음 (Unbanned)</option>
                <option value="yes">밴 (Banned)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">Hypixel 밴 사유 (선택)</span>
              <input className={field} value={editing.hyReason} onChange={(e) => setEditing({ ...editing, hyReason: e.target.value })} placeholder="cheating" maxLength={40} disabled={editing.hyBan !== "yes"} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-neutral-400">DonutSMP 밴</span>
              <select className={field} value={editing.donutBan} onChange={(e) => setEditing({ ...editing, donutBan: e.target.value })}>
                <option value="">표시 안 함</option>
                <option value="no">밴 없음 (Unbanned)</option>
                <option value="yes">밴 (Banned)</option>
              </select>
            </label>
          </div>
                <div className="grid gap-2 border-t border-white/10 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-neutral-300">망토</span>
                    <div className="flex gap-1 rounded-lg bg-white/[0.05] p-0.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, capes: null })}
                        className={`rounded-md px-2.5 py-1 ${editing.capes == null ? "bg-white text-black" : "text-neutral-400"}`}
                      >
                        자동 감지
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, capes: editing.capes ?? [] })}
                        className={`rounded-md px-2.5 py-1 ${editing.capes != null ? "bg-white text-black" : "text-neutral-400"}`}
                      >
                        직접 지정
                      </button>
                    </div>
                  </div>
                  {editing.capes == null ? (
                    <p className="text-[11px] text-neutral-500">닉네임으로 장착 중인 망토를 자동으로 찾아 보여 줘요.</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-neutral-500">
                        눌러서 넣고 빼요 · 선택 {editing.capes.length}개 (선택한 망토만 카드·상세에 보여요)
                      </p>
                      <div className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4">
                        {CAPES.map((c) => {
                          const on = editing.capes!.includes(c.type);
                          return (
                            <button
                              key={c.type}
                              type="button"
                              onClick={() =>
                                setEditing({
                                  ...editing,
                                  capes: on ? editing.capes!.filter((t) => t !== c.type) : [...editing.capes!, c.type],
                                })
                              }
                              className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[11px] ${
                                on ? "border-emerald-400 bg-emerald-500/15 text-white" : "border-white/10 text-neutral-400"
                              }`}
                            >
                              <CapeFaceImg hash={c.hash} width={10} alt="" />
                              <span className="truncate">{c.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                <div className="grid gap-2 border-t border-white/10 pt-3">
                  <span className="text-xs font-semibold text-neutral-300">지급 정보 (구매자에게 전달)</span>
                  {editing.invNote ? <p className="text-xs text-amber-300">{editing.invNote}</p> : null}
                  {editing.invId === undefined ? (
                    <p className="flex items-center gap-2 text-xs text-neutral-500">
                      <Loader2 className="size-3 animate-spin" /> 불러오는 중…
                    </p>
                  ) : editing.acct ? (
                    <>
                      {(
                        [
                          ["email", "이메일 *"],
                          ["password", "비밀번호 *"],
                          ["recoveryEmail", "복구 이메일"],
                          ["recoveryCode", "복구 코드"],
                          ["memo", "메모"],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k} className="space-y-1">
                          <span className="text-xs text-neutral-400">{label}</span>
                          <input
                            className={`${field} font-mono`}
                            value={editing.acct![k]}
                            onChange={(e) => setEditing({ ...editing, acct: { ...editing.acct!, [k]: e.target.value } })}
                          />
                        </label>
                      ))}
                      {editing.sold ? (
                        <label className="mt-1 flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm">
                          <input type="checkbox" checked={Boolean(editing.relist)} onChange={(e) => setEditing({ ...editing, relist: e.target.checked })} />
                          다시 판매중으로 올리기 (위 정보로 새 재고 추가)
                        </label>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="toss-admin-ghost" onClick={() => setEditing(null)}>
                    취소
                  </button>
                  <button type="submit" disabled={busy} className="toss-admin-primary px-5">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    저장
                  </button>
                </div>
              </form>
            </div>,
            document.querySelector(".admin-shell") ?? document.body,
          )
        : null}
    </div>
  );
}
