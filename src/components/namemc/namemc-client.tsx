"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, Download, Eye, History, Loader2, Search, ShieldQuestion, Sparkles } from "lucide-react";

type Found = {
  found: true;
  uuid: string;
  name: string;
  skinUrl: string | null;
  slim: boolean;
  renderUrl: string;
  headUrl: string;
  capes: { title: string; url: string; source: "minecraft" | "optifine" }[];
  hypixel: { rank: string | null; rankColor: string; level: number; bedwarsStars: number; lastLogin: string | null } | null;
  history: { names: { name: string; firstSeen: string; lastSeen: string }[]; skins: { hash: string; url: string; slim: boolean; firstSeen: string }[]; views: number };
};
type Missing = { found: false; name: string; available: boolean };

const muted = { color: "var(--ad-muted, #94a3b8)" };
const text = { color: "var(--ad-text, #fff)" };
const day = (iso: string) => new Date(iso).toLocaleDateString("ko-KR");
const dashed = (u: string) => `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;

function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) router.push(`/mc/${encodeURIComponent(v.trim())}`);
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="닉네임 또는 UUID"
        maxLength={36}
        className="min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none"
        style={{ borderColor: "var(--ad-border, rgba(127,127,127,0.3))", background: "var(--mf-surface-2, rgba(127,127,127,0.06))", ...text }}
      />
      <button className="flex items-center gap-1 rounded-2xl bg-emerald-500 px-5 text-sm font-bold text-white">
        <Search className="size-4" /> 조회
      </button>
    </form>
  );
}

export function NameMcHome() {
  const [pop, setPop] = useState<{ popular: { uuid: string; name: string; views: number }[]; recent: { uuid: string; name: string }[] } | null>(null);
  useEffect(() => {
    fetch("/api/namemc?popular=1")
      .then((r) => r.json())
      .then(setPop)
      .catch(() => null);
  }, []);
  const Chip = ({ uuid, name, sub }: { uuid: string; name: string; sub?: string }) => (
    <Link href={`/mc/${name}`} className="glass flex items-center gap-2 p-2 pr-3 text-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://mc-heads.net/avatar/${uuid}/32`} alt="" width={28} height={28} className="rounded-md" />
      <span className="font-semibold" style={text}>{name}</span>
      {sub ? <span className="text-xs" style={muted}>{sub}</span> : null}
    </Link>
  );
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <div className="text-center">
        <p className="text-xs font-bold tracking-[0.3em] text-emerald-500">DOES PLAYER SEARCH</p>
        <h1 className="mt-1 text-3xl font-black" style={text}>마크 닉네임 조회</h1>
        <p className="mt-1 text-sm" style={muted}>닉네임 · UUID로 스킨, 망토, 닉네임 이력, 하이픽셀 정보를 한 번에</p>
      </div>
      <SearchBox />
      {pop?.popular.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold" style={muted}>🔥 인기 검색</p>
          <div className="flex flex-wrap gap-2">{pop.popular.map((p) => <Chip key={p.uuid} uuid={p.uuid} name={p.name} sub={`${p.views}회`} />)}</div>
        </div>
      ) : null}
      {pop?.recent.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold" style={muted}>🕘 최근 검색</p>
          <div className="flex flex-wrap gap-2">{pop.recent.map((p) => <Chip key={p.uuid} uuid={p.uuid} name={p.name} />)}</div>
        </div>
      ) : null}
    </div>
  );
}

