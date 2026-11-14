"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, User, X } from "lucide-react";
import { CAPES, type CapeEntry } from "@/lib/capes-data";
import { CapeViewer, type SkinInfo, type ViewMode } from "./cape-viewer";
import { capeFace } from "./cape-face";

const STORE_KEY = "does-cape-skin";

type SavedSkin = SkinInfo & { name: string };

/** 카드: 커서를 올리면 커서 위치에 따라 망토가 돌아간다 */
function CapeCard({ cape, onOpen }: { cape: CapeEntry; onOpen: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [rot, setRot] = useState(-18);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    void capeFace(cape.hash).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [cape.hash]);

  function onMove(e: React.PointerEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / r.width; // 0~1
    setRot((x - 0.5) * 360);
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        setRot(-18);
      }}
      onPointerMove={onMove}
      className="group flex flex-col overflow-hidden rounded-3xl border border-black/5 bg-white text-left shadow-sm transition hover:shadow-xl"
    >
      <div
        className="relative flex h-[260px] items-center justify-center overflow-hidden"
        style={{ background: "radial-gradient(circle at 30% 20%, #fbbf6a 0%, #3b6b4a 45%, #14261c 100%)", perspective: 700 }}
      >
        <div
          style={{
            position: "relative",
            width: 112,
            height: 180,
            transformStyle: "preserve-3d",
            transform: `rotateY(${rot}deg) rotateX(${hover ? 4 : 8}deg)`,
            transition: hover ? "transform 0.12s ease-out" : "transform 0.5s ease",
            filter: "drop-shadow(0 14px 18px rgba(0,0,0,0.45))",
          }}
        >
          {src ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={cape.title}
                draggable={false}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated", backfaceVisibility: "hidden" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  imageRendering: "pixelated",
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  filter: "brightness(0.55)",
                }}
              />
            </>
          ) : null}
        </div>
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
          커서로 돌려보기
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="truncate text-[19px] font-extrabold tracking-tight text-neutral-900">{cape.title}</p>
          <p className="mt-0.5 text-[13px] text-neutral-500">클릭하면 Player · Elytra 로 볼 수 있어요</p>
        </div>
        <span className="shrink-0 text-sm font-bold text-emerald-600">3D 보기 →</span>
      </div>
    </button>
  );
}

const MODES: { id: ViewMode; label: string }[] = [
  { id: "cape", label: "Cape" },
  { id: "player", label: "Player" },
  { id: "elytra", label: "Elytra" },
];

export function CapeGallery() {
  const [skin, setSkin] = useState<SavedSkin | null>(null);
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<CapeEntry | null>(null);
  const [mode, setMode] = useState<ViewMode>("player");
  const [q, setQ] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SavedSkin;
        if (s?.hash) {
          setSkin(s);
          setNick(s.name);
        }
      }
    } catch {
      /* 저장소 막힘 */
    }
  }, []);

  async function applyNick(e: React.FormEvent) {
    e.preventDefault();
    const name = nick.trim();
    if (!name) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/capes/skin?name=${encodeURIComponent(name)}`);
      const data = (await res.json().catch(() => ({}))) as { name?: string; skinHash?: string; slim?: boolean; error?: string };
      if (!res.ok || !data.skinHash) throw new Error(data.error || "찾지 못했어요");
      const saved: SavedSkin = { name: data.name ?? name, hash: data.skinHash, slim: Boolean(data.slim) };
      setSkin(saved);
      setNick(saved.name);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(saved));
      } catch {
        /* 무시 */
      }
      setMsg(`${saved.name} 스킨으로 모든 망토를 입혀 볼 수 있어요`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setBusy(false);
    }
  }

  function clearSkin() {
    setSkin(null);
    setNick("");
    setMsg(null);
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* 무시 */
    }
  }

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? CAPES.filter((c) => c.title.toLowerCase().includes(s) || c.type.toLowerCase().includes(s)) : CAPES;
  }, [q]);

  return (
    <div className="mf-dark space-y-6">
      <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
        <h1 className="text-[26px] font-extrabold tracking-tight text-neutral-900">망토 갤러리</h1>
        <p className="mt-1 text-[15px] text-neutral-500">
          카드에 커서를 올리면 망토가 돌아가요. 닉네임을 넣으면 내 스킨에 모든 망토를 입혀서 볼 수 있어요.
        </p>
        <form onSubmit={applyNick} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="마인크래프트 닉네임"
              maxLength={16}
              className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-3 text-[15px] text-neutral-900 outline-none focus:border-neutral-400"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !nick.trim()}
            className="h-12 rounded-xl bg-neutral-900 px-6 text-[15px] font-bold text-white disabled:opacity-40"
          >
            {busy ? "찾는 중…" : "내 스킨 적용"}
          </button>
          {skin ? (
            <button type="button" onClick={clearSkin} className="h-12 rounded-xl border border-neutral-200 px-5 text-[15px] font-semibold text-neutral-600">
              해제
            </button>
          ) : null}
        </form>
        {msg ? <p className="mt-2 text-[13px] text-neutral-500">{msg}</p> : null}
        {skin ? <p className="mt-1 text-[13px] font-semibold text-emerald-600">적용 중: {skin.name} (브라우저에 저장돼요)</p> : null}
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="망토 이름 검색 (예: Aurora)"
            className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-3 text-[14px] text-neutral-900 outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => (
          <CapeCard key={c.type} cape={c} onOpen={() => setOpen(c)} />
        ))}
      </div>
      {list.length === 0 ? <p className="py-16 text-center text-neutral-500">검색 결과가 없어요</p> : null}

      {open ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(null)}>
          <div className="w-full max-w-[560px] overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-[20px] font-extrabold text-neutral-900">{open.title}</h2>
              <button type="button" onClick={() => setOpen(null)} className="grid size-9 place-items-center rounded-full hover:bg-neutral-100" aria-label="닫기">
                <X className="size-5 text-neutral-600" />
              </button>
            </div>
            <div className="mx-5 mt-3 flex gap-1 rounded-xl bg-neutral-100 p-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  style={mode === m.id ? { background: "#ffffff", color: "#111111" } : { color: "#737373" }}
                  className={`flex-1 rounded-lg py-2 text-[14px] font-bold transition ${mode === m.id ? "shadow" : ""}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ background: "radial-gradient(circle at 50% 25%, #4d7c5a 0%, #1b3325 60%, #0f1c15 100%)" }} className="mt-3">
              <CapeViewer capeHash={open.hash} mode={mode} skin={skin} className="h-[420px] w-full cursor-grab" />
            </div>
            <p className="px-5 py-3 text-[13px] text-neutral-500">
              드래그해서 돌려 보세요. {skin ? `${skin.name} 스킨으로 보는 중` : "닉네임을 넣으면 내 스킨으로 볼 수 있어요"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
