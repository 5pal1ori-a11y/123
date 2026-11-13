"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, Plus, Trash2, User, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { MC_NICKNAME_RE, maskMcNickname } from "@/lib/mc-account";
import { productDiscountPercent } from "@/lib/pricing";
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
};

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
  const [form, setForm] = useState<Form>({ ...EMPTY, category: categories[0]?.name ?? "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; nickname: string; price: string; discount: string; tag: string } | null>(
    null,
  );

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
      const created = await api("/api/products", "POST", {
        // 상품명은 디스코드 구매 로그 등에 공개되므로 실제 닉네임 대신 가린 이름을 쓴다
        name: `마크 계정 ${masked}`,
        slug: randomSlug(),
        price,
        category: form.category || "마크 계정",
        description: form.description.trim(),
        tags: form.tag.trim() ? [form.tag.trim().slice(0, 32)] : [],
        productKind: "mc_account",
        mcNickname: nickname,
        discountPercent: discount || null,
        listingKind: "individual",
        fulfillment: "auto",
        purchaseLimitPerUser: null,
      });
      const productId = created.product?.id;
      if (productId) {
        await api("/api/inventory", "POST", { productId, codes: [deliveryText(form)] });
      }
      onMessage(`${masked} 계정을 등록했어요`);
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
      });
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
              <option value="">마크 계정</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
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
                      {p.tags?.[0] ? ` · ${p.tags[0]}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    title="수정"
                    onClick={() =>
                      setEditing({
                        id: p.id,
                        nickname: p.mcNickname ?? "",
                        price: String(p.price),
                        discount: d ? String(d) : "",
                        tag: p.tags?.[0] ?? "",
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
          계정 정보(이메일·비밀번호)는 상품의 재고로 저장돼 구매 즉시 구매자에게 지급돼요. 바꾸려면 상품 → 재고 탭에서 지우고 다시 넣어 주세요.
        </p>
      </section>

      {editing && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(0,0,0,0.55)] p-4" onClick={() => setEditing(null)}>
              <form className="admin-bento grid w-full max-w-md gap-3 p-6" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
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