export function NameMcProfile({ q }: { q: string }) {
  const [d, setD] = useState<Found | Missing | { error: string } | null>(null);
  useEffect(() => {
    setD(null);
    fetch(`/api/namemc?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ error: "조회하지 못했어요. 잠시 뒤에 다시 시도해 주세요." }));
  }, [q]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <SearchBox initial={q} />
      {!d ? (
        <div className="flex justify-center gap-2 py-16 text-sm" style={muted}><Loader2 className="size-4 animate-spin" /> 모장 서버에서 찾는 중…</div>
      ) : "error" in d ? (
        <div className="glass p-6 text-center text-sm text-rose-500">{d.error}</div>
      ) : !d.found ? (
        <div className="glass flex flex-col items-center gap-2 p-8 text-center">
          <ShieldQuestion className="size-10 text-amber-500" />
          <p className="text-lg font-bold" style={text}>&lsquo;{d.name}&rsquo; 계정을 찾지 못했어요</p>
          <p className="text-sm" style={muted}>{d.available ? "지금 아무도 쓰지 않는 닉네임일 수 있어요. 닉네임 변경 대기 기간(37일)에 걸려 있을 수도 있어요." : "닉네임이나 UUID를 다시 확인해 주세요."}</p>
        </div>
      ) : (
        <>
          <div className="glass grid gap-5 p-5 sm:grid-cols-[220px_1fr]">
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.renderUrl} alt={`${d.name} 스킨`} className="h-56 w-auto object-contain" />
              {d.skinUrl ? (
                <a href={d.skinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-500" style={{ background: "rgba(16,185,129,0.12)" }}>
                  <Download className="size-3" /> 스킨 원본 {d.slim ? "(슬림)" : "(클래식)"}
                </a>
              ) : <span className="text-xs" style={muted}>기본 스킨</span>}
            </div>
            <div className="min-w-0 space-y-3">
              <div>
                <h1 className="text-3xl font-black" style={text}>{d.name}</h1>
                <button onClick={() => navigator.clipboard?.writeText(dashed(d.uuid))} className="mt-1 flex max-w-full items-center gap-1 truncate font-mono text-xs" style={muted}>
                  {dashed(d.uuid)} <Copy className="size-3 shrink-0" />
                </button>
                <p className="mt-1 flex items-center gap-1 text-xs" style={muted}><Eye className="size-3" /> DOES 조회 {d.history.views.toLocaleString("ko-KR")}회</p>
              </div>
              {d.hypixel ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg px-2.5 py-1 font-black" style={{ background: "rgba(127,127,127,0.12)", color: d.hypixel.rankColor }}>{d.hypixel.rank ?? "일반"}</span>
                  <span className="rounded-lg px-2.5 py-1 font-semibold" style={{ background: "rgba(127,127,127,0.12)", ...text }}>하이픽셀 Lv.{Math.floor(d.hypixel.level)}</span>
                  <span className="rounded-lg px-2.5 py-1 font-semibold" style={{ background: "rgba(127,127,127,0.12)", ...text }}>배드워즈 {d.hypixel.bedwarsStars}★</span>
                  {d.hypixel.lastLogin ? <span className="rounded-lg px-2.5 py-1" style={{ background: "rgba(127,127,127,0.12)", ...muted }}>마지막 접속 {day(d.hypixel.lastLogin)}</span> : null}
                </div>
              ) : null}
              <div>
                <p className="mb-1.5 text-xs font-semibold" style={muted}>망토 {d.capes.length}개</p>
                {d.capes.length ? (
                  <div className="flex flex-wrap gap-2">
                    {d.capes.map((c) => (
                      <div key={c.title} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ background: "rgba(127,127,127,0.1)" }}>
                        {c.url ? <span className="block h-8 w-5 overflow-hidden rounded-sm" style={{ backgroundImage: `url(${c.url})`, backgroundSize: "640% 200%", backgroundPosition: "1.85% 6.25%", imageRendering: "pixelated" }} /> : <span className="flex h-8 w-5 items-center justify-center rounded-sm text-[9px] font-black text-white" style={{ background: c.source === "optifine" ? "#7c3aed" : "#475569" }}>{c.source === "optifine" ? "OF" : "?"}</span>}
                        <span className="text-xs font-semibold" style={text}>{c.title}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs" style={muted}>보유한 망토가 없어요</p>}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/dashboard?tab=dosmarket&sub=buyback&ign=${encodeURIComponent(d.name)}`} className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white"><Sparkles className="size-3.5" /> 이 계정 시세 감정받기</Link>
                <Link href="/dashboard?tab=products" className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "rgba(127,127,127,0.12)", ...text }}>비슷한 계정 사기</Link>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="glass p-4">
              <p className="mb-2 flex items-center gap-1 text-sm font-bold" style={text}><History className="size-4" /> 닉네임 이력</p>
              <ul className="space-y-1.5 text-sm">
                {d.history.names.map((n, i) => (
                  <li key={n.name} className="flex justify-between gap-2">
                    <Link href={`/mc/${n.name}`} className="font-semibold" style={i === 0 ? { color: "#10b981" } : text}>{n.name}</Link>
                    <span className="text-xs" style={muted}>{day(n.firstSeen)}{i === 0 ? " ~ 현재" : ` ~ ${day(n.lastSeen)}`}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px]" style={muted}>모장이 이력 조회를 막아서, DOES가 조회할 때마다 본 닉네임을 기록해요.</p>
            </div>
            <div className="glass p-4">
              <p className="mb-2 text-sm font-bold" style={text}>스킨 이력 {d.history.skins.length}개</p>
              <div className="flex flex-wrap gap-2">
                {d.history.skins.map((s) => (
                  <a key={s.hash} href={s.url} target="_blank" rel="noreferrer" title={day(s.firstSeen)} className="block size-12 overflow-hidden rounded-lg" style={{ background: "rgba(127,127,127,0.12)" }}>
                    <span className="block size-full" style={{ backgroundImage: `url(${s.url})`, backgroundSize: "800% 800%", backgroundPosition: "14.3% 14.3%", imageRendering: "pixelated" }} />
                  </a>
                ))}
                {!d.history.skins.length ? <p className="text-xs" style={muted}>기록된 스킨이 없어요</p> : null}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
