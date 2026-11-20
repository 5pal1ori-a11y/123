"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Loader2, ShieldAlert, Search } from "lucide-react";

type PassportData = {
  no: string;
  issuedAt: string;
  checkedAt: string;
  productId: string;
  productSlug: string;
  productName: string;
  price: number;
  name: string;
  uuidShort: string | null;
  capes: { type: string; title: string }[];
  hypixel: { rank: string | null; level: number; bedwarsStars: number; firstLogin: string | null; lastLogin: string | null } | null;
  nameChange: { lastChangedAt: string | null } | null;
  doesSeen: { since: string | null; names: string[] };
  bans: { hypixel: boolean | null; donut: boolean | null };
  checklock: { status: "ok" | "warning" | "stopped" | "unknown"; issue: string | null };
  warranty: { state: "on_sale" | "active" | "expired" | "none"; until: string | null; daysLeft: number | null };
};

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("ko-KR") : "기록 없음");
const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };

/** 번호 입력 화면 (/passport) */
export function PassportSearch() {
  const router = useRouter();
  const [v, setV] = useState("");
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-5 px-4 py-12 text-center">
      <BadgeCheck className="size-12 text-amber-400" />
      <h1 className="text-2xl font-bold" style={text}>계정 여권 진위 확인</h1>
      <p className="text-sm" style={muted}>여권에 적힌 번호(DP-XXXX-XXXX)를 넣거나 QR을 찍어 주세요.</p>
      <form
        className="flex w-full gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) router.push(`/passport/${encodeURIComponent(v.trim())}`);
        }}
      >
        <input
          value={v}
          onChange={(e) => setV(e.target.value.toUpperCase())}
          placeholder="DP-XXXX-XXXX"
          className="flex-1 rounded-2xl border bg-transparent px-4 py-3 font-mono text-sm outline-none focus:border-amber-400/60"
          style={{ borderColor: "var(--ad-border, #222)", ...text }}
        />
        <button className="flex items-center gap-1.5 rounded-2xl bg-amber-500 px-5 font-semibold text-white">
          <Search className="size-4" /> 확인
        </button>
      </form>
    </div>
  );
}

/** 여권 보기 (/passport/[no]) */
export function PassportView({ no }: { no: string }) {
  const [state, setState] = useState<{ loading: boolean; genuine?: boolean; data?: PassportData; image?: string | null; error?: string }>({ loading: true });

  useEffect(() => {
    fetch(`/api/passport/${encodeURIComponent(no)}`)
      .then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }))
      .then(({ j }) => setState({ loading: false, genuine: j.genuine, data: j.data, image: j.image, error: j.error }))
      .catch(() => setState({ loading: false, error: "확인하지 못했어요." }));
  }, [no]);

  if (state.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2" style={muted}>
        <Loader2 className="size-4 animate-spin" /> 여권 확인 중…
      </div>
    );
  }

  if (!state.genuine || !state.data) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert className="size-12 text-rose-500" />
        <h1 className="text-xl font-bold" style={text}>확인되지 않은 여권이에요</h1>
        <p className="text-sm" style={muted}>{state.error ?? "DOES에서 발급한 여권이 아니거나 번호가 잘못됐어요."}</p>
        <Link href="/passport" className="mt-2 rounded-xl bg-white/10 px-4 py-2 text-sm" style={text}>다른 번호 확인</Link>
      </div>
    );
  }

  const d = state.data;
  const ban = (v: boolean | null) => (v === true ? <span className="text-rose-500">밴 기록 있음</span> : v === false ? <span className="text-emerald-500">정상</span> : <span style={muted}>미점검</span>);
  const lock = { ok: ["정상", "text-emerald-500"], warning: ["주의 필요", "text-amber-500"], stopped: ["판매 중지됨", "text-rose-500"], unknown: ["점검 대기", ""] }[d.checklock.status];
  const warranty =
    d.warranty.state === "on_sale" ? "구매 후 30일 보증" : d.warranty.state === "active" ? `보증 중 · ${d.warranty.daysLeft}일 남음 (${date(d.warranty.until)}까지)` : d.warranty.state === "expired" ? "보증 기간 끝남" : "보증 없음";
  const rows: [string, React.ReactNode][] = [
    ["여권 번호", <span key="n" className="font-mono">{d.no}</span>],
    ["닉네임", d.name],
    ["UUID", d.uuidShort ? `${d.uuidShort}…` : "확인 불가"],
    ["하이픽셀", d.hypixel ? `${d.hypixel.rank ?? "일반"} · Lv.${Math.floor(d.hypixel.level)} · 베드워즈 ${d.hypixel.bedwarsStars}성` : "기록 없음"],
    ["하이픽셀 첫 접속 (계정 나이)", date(d.hypixel?.firstLogin)],
    ["닉네임 마지막 변경", date(d.nameChange?.lastChangedAt)],
    ["DOES 등록 이후 닉 기록", d.doesSeen.names.length ? d.doesSeen.names.join(" → ") : "변경 없음"],
    ["보유 망토", d.capes.length ? d.capes.map((c) => c.title).join(", ") : "없음"],
    ["하이픽셀 밴 점검", ban(d.bans.hypixel)],
    ["도넛 밴 점검", ban(d.bans.donut)],
    ["자동 점검 (체크락)", <span key="l" className={lock[1]}>{lock[0]}{d.checklock.issue ? ` · ${d.checklock.issue}` : ""}</span>],
    ["보증 상태", warranty],
    ["발급 · 최근 확인", `${date(d.issuedAt)} · ${new Date(d.checkedAt).toLocaleString("ko-KR")}`],
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <div className="glass flex items-center gap-3 p-4">
        <BadgeCheck className="size-9 shrink-0 text-emerald-500" />
        <div>
          <p className="text-base font-bold text-emerald-500">정품 DOES 계정 여권이에요</p>
          <p className="text-xs" style={muted}>서버 서명으로 확인했고, 아래 정보는 지금 공개 정보로 다시 조회한 결과예요.</p>
        </div>
      </div>
      {state.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.image} alt={`계정 여권 ${d.no}`} className="w-full rounded-2xl border" style={{ borderColor: "var(--ad-border, #222)" }} />
      ) : null}
      <div className="glass divide-y overflow-hidden" style={{ borderColor: "var(--ad-border, #222)" }}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 px-4 py-3 text-sm" style={{ borderColor: "var(--ad-border, #222)" }}>
            <span style={muted}>{k}</span>
            <span className="text-right font-medium" style={text}>{v}</span>
          </div>
        ))}
      </div>
      <p className="text-center text-[11px]" style={muted}>
        로그인 없이 확인할 수 있는 공개 정보와 DOES 점검 기록만 담아요. 계정 비밀번호 · 이메일은 담지 않아요.
      </p>
      <div className="flex justify-center">
        <Link href={`/product/${d.productSlug || d.productId}`} className="rounded-xl bg-white/10 px-4 py-2 text-sm" style={text}>상품 보러 가기</Link>
      </div>
    </div>
  );
}
