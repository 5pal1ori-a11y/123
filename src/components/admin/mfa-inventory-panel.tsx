"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Pencil, RefreshCw, RotateCcw, Search, Send, Trash2, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";

type Stats = { available: number; sold: number; codes: number; redeemed: number };

type ProductRow = { product: string; available: number; price: number | null; description: string | null };

type Account = {
  id: number;
  nickname: string;
  uuid: string | null;
  email: string;
  password: string;
  recovery_email: string | null;
  recovery_code: string | null;
  memo: string | null;
  product: string | null;
  status: "available" | "sold";
  created_at: number;
  sold_at: number | null;
  discord_user_id: string | null;
  view_count: number | null;
};

type AccountForm = {
  nickname: string;
  product: string;
  email: string;
  password: string;
  recoveryEmail: string;
  recoveryCode: string;
  memo: string;
};

const PRODUCT_PRESETS = ["Normal MFA", "Full Access", "NFA", "SFA"];

const EMPTY_FORM: AccountForm = {
  nickname: "",
  product: "Normal MFA",
  email: "",
  password: "",
  recoveryEmail: "",
  recoveryCode: "",
  memo: "",
};

const field =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none placeholder:text-neutral-500 focus:border-white/30";

function formatDate(ms: number | null | undefined) {
  if (!ms) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

function toForm(a: Account): AccountForm {
  return {
    nickname: a.nickname,
    product: a.product ?? "",
    email: a.email,
    password: a.password,
    recoveryEmail: a.recovery_email ?? "",
    recoveryCode: a.recovery_code ?? "",
    memo: a.memo ?? "",
  };
}

export function MfaInventoryPanel({
  shopSlug,
  onMessage: onMessageProp,
}: {
  shopSlug: string;
  onMessage: (text: string, tone?: "ok" | "err") => void;
}) {
  const messageRef = useRef(onMessageProp);
  messageRef.current = onMessageProp;
  const onMessage = useCallback((text: string, tone?: "ok" | "err") => messageRef.current(text, tone), []);
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<"" | "available" | "sold">("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [bulkProduct, setBulkProduct] = useState("Normal MFA");
  const [bulkText, setBulkText] = useState("");
  const [bulkErrors, setBulkErrors] = useState<{ line: number; error: string }[]>([]);
  const [editing, setEditing] = useState<{ id: number; form: AccountForm } | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<string, { price: string; description: string }>>({});
  const [newProduct, setNewProduct] = useState({ product: "", price: "" });

  const api = useCallback(
    async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
      const res = await fetch(`/api/admin/mfa-inventory/${path}`, {
        method,
        credentials: "include",
        headers: shopHeaders(shopSlug, body !== undefined),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error || `요청 실패 (${res.status})`);
      return data;
    },
    [shopSlug],
  );

  const loadAccounts = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const data = await api<{ accounts: Account[] }>(`accounts${params.size ? `?${params}` : ""}`);
    setAccounts(data.accounts);
  }, [api, status, q]);

  const loadMeta = useCallback(async () => {
    const [ov, pr] = await Promise.all([
      api<{ stats: Stats }>("overview"),
      api<{ products: ProductRow[] }>("products"),
    ]);
    setStats(ov.stats);
    setProducts(pr.products);
  }, [api]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadMeta(), loadAccounts()]);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "불러오기 실패", "err");
    } finally {
      setLoading(false);
    }
  }, [loadMeta, loadAccounts, onMessage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPriceDraft(
      Object.fromEntries(
        products.map((p) => [p.product, { price: p.price ? String(p.price) : "", description: p.description ?? "" }]),
      ),
    );
  }, [products]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "요청 실패", "err");
    } finally {
      setBusy(null);
    }
  }

  const productOptions = useMemo(
    () => [...new Set([...PRODUCT_PRESETS, ...products.map((p) => p.product)])],
    [products],
  );

  function savePrice(product: string, price: string, description: string) {
    return run(`price:${product}`, async () => {
      const data = await api<{ products: ProductRow[] }>("products", "PUT", {
        product,
        price: price.trim() === "" ? null : Number(price),
        description: description.trim() || null,
      });
      setProducts(data.products);
      onMessage(price.trim() === "" ? `${product} 판매를 중지했어요` : `${product} 저장 · 구매 화면에 반영됐어요`);
    });
  }

  function submitSingle(e: React.FormEvent) {
    e.preventDefault();
    void run("add", async () => {
      const data = await api<{ nickname: string; warning?: string | null }>("accounts", "POST", form);
      onMessage(data.warning ? `${data.nickname} 등록 · ${data.warning}` : `${data.nickname} 재고에 등록했어요`);
      setForm({ ...EMPTY_FORM, product: form.product });
      await Promise.all([loadMeta(), loadAccounts()]);
    });
  }

  function submitBulk() {
    void run("bulk", async () => {
      const data = await api<{ inserted: number; errors: { line: number; error: string }[] }>("accounts/bulk", "POST", {
        text: bulkText,
        product: bulkProduct,
      });
      setBulkErrors(data.errors);
      onMessage(`${data.inserted}개 등록${data.errors.length ? ` · ${data.errors.length}줄 오류` : ""}`);
      if (!data.errors.length) setBulkText("");
      await Promise.all([loadMeta(), loadAccounts()]);
    });
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    void run("edit", async () => {
      const data = await api<{ warning?: string | null }>(`accounts/${editing.id}`, "PUT", editing.form);
      onMessage(data.warning ? `저장 · ${data.warning}` : "저장했어요");
      setEditing(null);
      await Promise.all([loadMeta(), loadAccounts()]);
    });
  }

  function accountAction(a: Account, action: "delete" | "release" | "reissue") {
    const text = {
      delete: `${a.nickname} 계정을 삭제할까요? 발급된 코드도 함께 사라져요.`,
      release: `${a.nickname} 계정을 재고로 되돌릴까요? 구매자의 코드는 무효가 돼요.`,
      reissue: `${a.nickname} 구매자에게 새 코드를 DM으로 다시 보낼까요?`,
    }[action];
    if (!window.confirm(text)) return;
    void run(`${action}:${a.id}`, async () => {
      if (action === "delete") await api(`accounts/${a.id}`, "DELETE");
      else await api(`accounts/${a.id}/${action}`, "POST", {});
      onMessage({ delete: "삭제했어요", release: "재고로 되돌렸어요", reissue: "코드를 다시 보냈어요" }[action]);
      await Promise.all([loadMeta(), loadAccounts()]);
    });
  }

  const statCards: [string, number | undefined][] = [
    ["현재 재고", stats?.available],
    ["판매 완료", stats?.sold],
    ["유효 코드", stats?.codes],
    ["구매자 열람", stats?.redeemed],
  ];

  return (
    <div className="space-y-5 px-1">
      <datalist id="mfa-inventory-products">
        {productOptions.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(([label, value]) => (
          <section key={label} className="admin-bento p-5">
            <p className="text-xs font-medium" style={{ color: "var(--ad-muted)" }}>
              {label}
            </p>
            <p className="mt-2 text-2xl font-extrabold tracking-tight">{value ?? "–"}</p>
          </section>
        ))}
      </div>

      {/* 상품 · 가격 */}
      <section className="admin-bento p-5 sm:p-6">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-[17px] font-extrabold tracking-tight">상품 · 가격</h3>
          <button type="button" className="admin-icon-btn" onClick={() => void reload()} title="새로고침">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="mb-4 text-xs" style={{ color: "var(--ad-muted)" }}>
          가격을 정한 상품 종류만 구매 화면에 올라가요. 가격을 비우고 저장하면 판매가 중지됩니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--ad-muted)" }}>
                <th className="pb-2 font-medium">상품 종류</th>
                <th className="pb-2 font-medium">재고</th>
                <th className="pb-2 font-medium">가격 (포인트)</th>
                <th className="pb-2 font-medium">설명</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const draft = priceDraft[p.product] ?? { price: "", description: "" };
                return (
                  <tr key={p.product} className="border-t border-white/10">
                    <td className="py-2.5 pr-3">
                      <span className="font-semibold">{p.product}</span>
                      {!p.price ? (
                        <span className="ml-2 text-[11px]" style={{ color: "var(--ad-subtle)" }}>
                          미판매
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3">{p.available}개</td>
                    <td className="py-2.5 pr-3">
                      <input
                        className={`${field} max-w-[140px]`}
                        type="number"
                        min={1}
                        placeholder="미판매"
                        value={draft.price}
                        onChange={(e) =>
                          setPriceDraft({ ...priceDraft, [p.product]: { ...draft, price: e.target.value } })
                        }
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        className={field}
                        maxLength={300}
                        placeholder="구매 화면 설명 (선택)"
                        value={draft.description}
                        onChange={(e) =>
                          setPriceDraft({ ...priceDraft, [p.product]: { ...draft, description: e.target.value } })
                        }
                      />
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        className="admin-btn inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                        disabled={busy === `price:${p.product}`}
                        onClick={() => void savePrice(p.product, draft.price, draft.description)}
                      >
                        {busy === `price:${p.product}` ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        저장
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!products.length ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs" style={{ color: "var(--ad-muted)" }}>
                    아직 상품 종류가 없어요. 계정을 등록하거나 아래에서 추가하세요.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newProduct.product.trim()) return;
            void savePrice(newProduct.product.trim(), newProduct.price, "").then(() =>
              setNewProduct({ product: "", price: "" }),
            );
          }}
        >
          <input
            className={field}
            list="mfa-inventory-products"
            maxLength={40}
            placeholder="새 상품 종류 (예: Full Access)"
            value={newProduct.product}
            onChange={(e) => setNewProduct({ ...newProduct, product: e.target.value })}
            required
          />
          <input
            className={`${field} sm:max-w-[160px]`}
            type="number"
            min={1}
            placeholder="가격"
            value={newProduct.price}
            onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
            required
          />
          <button type="submit" className="admin-btn shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold">
            상품 추가
          </button>
        </form>
      </section>

      {/* 계정 등록 */}
      <section className="admin-bento p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[17px] font-extrabold tracking-tight">계정 등록</h3>
          <div className="admin-seg w-[180px]">
            <button type="button" className={mode === "single" ? "is-on" : ""} onClick={() => setMode("single")}>
              단일
            </button>
            <button type="button" className={mode === "bulk" ? "is-on" : ""} onClick={() => setMode("bulk")}>
              대량
            </button>
          </div>
        </div>

        {mode === "single" ? (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitSingle} autoComplete="off">
            <AccountFields form={form} onChange={setForm} />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm"
                onClick={() => setForm({ ...EMPTY_FORM, product: form.product })}
              >
                초기화
              </button>
              <button
                type="submit"
                disabled={busy === "add"}
                className="admin-btn inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : null}
                재고에 등록
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed" style={{ color: "var(--ad-muted)" }}>
              한 줄에 하나씩 <code>닉네임 | 이메일 | 비밀번호 | 복구이메일 | 복구코드 | 메모</code> 형식으로 입력하세요.
              구분자는 <code>|</code>, 탭(엑셀 붙여넣기), <code>:</code> 모두 되고 뒤의 3개는 생략할 수 있어요. 한 번에 최대 300줄.
            </p>
            <input
              className={`${field} max-w-[280px]`}
              list="mfa-inventory-products"
              maxLength={40}
              placeholder="상품 종류 (전체 적용)"
              value={bulkProduct}
              onChange={(e) => setBulkProduct(e.target.value)}
            />
            <textarea
              className={`${field} min-h-[200px] font-mono text-xs`}
              placeholder="Steve123 | steve@outlook.com | Pass!word1 | rec@outlook.com | ABCDE-FGHIJ"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--ad-muted)" }}>
                {bulkText.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).length}줄
              </span>
              <button
                type="button"
                disabled={busy === "bulk" || !bulkText.trim()}
                onClick={submitBulk}
                className="admin-btn inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy === "bulk" ? <Loader2 className="size-4 animate-spin" /> : null}
                대량 등록
              </button>
            </div>
            {bulkErrors.length ? (
              <ul className="space-y-1 text-xs text-red-400">
                {bulkErrors.map((e) => (
                  <li key={e.line}>
                    {e.line}번째 줄: {e.error}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      {/* 재고 관리 */}
      <section className="admin-bento p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="mr-auto text-[17px] font-extrabold tracking-tight">재고 관리</h3>
          <div className="admin-seg w-[240px]">
            {(
              [
                ["", "전체"],
                ["available", "재고"],
                ["sold", "판매 완료"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" className={status === value ? "is-on" : ""} onClick={() => setStatus(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              className="admin-search"
              placeholder="닉네임 · 이메일 · 디스코드 ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--ad-muted)" }}>
                <th className="pb-2 font-medium">계정</th>
                <th className="pb-2 font-medium">이메일</th>
                <th className="pb-2 font-medium">상태</th>
                <th className="pb-2 font-medium">구매자</th>
                <th className="pb-2 font-medium">열람</th>
                <th className="pb-2 font-medium">등록</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-white/10">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://mc-heads.net/avatar/${encodeURIComponent(a.uuid ?? a.nickname)}/64`}
                        alt=""
                        className="size-8 rounded-lg"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.nickname}</p>
                        <p className="text-[11px]" style={{ color: "var(--ad-subtle)" }}>
                          #{a.id} · {a.product || "상품 미지정"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[200px] truncate py-2.5 pr-3">{a.email}</td>
                  <td className="py-2.5 pr-3">
                    {a.status === "available" ? (
                      <span className="rounded-full border border-emerald-500/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                        재고
                      </span>
                    ) : (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black">판매 완료</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs">{a.discord_user_id || "-"}</td>
                  <td className="py-2.5 pr-3">{a.view_count ? `${a.view_count}회` : "-"}</td>
                  <td className="py-2.5 pr-3 text-xs" style={{ color: "var(--ad-muted)" }}>
                    {formatDate(a.created_at)}
                  </td>
                  <td className="py-2.5">
                    <div className="flex justify-end gap-1">
                      <button type="button" className="admin-icon-btn" title="수정" onClick={() => setEditing({ id: a.id, form: toForm(a) })}>
                        <Pencil className="size-4" />
                      </button>
                      {a.status === "sold" ? (
                        <>
                          <button type="button" className="admin-icon-btn" title="코드 재발송" onClick={() => accountAction(a, "reissue")}>
                            <Send className="size-4" />
                          </button>
                          <button type="button" className="admin-icon-btn" title="재고로 되돌리기" onClick={() => accountAction(a, "release")}>
                            <RotateCcw className="size-4" />
                          </button>
                        </>
                      ) : null}
                      <button type="button" className="admin-icon-btn" title="삭제" onClick={() => accountAction(a, "delete")}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!accounts.length && !loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs" style={{ color: "var(--ad-muted)" }}>
                    계정이 없어요. 위에서 새 계정을 등록하면 여기에 표시됩니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {editing && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <form
            className="admin-bento grid w-full max-w-2xl gap-3 p-6 sm:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
          >
            <div className="flex items-center justify-between sm:col-span-2">
              <h3 className="text-[17px] font-extrabold tracking-tight">계정 수정 #{editing.id}</h3>
              <button type="button" className="admin-icon-btn" onClick={() => setEditing(null)}>
                <X className="size-4" />
              </button>
            </div>
            <AccountFields form={editing.form} onChange={(f) => setEditing({ ...editing, form: f })} />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm" onClick={() => setEditing(null)}>
                취소
              </button>
              <button
                type="submit"
                disabled={busy === "edit"}
                className="admin-btn inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {busy === "edit" ? <Loader2 className="size-4 animate-spin" /> : null}
                저장
              </button>
            </div>
          </form>
        </div>,
        // 애니메이션(transform) 안에 있으면 fixed 창이 화면 밖에 그려져서, 관리자 화면 최상단에 붙인다
        document.querySelector(".admin-shell") ?? document.body,
      ) : null}
    </div>
  );
}

function AccountFields({ form, onChange }: { form: AccountForm; onChange: (f: AccountForm) => void }) {
  const set = (k: keyof AccountForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [k]: e.target.value });
  return (
    <>
      <Labeled label="마인크래프트 닉네임">
        <input className={field} maxLength={16} placeholder="Notch" value={form.nickname} onChange={set("nickname")} required />
      </Labeled>
      <Labeled label="상품 종류">
        <input className={field} list="mfa-inventory-products" maxLength={40} value={form.product} onChange={set("product")} />
      </Labeled>
      <Labeled label="이메일">
        <input className={field} placeholder="account@outlook.com" value={form.email} onChange={set("email")} required />
      </Labeled>
      <Labeled label="비밀번호">
        <input className={`${field} font-mono`} value={form.password} onChange={set("password")} required />
      </Labeled>
      <Labeled label="복구 이메일 (선택)">
        <input className={field} value={form.recoveryEmail} onChange={set("recoveryEmail")} />
      </Labeled>
      <Labeled label="복구 코드 (선택)">
        <input className={`${field} font-mono`} value={form.recoveryCode} onChange={set("recoveryCode")} />
      </Labeled>
      <div className="sm:col-span-2">
        <Labeled label="판매자 메모 (선택 · 구매자에게 표시)">
          <textarea
            className={`${field} min-h-[80px]`}
            placeholder="구매 후 24시간 안에 비밀번호/보안 정보를 변경해 주세요."
            value={form.memo}
            onChange={set("memo")}
          />
        </Labeled>
      </div>
    </>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--ad-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
