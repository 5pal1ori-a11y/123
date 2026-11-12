"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shopHeaders } from "@/lib/shop-client";
import { useShopUser } from "@/components/shop/user-context";
import { heartUrl, spriteUrl } from "@/components/world/pixel-art";
import { item, itemName, maxDurability, maxStack, stackable, type Stack } from "@/lib/voxel/items";
import { craft, CRAFT_REMAINDER, matches, needsTable, RECIPES, recipeGrid, SMELTING, type Recipe } from "@/lib/voxel/recipes";
import { enchantCosts, enchName, isEnchantable, rollEnchants } from "@/lib/voxel/enchant";
import { mineOfDay } from "@/lib/voxel/mine";
import type { OreKey } from "@/lib/voxel/blocks";
import { itemIcon } from "./atlas";
import type { Furnace, GuiOpen, HudState, Mode, VoxelEngine, WildMulti } from "./engine";
import { sfx } from "./sound";
import { WildNet, type WildStatus, type WildWelcome } from "./wild-net";

type EngineModule = typeof import("./engine");

type MineStatus = {
  day: string;
  ore: OreKey;
  oreName: string;
  need: number;
  seed: number;
  tokens: number;
  best: number | null;
  top: { n: string; ms: number }[];
  yesterday: { n: string; ms: number } | null;
  signedIn: boolean;
};

type MineResult = { ms: number; best: number; rank: number | null; top: { n: string; ms: number }[] } | { error: string } | { guest: true; ms: number };

type SlotRef = {
  get: () => Stack | null;
  set: (s: Stack | null) => void;
  accept?: (s: Stack) => boolean;
  area: "hot" | "main" | "armor" | "grid" | "chest" | "fin" | "ffuel" | "fout" | "off" | "ench" | "lapis";
};

/** 마우스를 올린 칸의 아이템 → 마인크래프트 툴팁 */
const TipCtx = createContext<((s: Stack | null) => void) | null>(null);

const fmtMs = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const d = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
};

const FOOD = [
  "................",
  "................",
  "................",
  ".........kkk....",
  "........kbbbk...",
  ".......kbbwbk...",
  "......kbbbbbk...",
  ".....kbbbbbk....",
  "....kkbbbbk.....",
  "...kwkkbbk......",
  "..kwwk.kk.......",
  "..kkwk..........",
  "...kk...........",
  "................",
  "................",
  "................",
];
const ARMOR_ICON = [
  "................",
  "................",
  "................",
  "...kkk...kkk....",
  "..kwwwkkkwwwk...",
  "..kwggggggwwk...",
  "..kkkgggggkkk...",
  "....kgggggk.....",
  "....kgggggk.....",
  "....kgggggk.....",
  "....kgggggk.....",
  "....kkkkkkk.....",
  "................",
  "................",
  "................",
  "................",
];
const BUBBLE = [
  "................",
  "................",
  "................",
  "................",
  ".....kkkk.......",
  "....kbbbbk......",
  "...kbwbbbbk.....",
  "...kbwbbbbk.....",
  "...kbbbbbbk.....",
  "...kbbbbbbk.....",
  "....kbbbbk......",
  ".....kkkk.......",
  "................",
  "................",
  "................",
  "................",
];

function useIcons() {
  return useMemo(
    () => ({
      heart: heartUrl(false),
      heartEmpty: heartUrl(true),
      food: spriteUrl("vx-food", FOOD, { k: "#2a1405", b: "#b5651d", w: "#f2e3c6" }),
      foodEmpty: spriteUrl("vx-food-e", FOOD, { k: "#1a0e05", b: "#3a2a1c", w: "#4a3c30" }),
      armor: spriteUrl("vx-armor", ARMOR_ICON, { k: "#202020", g: "#c9ced6", w: "#ffffff" }),
      armorEmpty: spriteUrl("vx-armor-e", ARMOR_ICON, { k: "#202020", g: "#3c3c3c", w: "#4a4a4a" }),
      bubble: spriteUrl("vx-bubble", BUBBLE, { k: "#123a6a", b: "#5aa0ff", w: "#e0f0ff" }),
    }),
    [],
  );
}

function Icons({ full, empty, value, max = 20, flip, cls }: { full: string; empty: string; value: number; max?: number; flip?: boolean; cls?: string }) {
  const n = max / 2;
  return (
    <div className={`vx-icons ${flip ? "is-flip" : ""} ${cls ?? ""}`}>
      {Array.from({ length: n }, (_, i) => {
        const v = value - i * 2;
        return (
          <span key={i} className="vx-icon">
            <img src={empty} alt="" />
            {v >= 2 ? <img src={full} alt="" /> : v >= 1 ? <img src={full} alt="" className={flip ? "is-half-r" : "is-half"} /> : null}
          </span>
        );
      })}
    </div>
  );
}

function SlotView({
  s,
  onDown,
  selected,
  title,
  big,
  hint,
}: {
  s: Stack | null;
  onDown?: (button: number, shift: boolean) => void;
  selected?: boolean;
  title?: string;
  big?: boolean;
  /** 빈 칸에 흐리게 보이는 자리 표시 아이콘 */
  hint?: string;
}) {
  const setTip = useContext(TipCtx);
  const max = s ? maxDurability(s.id) : 0;
  const dmg = s?.dmg ?? 0;
  const icon = s ? itemIcon(s.id) : null;
  return (
    <div
      className={`vx-slot ${selected ? "is-sel" : ""} ${big ? "is-big" : ""}`}
      title={!s ? title : undefined}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDown?.(e.button, e.shiftKey);
        setTip?.(null);
      }}
      onMouseEnter={() => setTip?.(s)}
      onMouseLeave={() => setTip?.(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!s && hint ? <img className="vx-slot-hint" src={hint} alt="" draggable={false} /> : null}
      {s && icon ? (
        <>
          <img src={icon} alt="" draggable={false} />
          {s.ench ? <i className="vx-glint" style={{ WebkitMaskImage: `url(${icon})`, maskImage: `url(${icon})` }} /> : null}
          {s.count > 1 ? <b>{s.count}</b> : null}
          {max && dmg > 0 ? (
            <i className="vx-dura">
              <i style={{ width: `${Math.max(0, 1 - dmg / max) * 100}%`, background: `hsl(${Math.max(0, 1 - dmg / max) * 120} 90% 45%)` }} />
            </i>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const ATTACK_SPEED: Record<string, number> = { sword: 1.6, pickaxe: 1.2, shovel: 1, axe: 0.9, hoe: 1 };

/** 마인크래프트 아이템 툴팁 (보라 테두리 · 마법 부여는 하늘색 이름) */
function ItemTip({ s, x, y }: { s: Stack; x: number; y: number }) {
  const def = item(s.id);
  const lines: { t: string; c: string }[] = [];
  const name = itemName(s.id);
  const rare = s.id === "golden_apple" || s.id === "enchanting_table";
  lines.push({ t: name, c: s.ench ? "aqua" : rare ? "yellow" : "white" });
  for (const [k, lvl] of Object.entries(s.ench ?? {})) lines.push({ t: enchName(k, lvl), c: "gray" });
  if (def?.tool && def.tool.kind !== "shears") {
    const sharp = s.ench?.sharpness ?? 0;
    const dmg = def.tool.damage + (sharp ? 0.5 * sharp + 0.5 : 0);
    lines.push({ t: "", c: "gray" });
    lines.push({ t: "주로 사용하는 손일 때:", c: "gray" });
    lines.push({ t: ` ${+dmg.toFixed(1)} 공격 피해`, c: "green" });
    const spd = ATTACK_SPEED[def.tool.kind];
    if (spd) lines.push({ t: ` ${spd} 공격 속도`, c: "green" });
  } else if (def?.armor) {
    lines.push({ t: "", c: "gray" });
    lines.push({ t: `${["머리", "몸", "다리", "발"][def.armor.slot]}에 착용 시:`, c: "gray" });
    lines.push({ t: `+${def.armor.defense} 방어`, c: "blue" });
    if (def.armor.toughness) lines.push({ t: `+${def.armor.toughness} 방어 강도`, c: "blue" });
  } else if (def?.food) {
    lines.push({ t: `허기 +${def.food.hunger}`, c: "gray" });
  }
  const max = maxDurability(s.id);
  if (max && s.dmg) lines.push({ t: `내구도: ${max - s.dmg} / ${max}`, c: "white" });
  const left = x + 18 + 260 > window.innerWidth ? x - 18 - 260 : x + 18;
  return (
    <div className="vx-tip" style={{ left, top: Math.max(8, y - 30) }}>
      {lines.map((l, i) => (l.t ? <p key={i} className={`is-${l.c}`}>{l.t}</p> : <p key={i} className="is-gap" />))}
    </div>
  );
}

/** 마법 부여대 룬 (표준 은하 문자 느낌) */
const RUNES = "ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ!¡ᑑ∷ᓭℸ⚍⍊∴⨅";
function runeText(seed: number) {
  let s = seed >>> 0;
  let out = "";
  const glyphs = [...RUNES];
  for (let i = 0; i < 9; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out += glyphs[s % glyphs.length];
    if (i === 3) out += " ";
  }
  return out;
}

/** 인벤토리 왼쪽 검은 칸의 내 캐릭터 (스킨 정면) */
function SkinPreview({ engine }: { engine: VoxelEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const img = engine.skinImage();
    if (!c || !img) return;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 16, 32);
    g.drawImage(img, 8, 8, 8, 8, 4, 0, 8, 8);
    g.drawImage(img, 20, 20, 8, 12, 4, 8, 8, 12);
    g.drawImage(img, 44, 20, 4, 12, 0, 8, 4, 12);
    g.drawImage(img, 4, 20, 4, 12, 4, 20, 4, 12);
    g.save();
    g.scale(-1, 1);
    g.drawImage(img, 44, 20, 4, 12, -16, 8, 4, 12);
    g.drawImage(img, 4, 20, 4, 12, -12, 20, 4, 12);
    g.restore();
    g.drawImage(img, 40, 8, 8, 8, 4, 0, 8, 8);
  }, [engine]);
  return (
    <div className="vx-skin">
      <canvas ref={ref} width={16} height={32} />
    </div>
  );
}

function CraftArrow() {
  return (
    <svg className="vx-arrow" viewBox="0 0 22 15" width="44" height="30" shapeRendering="crispEdges" aria-hidden>
      <polygon points="0,5 14,5 14,0 22,7.5 14,15 14,10 0,10" fill="#8b8b8b" />
    </svg>
  );
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const update = (t: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    let x = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    setKnob({ x, y });
    onMove(x, y);
  };
  return (
    <div
      ref={ref}
      className="vx-joy"
      onTouchStart={(e) => {
        const t = e.changedTouches[0]!;
        id.current = t.identifier;
        update(t);
      }}
      onTouchMove={(e) => {
        for (const t of Array.from(e.changedTouches)) if (t.identifier === id.current) update(t);
      }}
      onTouchEnd={(e) => {
        for (const t of Array.from(e.changedTouches))
          if (t.identifier === id.current) {
            id.current = null;
            setKnob({ x: 0, y: 0 });
            onMove(0, 0);
          }
      }}
    >
      <span style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
    </div>
  );
}

function HoldButton({ label, onChange, cls }: { label: string; onChange: (on: boolean) => void; cls?: string }) {
  return (
    <button
      type="button"
      className={`vx-mbtn ${cls ?? ""}`}
      onTouchStart={(e) => {
        e.preventDefault();
        onChange(true);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        onChange(false);
      }}
      onTouchCancel={() => onChange(false)}
    >
      {label}
    </button>
  );
}

export function VoxelClient({ shopSlug, mode }: { shopSlug: string; mode: Mode }) {
  const router = useRouter();
  const { user } = useShopUser();
  const icons = useIcons();
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);
  const modRef = useRef<EngineModule | null>(null);
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => (t + 1) % 1e9), []);
  const [hud, setHud] = useState<HudState | null>(null);
  const [gui, setGui] = useState<GuiOpen | null>(null);
  const guiRef = useRef(gui);
  guiRef.current = gui;
  const [locked, setLocked] = useState(false);
  const [death, setDeath] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [bookTab, setBookTab] = useState("전체");
  const [heldName, setHeldName] = useState<{ text: string; at: number } | null>(null);
  const [hurtFlash, setHurtFlash] = useState(0);
  const [soundOn, setSoundOn] = useState(sfx.enabled);
  const [showPlayers, setShowPlayers] = useState(false);
  const [tip, setTip] = useState<Stack | null>(null);
  const cursorRef = useRef<Stack | null>(null);
  const gridRef = useRef<(Stack | null)[]>(Array(9).fill(null));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHp = useRef(20);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  /* 광산 */
  const [mine, setMine] = useState<MineStatus | null>(null);
  const [phase, setPhase] = useState<"intro" | "run" | "submit" | "done">(mode === "mine" ? "intro" : "run");
  const [mined, setMined] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<MineResult | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const flash = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const loadMine = useCallback(async () => {
    const res = await fetch("/api/world/mine", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    if (res?.ok) setMine((await res.json()) as MineStatus);
    else {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const info = mineOfDay(day);
      setMine({ day, ore: info.ore, oreName: info.name, need: info.need, seed: info.seed, tokens: 5, best: null, top: [], yesterday: null, signedIn: false });
    }
  }, [shopSlug]);

  useEffect(() => {
    if (mode === "mine") void loadMine();
  }, [mode, loadMine]);

  const submitMine = useCallback(
    async (cells: [number, number, number][], ms: number) => {
      setPhase("submit");
      engineRef.current?.setInputEnabled(false);
      if (!mine?.signedIn) {
        setResult({ guest: true, ms });
        setPhase("done");
        return;
      }
      const res = await fetch("/api/world/mine", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ action: "finish", cells }),
      }).catch(() => null);
      const data = res ? ((await res.json().catch(() => null)) as MineResult | null) : null;
      setResult(data ?? { error: "서버에 연결하지 못했어요" });
      setPhase("done");
      void loadMine();
    },
    [mine?.signedIn, shopSlug, loadMine],
  );
  const submitRef = useRef(submitMine);
  submitRef.current = submitMine;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const startRef = useRef(startAt);
  startRef.current = startAt;

  /* 멀티 야생 — 서버 월드를 다 받은 다음 엔진을 만든다. 서버에 못 붙으면 혼자 하기(브라우저 저장)로 */
  const [wildMode, setWildMode] = useState<"connecting" | "multi" | "solo">(mode === "wild" ? "connecting" : "solo");
  const [netStatus, setNetStatus] = useState<WildStatus>("connecting");
  const [roster, setRoster] = useState<Record<string, string>>({});
  const netRef = useRef<WildNet | null>(null);
  const welcomeRef = useRef<WildWelcome | null>(null);
  const editBuf = useRef<number[]>([]);
  const peersRef = useRef(new Map<string, { n: string; k?: string }>());
  const wildModeRef = useRef(wildMode);
  wildModeRef.current = wildMode;

  useEffect(() => {
    if (mode !== "wild") return;
    let first = true;
    let syncing = true;
    const net = new WildNet(shopSlug, {
      status: (s) => {
        setNetStatus(s);
        if ((s === "denied" || s === "full") && first) setWildMode("solo");
        if (s === "replaced") flash("다른 창에서 야생에 접속해서 이 창은 연결이 끊겼어요");
      },
      welcome: (w) => {
        welcomeRef.current = w;
        editBuf.current = [];
        syncing = true;
        peersRef.current = new Map(w.players.map((p) => [p.id, { n: p.n, k: p.k }]));
        setRoster(Object.fromEntries(w.players.map((p) => [p.id, p.n])));
        for (const p of w.players) {
          engineRef.current?.remoteKnow(p.id, p.n, p.k);
          engineRef.current?.remoteMove(p.id, p.p, p.s);
        }
      },
      edits: (e) => {
        for (const v of e) editBuf.current.push(v);
        if (!syncing) engineRef.current?.applyRemoteEdits(e);
      },
      ready: () => {
        syncing = false;
        if (first) {
          first = false;
          if (wildModeRef.current === "connecting") setWildMode("multi");
          return;
        }
        const eng = engineRef.current;
        const w = welcomeRef.current;
        if (eng && w) {
          eng.applyRemoteEdits(editBuf.current);
          for (const [k, s] of Object.entries(w.chests)) eng.applyRemoteChest(k, s);
        }
      },
      join: (p) => {
        peersRef.current.set(p.id, { n: p.n, k: p.k });
        setRoster((r) => ({ ...r, [p.id]: p.n }));
        engineRef.current?.remoteKnow(p.id, p.n, p.k);
        engineRef.current?.remoteMove(p.id, p.p, p.s);
        flash(`${p.n} 님이 야생에 들어왔어요`);
      },
      pos: (id, p, s) => engineRef.current?.remoteMove(id, p, s),
      gone: (id) => {
        peersRef.current.delete(id);
        setRoster((r) => {
          const rest = { ...r };
          delete rest[id];
          return rest;
        });
        engineRef.current?.remoteGone(id);
      },
      swing: (id) => engineRef.current?.remoteSwing(id),
      chest: (k, s) => engineRef.current?.applyRemoteChest(k, s),
    });
    netRef.current = net;
    void net.connect();
    const giveUp = setTimeout(() => {
      if (wildModeRef.current === "connecting") {
        setWildMode("solo");
        flash("서버에 연결하지 못해서 혼자 하기 모드로 시작했어요");
      }
    }, 12_000);
    return () => {
      clearTimeout(giveUp);
      net.close();
      netRef.current = null;
    };
  }, [mode, shopSlug, flash]);

  const buildMulti = useCallback((): WildMulti | undefined => {
    const w = welcomeRef.current;
    const net = netRef.current;
    if (!w || !net) return undefined;
    return {
      seed: w.seed,
      t0: w.t0,
      edits: editBuf.current.slice(),
      chests: w.chests,
      state: w.state,
      send: {
        edits: (f) => net.edits(f),
        chest: (k, s) => net.chest(k, s),
        pos: (p, s) => net.pos(p, s),
        swing: () => net.swing(),
        save: (s) => net.save(s),
      },
    };
  }, []);

  /* 엔진 */
  const skinUrl = user?.minecraftUuid ? `/api/world/skin?uuid=${user.minecraftUuid}` : undefined;
  const wantEngine = mode === "wild" ? wildMode !== "connecting" : phase !== "intro" && mine !== null;
  useEffect(() => {
    if (!wantEngine || !hostRef.current) return;
    let alive = true;
    let engine: VoxelEngine | null = null;
    void import("./engine").then((mod) => {
      if (!alive || !hostRef.current) return;
      modRef.current = mod;
      const m = mineRef.current;
      const multi = mode === "wild" && wildModeRef.current === "multi" ? buildMulti() : undefined;
      engine = new mod.VoxelEngine(hostRef.current, {
        mode,
        shop: shopSlug,
        fresh,
        skinUrl,
        multi,
        mine: mode === "mine" && m ? { day: m.day, seed: m.seed, ore: m.ore, need: m.need } : undefined,
        events: {
          hud: (h) => {
            setHud(h);
            if (h.hp < prevHp.current) setHurtFlash(Date.now());
            prevHp.current = h.hp;
          },
          inv: bump,
          gui: (g) => {
            setGui(g);
            setBookOpen(false);
          },
          death: (msg) => setDeath(msg),
          message: flash,
          lock: setLocked,
          mined: (cells) => {
            setMined(cells.length);
            const need = mineRef.current?.need ?? 9999;
            if (cells.length >= need && phaseRef.current === "run") void submitRef.current(cells, performance.now() - startRef.current);
          },
        },
      });
      engineRef.current = engine;
      if (multi) for (const [id, p] of peersRef.current) engine.remoteKnow(id, p.n, p.k);
      if (mode === "mine") {
        setStartAt(performance.now());
        engine.lock();
      }
      bump();
    });
    return () => {
      alive = false;
      engine?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantEngine, run, mode, shopSlug]);

  useEffect(() => {
    if (mode !== "mine" || phase !== "run") return;
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, [mode, phase]);

  const inv = engineRef.current?.inv;
  const selected = inv?.selected ?? 0;
  const heldId = inv?.held()?.id ?? null;
  useEffect(() => {
    if (heldId) setHeldName({ text: itemName(heldId), at: Date.now() });
    else setHeldName(null);
  }, [heldId, selected]);

  /* ───────────── GUI 조작 ───────────── */

  const gridSize = gui?.kind === "crafting" ? 3 : 2;
  const gridCells = gridSize * gridSize;

  const returnToInv = useCallback((s: Stack | null) => {
    const e = engineRef.current;
    if (!s || !e) return;
    const left = e.inv.add(s);
    if (left > 0) e.throwStack({ ...s, count: left });
  }, []);

  const closeGui = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    for (let i = 0; i < 9; i++) {
      returnToInv(gridRef.current[i] ?? null);
      gridRef.current[i] = null;
    }
    returnToInv(cursorRef.current);
    cursorRef.current = null;
    const open = guiRef.current;
    if (open?.kind === "chest") e.syncChest(open.key);
    setTip(null);
    setGui(null);
    setBookOpen(false);
    e.setInputEnabled(true);
    e.inv.changed();
    e.lock();
    bump();
  }, [bump, returnToInv]);

  useEffect(() => {
    if (!gui) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === "Escape" || ev.code === "KeyE") {
        ev.preventDefault();
        closeGui();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gui, closeGui]);

  const same = stackable;

  const invRef = (i: number): SlotRef => ({
    get: () => engineRef.current!.inv.slots[i] ?? null,
    set: (s) => {
      engineRef.current!.inv.slots[i] = s;
    },
    area: i < 9 ? "hot" : "main",
  });
  const armorRef = (i: number): SlotRef => ({
    get: () => engineRef.current!.inv.armor[i] ?? null,
    set: (s) => {
      engineRef.current!.inv.armor[i] = s;
    },
    accept: (s) => item(s.id)?.armor?.slot === i && s.count === 1,
    area: "armor",
  });
  const gridRefAt = (i: number): SlotRef => ({
    get: () => gridRef.current[i] ?? null,
    set: (s) => {
      gridRef.current[i] = s;
    },
    area: "grid",
  });
  const chestRef = (key: string, i: number): SlotRef => ({
    get: () => engineRef.current!.chests.get(key)?.[i] ?? null,
    set: (s) => {
      const c = engineRef.current!.chests.get(key);
      if (c) c[i] = s;
    },
    area: "chest",
  });
  const furnaceRef = (f: Furnace, k: "input" | "fuel" | "output"): SlotRef => ({
    get: () => f[k],
    set: (s) => {
      f[k] = s;
    },
    accept: k === "output" ? () => false : k === "fuel" ? (s) => Boolean(item(s.id)?.fuel) : undefined,
    area: k === "input" ? "fin" : k === "fuel" ? "ffuel" : "fout",
  });
  const offRef: SlotRef = {
    get: () => engineRef.current!.inv.offhand,
    set: (s) => {
      engineRef.current!.inv.offhand = s;
    },
    area: "off",
  };
  /** 마법 부여대: 아이템은 gridRef[0], 청금석은 gridRef[1] (닫으면 인벤토리로 돌아간다) */
  const enchItemRef: SlotRef = {
    get: () => gridRef.current[0] ?? null,
    set: (s) => {
      gridRef.current[0] = s;
    },
    accept: (s) => s.count === 1 && (isEnchantable(s) || Boolean(s.ench)),
    area: "ench",
  };
  const lapisRef: SlotRef = {
    get: () => gridRef.current[1] ?? null,
    set: (s) => {
      gridRef.current[1] = s;
    },
    accept: (s) => s.id === "lapis_lazuli",
    area: "lapis",
  };

  /** stack 을 targets 에 넣고 남은 개수 */
  const moveInto = (stack: Stack, targets: SlotRef[]) => {
    let left = stack.count;
    if (maxStack(stack.id) > 1 && stack.dmg === undefined && !stack.ench) {
      for (const t of targets) {
        const s = t.get();
        if (left <= 0) break;
        if (s && same(s, stack) && s.count < maxStack(s.id)) {
          const n = Math.min(left, maxStack(s.id) - s.count);
          t.set({ ...s, count: s.count + n });
          left -= n;
        }
      }
    }
    for (const t of targets) {
      if (left <= 0) break;
      if (t.get() || (t.accept && !t.accept(stack))) continue;
      const n = Math.min(left, maxStack(stack.id));
      t.set({ ...stack, count: n });
      left -= n;
    }
    return left;
  };

  const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);

  const quickMove = (ref: SlotRef) => {
    const s = ref.get();
    const e = engineRef.current;
    if (!s || !e) return;
    let targets: SlotRef[];
    if (ref.area === "hot" || ref.area === "main") {
      const armorSlot = item(s.id)?.armor?.slot;
      if (gui?.kind === "chest") targets = range(0, 27).map((i) => chestRef(gui.key, i));
      else if (gui?.kind === "enchanting" && s.id === "lapis_lazuli") targets = [lapisRef];
      else if (gui?.kind === "enchanting" && enchItemRef.accept!(s) && !enchItemRef.get()) targets = [enchItemRef];
      else if (gui?.kind === "furnace") {
        const f = e.furnaces.get(gui.key)!;
        targets = SMELTING[s.id] ? [furnaceRef(f, "input")] : item(s.id)?.fuel ? [furnaceRef(f, "fuel")] : [];
        if (!targets.length) targets = (ref.area === "hot" ? range(9, 36) : range(0, 9)).map(invRef);
      } else if (gui?.kind === "inventory" && armorSlot !== undefined && !e.inv.armor[armorSlot]) targets = [armorRef(armorSlot)];
      else targets = (ref.area === "hot" ? range(9, 36) : range(0, 9)).map(invRef);
    } else targets = [...range(9, 36), ...range(0, 9)].map(invRef);
    const left = moveInto(s, targets);
    ref.set(left > 0 ? { ...s, count: left } : null);
  };

  const clickSlot = (ref: SlotRef, button: number, shift: boolean) => {
    const e = engineRef.current;
    if (!e) return;
    const cur = cursorRef.current;
    const s = ref.get();
    const ok = (st: Stack) => !ref.accept || ref.accept(st);
    if (shift && s) quickMove(ref);
    else if (button === 0) {
      if (!cur) {
        if (s) {
          cursorRef.current = s;
          ref.set(null);
        }
      } else if (!s) {
        if (ok(cur)) {
          const lim = ref.area === "armor" || ref.area === "ench" ? 1 : maxStack(cur.id);
          if (cur.count <= lim) {
            ref.set(cur);
            cursorRef.current = null;
          } else {
            ref.set({ ...cur, count: lim });
            cursorRef.current = { ...cur, count: cur.count - lim };
          }
        }
      } else if (same(s, cur)) {
        const n = Math.min(maxStack(s.id) - s.count, cur.count);
        ref.set({ ...s, count: s.count + n });
        cursorRef.current = cur.count - n > 0 ? { ...cur, count: cur.count - n } : null;
      } else if (ok(cur)) {
        ref.set(cur);
        cursorRef.current = s;
      }
    } else if (button === 2) {
      if (!cur) {
        if (s) {
          const half = Math.ceil(s.count / 2);
          cursorRef.current = { ...s, count: half };
          ref.set(s.count - half > 0 ? { ...s, count: s.count - half } : null);
        }
      } else if (!s) {
        if (ok(cur)) {
          ref.set({ ...cur, count: 1 });
          cursorRef.current = cur.count > 1 ? { ...cur, count: cur.count - 1 } : null;
        }
      } else if (same(s, cur) && s.count < maxStack(s.id)) {
        ref.set({ ...s, count: s.count + 1 });
        cursorRef.current = cur.count > 1 ? { ...cur, count: cur.count - 1 } : null;
      } else if (ok(cur)) {
        ref.set(cur);
        cursorRef.current = s;
      }
    }
    e.inv.changed();
    bump();
  };

  const takeOutput = (ref: SlotRef, shift: boolean) => {
    const s = ref.get();
    const e = engineRef.current;
    if (!s || !e) return;
    let taken = s.count;
    if (shift) {
      const left = moveInto(s, [...range(9, 36), ...range(0, 9)].map(invRef));
      ref.set(left > 0 ? { ...s, count: left } : null);
      taken -= left;
    } else {
      const cur = cursorRef.current;
      if (cur && (!same(cur, s) || cur.count + s.count > maxStack(s.id))) return;
      cursorRef.current = cur ? { ...cur, count: cur.count + s.count } : s;
      ref.set(null);
    }
    if (ref.area === "fout" && taken > 0) e.smeltXp(s.id, taken);
    e.inv.changed();
    bump();
  };

  const gridIds = () => Array.from({ length: gridCells }, (_, i) => gridRef.current[i]?.id ?? null);
  const craftResult = gui && (gui.kind === "inventory" || gui.kind === "crafting") ? craft(gridIds(), gridSize) : null;

  const consumeGrid = () => {
    for (let i = 0; i < gridCells; i++) {
      const g = gridRef.current[i];
      if (!g) continue;
      const rest = CRAFT_REMAINDER[g.id];
      gridRef.current[i] = g.count > 1 ? { ...g, count: g.count - 1 } : rest ? { id: rest, count: 1 } : null;
    }
  };

  const takeCraft = (shift: boolean) => {
    const e = engineRef.current;
    if (!e || !craftResult) return;
    if (shift) {
      for (let n = 0; n < 64; n++) {
        const r = craft(gridIds(), gridSize);
        if (!r) break;
        const out: Stack = { id: r.out, count: r.count };
        const left = moveInto(out, [...range(9, 36), ...range(0, 9)].map(invRef));
        consumeGrid();
        if (left > 0) {
          e.throwStack({ ...out, count: left });
          break;
        }
      }
    } else {
      const cur = cursorRef.current;
      if (cur && (cur.id !== craftResult.out || cur.count + craftResult.count > maxStack(craftResult.out) || cur.dmg !== undefined)) return;
      cursorRef.current = cur ? { ...cur, count: cur.count + craftResult.count } : { id: craftResult.out, count: craftResult.count };
      consumeGrid();
    }
    e.inv.changed();
    bump();
  };

  const fillRecipe = (r: Recipe) => {
    const e = engineRef.current;
    if (!e) return;
    if (gridSize === 2 && needsTable(r)) {
      flash("제작대(3×3)가 필요한 제작법이에요");
      return;
    }
    for (let i = 0; i < 9; i++) {
      returnToInv(gridRef.current[i] ?? null);
      gridRef.current[i] = null;
    }
    const want: [number, string][] = [];
    if (r.kind === "shaped") r.rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== " " && want.push([y * gridSize + x, r.key[ch]!])));
    else r.items.forEach((ing, i) => want.push([i, ing]));
    const taken: [number, Stack][] = [];
    for (const [cell, ing] of want) {
      const at = e.inv.slots.findIndex((s) => s && matches(ing, s.id));
      if (at < 0) {
        for (const [, st] of taken) returnToInv(st);
        for (let i = 0; i < 9; i++) gridRef.current[i] = null;
        flash("재료가 부족해요");
        e.inv.changed();
        bump();
        return;
      }
      const s = e.inv.slots[at]!;
      const one: Stack = { id: s.id, count: 1 };
      e.inv.slots[at] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
      gridRef.current[cell] = one;
      taken.push([cell, one]);
    }
    e.inv.changed();
    bump();
  };

  const throwCursor = (button: number) => {
    const e = engineRef.current;
    const cur = cursorRef.current;
    if (!e || !cur) return;
    if (button === 2) {
      e.throwStack({ ...cur, count: 1 });
      cursorRef.current = cur.count > 1 ? { ...cur, count: cur.count - 1 } : null;
    } else {
      e.throwStack(cur);
      cursorRef.current = null;
    }
    bump();
  };

  /* 커서에 붙은 아이템 */
  const [mouse, setMouse] = useState({ x: -100, y: -100 });
  useEffect(() => {
    if (!gui) return;
    const mv = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", mv);
    return () => window.removeEventListener("mousemove", mv);
  }, [gui]);

  /* ───────────── 화면 ───────────── */

  const engine = engineRef.current;
  const showPause = Boolean(engine && hud && !locked && !gui && !death && !touch && phase === "run");
  const recipeTabs = ["전체", ...Array.from(new Set(RECIPES.map((r) => r.group)))];
  const visibleRecipes = RECIPES.filter((r) => bookTab === "전체" || r.group === bookTab).filter(
    (r, i, arr) => arr.findIndex((x) => x.out === r.out && x.group === r.group) === i,
  );
  const canMake = (r: Recipe) => {
    if (!engine) return false;
    const pool = engine.inv.slots.filter((s): s is Stack => s !== null).map((s) => ({ ...s }));
    const ings = r.kind === "shaped" ? r.rows.flatMap((row) => [...row].filter((c) => c !== " ").map((c) => r.key[c]!)) : r.items;
    return ings.every((ing) => {
      const s = pool.find((p) => p.count > 0 && matches(ing, p.id));
      if (!s) return false;
      s.count--;
      return true;
    });
  };

  const playerInv = engine ? (
    <div className="vx-inv-grid">
      <div className="vx-row9 vx-main">
        {range(9, 36).map((i) => (
          <SlotView key={i} s={engine.inv.slots[i] ?? null} onDown={(b, sh) => clickSlot(invRef(i), b, sh)} />
        ))}
      </div>
      <div className="vx-row9 vx-hotrow">
        {range(0, 9).map((i) => (
          <SlotView key={i} s={engine.inv.slots[i] ?? null} onDown={(b, sh) => clickSlot(invRef(i), b, sh)} />
        ))}
      </div>
    </div>
  ) : null;

  const craftingArea = (
    <div className="vx-craft">
      <div className={`vx-grid is-${gridSize}`}>
        {range(0, gridCells).map((i) => (
          <SlotView key={i} s={gridRef.current[i] ?? null} onDown={(b, sh) => clickSlot(gridRefAt(i), b, sh)} />
        ))}
      </div>
      <CraftArrow />
      <SlotView big s={craftResult ? { id: craftResult.out, count: craftResult.count } : null} onDown={(_, sh) => takeCraft(sh)} />
    </div>
  );

  /* 마법 부여대 */
  const enchKey = gui?.kind === "enchanting" ? gui.key : null;
  const enchTarget = enchKey ? (gridRef.current[0] ?? null) : null;
  const lapisCount = enchKey ? (gridRef.current[1]?.id === "lapis_lazuli" ? gridRef.current[1]!.count : 0) : 0;
  const enchShelves = enchKey && engine ? engine.enchantShelves(enchKey) : 0;
  const enchOptions =
    enchKey && engine && enchTarget && isEnchantable(enchTarget)
      ? enchantCosts(enchShelves, engine.enchSeed).map((cost, slot) => {
          const roll = rollEnchants(enchTarget.id, cost, engine.enchSeed, slot);
          const first = Object.entries(roll)[0];
          const ok = engine.xpLevel >= cost && lapisCount >= slot + 1 && Boolean(first);
          return { cost, slot, hint: first ? `${enchName(first[0], first[1])} . . . ?` : null, ok, rune: runeText(engine.enchSeed + slot * 977) };
        })
      : null;
  const doEnchant = (slot: number) => {
    const e = engineRef.current;
    const opt = enchOptions?.[slot];
    if (!e || !enchKey || !enchTarget || !opt?.ok) return;
    const out = e.enchantWith(enchKey, enchTarget, slot);
    if (!out) {
      flash("레벨이 부족해요");
      return;
    }
    gridRef.current[0] = out;
    const lap = gridRef.current[1]!;
    gridRef.current[1] = lap.count - (slot + 1) > 0 ? { ...lap, count: lap.count - (slot + 1) } : null;
    e.inv.changed();
    bump();
  };

  const furnace = gui?.kind === "furnace" && engine ? engine.furnaces.get(gui.key) : undefined;
  const chest = gui?.kind === "chest" && engine ? engine.chests.get(gui.key) : undefined;
  const mineElapsed = phase === "run" ? Math.max(0, now - startAt) : 0;

  return (
    <div
      className={`vx-root ${gui ? "has-gui" : ""}`}
      onPointerDownCapture={() => sfx.unlock()}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("button")) sfx.click();
      }}
    >
      <div ref={hostRef} className="vx-canvas" />

      {hud?.underwater ? <div className="vx-water" /> : null}
      {hurtFlash && Date.now() - hurtFlash < 350 ? <div className="vx-hurt" key={hurtFlash} /> : null}

      {!hud && (wantEngine || (mode === "wild" && wildMode === "connecting")) ? (
        <div className="vx-loading">
          <div className="vx-loading-card">
            <div className="vx-loading-cube" aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <b>{mode === "wild" ? (wildMode === "connecting" ? "야생 서버에 접속 중" : "월드 불러오는 중") : "광산 만드는 중"}</b>
            <span>
              {mode === "wild" && wildMode === "connecting"
                ? netStatus === "offline"
                  ? "연결이 늦어지고 있어요. 다시 시도하는 중…"
                  : "다른 유저들이 만든 공유 월드를 받고 있어요"
                : "지형을 불러오고 있어요…"}
            </span>
          </div>
        </div>
      ) : null}

      {/* HUD */}
      {engine && hud && !gui ? <div className="vx-cross" /> : null}
      {engine && hud ? (
        <div className="vx-hud">
          {heldName && Date.now() - heldName.at < 2200 ? <div className="vx-held-name">{heldName.text}</div> : null}
          {hud.heldInfo ? <div className="vx-actionbar">{hud.heldInfo}</div> : null}
          {mode === "wild" ? (
            <div className="vx-bars">
              <div className="vx-bars-l">
                {hud.armor > 0 ? <Icons full={icons.armor} empty={icons.armorEmpty} value={hud.armor} /> : null}
                {hud.absorb > 0 ? <Icons full={icons.heart} empty="" value={Math.ceil(hud.absorb)} max={Math.ceil(hud.absorb / 2) * 2} cls="is-gold" /> : null}
                <Icons full={icons.heart} empty={icons.heartEmpty} value={Math.ceil(hud.hp)} cls={hud.hp <= 4 ? "is-low" : ""} />
              </div>
              <div className="vx-bars-r">
                {hud.air < 300 ? <Icons full={icons.bubble} empty="" value={Math.ceil((hud.air / 300) * 20)} flip /> : null}
                <Icons full={icons.food} empty={icons.foodEmpty} value={hud.food} flip />
              </div>
            </div>
          ) : null}
          {mode === "wild" ? (
            <div className="vx-xp">
              <i style={{ width: `${Math.min(1, hud.xpProgress) * 100}%` }} />
              {hud.xpLevel > 0 ? <b>{hud.xpLevel}</b> : null}
            </div>
          ) : null}
          <div className="vx-hotbar-row">
            {engine.inv.offhand ? (
              <div className="vx-offhand">
                <SlotView s={engine.inv.offhand} />
              </div>
            ) : null}
            <div className="vx-hotbar">
              {range(0, 9).map((i) => (
                <SlotView
                  key={i}
                  s={engine.inv.slots[i] ?? null}
                  selected={i === selected}
                  onDown={() => {
                    if (touch) engine.select(i);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {engine?.showDebug && hud ? (
        <div className="vx-debug">
          <p>DOES 마인크래프트 · {hud.fps} fps · 청크 {hud.chunks}</p>
          <p>
            XYZ: {hud.pos[0].toFixed(2)} / {hud.pos[1].toFixed(2)} / {hud.pos[2].toFixed(2)}
          </p>
          <p>블록: {Math.floor(hud.pos[0])} {Math.floor(hud.pos[1])} {Math.floor(hud.pos[2])}</p>
          <p>방향: {hud.facing}</p>
          <p>생물 군계: {hud.biome}</p>
          <p>밝기: {hud.light}</p>
          <p>
            시간: {Math.floor(((hud.time * 24 + 6) % 24))}시 · 개체 {hud.mobs}
          </p>
          {hud.target ? <p>바라보는 블록: {hud.target}</p> : null}
        </div>
      ) : null}

      <div className="vx-top">
        <button type="button" className="vx-chip" onClick={() => router.push("/main")}>
          ← 광장
        </button>
        {mode === "wild" && wildMode === "multi" ? (
          <div className={`vx-chip vx-online ${netStatus === "online" ? "" : "is-off"}`}>
            <i />
            {netStatus === "online" ? `함께하는 야생 · ${Object.keys(roster).length + 1}명` : netStatus === "replaced" ? "다른 창에서 접속 중" : "다시 연결하는 중…"}
          </div>
        ) : null}
        {mode === "mine" && mine ? (
          <div className="vx-mine-bar">
            <img src={itemIcon(`${mine.ore}_ore`)} alt="" />
            <b>
              오늘의 광물 · {mine.oreName} {Math.min(mined, mine.need)}/{mine.need}
            </b>
            {phase === "run" ? <span>{fmtMs(mineElapsed)}</span> : null}
          </div>
        ) : null}
      </div>

      {toast ? <div className="vx-toast">{toast}</div> : null}

      {/* 모바일 조작 */}
      {touch && engine && !gui && !death && phase === "run" ? (
        <>
          <Joystick onMove={(x, y) => engine.setMobileMove(x, y)} />
          <div className="vx-mbtns">
            <HoldButton label="캐기" cls="is-break" onChange={(on) => engine.mobileBreak(on)} />
            <HoldButton label="놓기" cls="is-use" onChange={(on) => engine.mobileUse(on)} />
            <HoldButton label="점프" cls="is-jump" onChange={(on) => engine.setMobileJump(on)} />
            <HoldButton label="웅크리기" cls="is-sneak" onChange={(on) => engine.setMobileSneak(on)} />
            <button type="button" className="vx-mbtn is-bag" onClick={() => engine.openGui({ kind: "inventory" })}>
              가방
            </button>
          </div>
        </>
      ) : null}

      {/* 일시 정지 */}
      {showPause ? (
        <div className="vx-overlay is-menu">
          <div className="vx-menu">
            <h2>게임 메뉴</h2>
            <button type="button" className="mc-btn" onClick={() => engine!.lock()}>
              게임으로 돌아가기
            </button>
            <div className="vx-menu-row">
              <button
                type="button"
                className="mc-btn"
                onClick={() => {
                  sfx.setEnabled(!soundOn);
                  setSoundOn(!soundOn);
                }}
              >
                소리: {soundOn ? "켜짐" : "꺼짐"}
              </button>
              {mode === "wild" && wildMode === "multi" ? (
                <button type="button" className="mc-btn" onClick={() => setShowPlayers((v) => !v)}>
                  접속자 {Object.keys(roster).length + 1}명
                </button>
              ) : mode === "wild" ? (
                <button
                  type="button"
                  className="mc-btn"
                  onClick={() => {
                    if (!window.confirm("지금 월드를 지우고 새 월드를 만들까요? 되돌릴 수 없어요.")) return;
                    modRef.current?.VoxelEngine.clearSave(shopSlug);
                    setHud(null);
                    setFresh(true);
                    setRun((r) => r + 1);
                  }}
                >
                  새 월드 만들기
                </button>
              ) : (
                <button
                  type="button"
                  className="mc-btn"
                  onClick={() => {
                    setPhase("intro");
                    setHud(null);
                    setMined(0);
                  }}
                >
                  처음부터 다시
                </button>
              )}
            </div>
            <button type="button" className="mc-btn" onClick={() => router.push("/main")}>
              {mode === "wild" ? "저장 후 광장으로 나가기" : "광장으로 나가기"}
            </button>
            <div className="vx-keys">
              <span><kbd>WASD</kbd> 이동</span>
              <span><kbd>Space</kbd> 점프 · 수영</span>
              <span><kbd>Ctrl</kbd> / <kbd>W</kbd> 두 번 달리기</span>
              <span><kbd>Shift</kbd> 웅크리기</span>
              <span><kbd>좌클릭</kbd> 캐기 · 공격</span>
              <span><kbd>우클릭</kbd> 놓기 · 사용 · 먹기</span>
              <span><kbd>E</kbd> 인벤토리</span>
              <span><kbd>Q</kbd> 버리기</span>
              <span><kbd>F</kbd> 왼손과 바꾸기</span>
              <span><kbd>1~9</kbd> · 휠 핫바</span>
              <span><kbd>F3</kbd> 정보 · <kbd>F5</kbd> 시점 (1인칭 · 뒤 · 앞)</span>
            </div>
            {showPlayers && wildMode === "multi" ? (
              <ul className="vx-players">
                <li className="is-me">{welcomeRef.current?.name ?? "나"} (나)</li>
                {Object.entries(roster).map(([id, n]) => (
                  <li key={id}>{n}</li>
                ))}
              </ul>
            ) : null}
            {mode === "wild" ? (
              <p className="vx-note">
                {wildMode === "multi"
                  ? "같은 상점 유저들과 함께하는 공유 월드예요. 월드는 서버에 저장돼서 초기화되지 않고, 들어올 때마다 랜덤한 곳에서 시작해요."
                  : "서버에 연결하지 못해 혼자 하기 모드예요. 월드는 이 브라우저에 자동 저장돼요."}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 죽음 */}
      {death ? (
        <div className="vx-overlay is-death">
          <div className="vx-death vx-menu">
            <h1>죽었습니다!</h1>
            <p>{death}</p>
            <button
              type="button"
              className="mc-btn"
              onClick={() => {
                setDeath(null);
                engine?.respawn();
              }}
            >
              부활
            </button>
            <button type="button" className="mc-btn" onClick={() => router.push("/main")}>
              광장으로
            </button>
          </div>
        </div>
      ) : null}

      {/* 광산 시작 · 결과 */}
      {mode === "mine" && (phase === "intro" || phase === "done" || phase === "submit") ? (
        <div className="vx-overlay is-mine">
          <div className="vx-panel vx-mine">
            {!mine ? (
              <p>오늘의 광산을 불러오는 중…</p>
            ) : phase === "submit" ? (
              <p>기록을 확인하는 중…</p>
            ) : (
              <>
                <h2>⛏ 광산 레이스</h2>
                {phase === "done" && result ? (
                  <div className="vx-result">
                    {"error" in result ? (
                      <p className="is-err">{result.error}</p>
                    ) : "guest" in result ? (
                      <>
                        <b>{fmtMs(result.ms)}</b>
                        <p>게스트 기록은 순위에 올라가지 않아요. 로그인하면 1등 보상을 받을 수 있어요.</p>
                      </>
                    ) : (
                      <>
                        <b>{fmtMs(result.ms)}</b>
                        <p>
                          {result.rank ? `오늘 ${result.rank}등!` : "순위 밖이에요"} · 내 최고 {fmtMs(result.best)}
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
                <div className="vx-mine-goal">
                  <img src={itemIcon(`${mine.ore}_ore`)} alt="" />
                  <div>
                    <b>
                      오늘의 광물: {mine.oreName} 광석 {mine.need}개
                    </b>
                    <span>가장 빨리 캔 사람이 하루마다 {mine.tokens}토큰을 받아요 (다음 날 자동 지급)</span>
                  </div>
                </div>
                <div className="vx-mine-cols">
                  <div>
                    <h3>오늘 순위</h3>
                    {mine.top.length ? (
                      <ol>
                        {mine.top.map((t, i) => (
                          <li key={i}>
                            <span>{t.n}</span>
                            <b>{fmtMs(t.ms)}</b>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="vx-note">아직 기록이 없어요. 첫 1등이 되어 보세요!</p>
                    )}
                  </div>
                  <div>
                    <h3>어제 1등</h3>
                    {mine.yesterday ? (
                      <p>
                        👑 {mine.yesterday.n} · {fmtMs(mine.yesterday.ms)}
                      </p>
                    ) : (
                      <p className="vx-note">없음</p>
                    )}
                    {mine.best ? <p className="vx-note">내 오늘 최고: {fmtMs(mine.best)}</p> : null}
                  </div>
                </div>
                {!mine.signedIn ? <p className="vx-note">게스트는 연습만 할 수 있어요. 순위 등록 · 보상은 로그인 후!</p> : null}
                <p className="vx-note">다이아몬드 곡괭이 · 횃불 64개를 들고 시작해요. 광석은 매일 바뀌어요.</p>
                <div className="vx-mine-actions">
                  <button
                    type="button"
                    className="mc-btn is-green"
                    onClick={async () => {
                      if (mine.signedIn) {
                        const res = await fetch("/api/world/mine", {
                          method: "POST",
                          credentials: "include",
                          headers: shopHeaders(shopSlug),
                          body: JSON.stringify({ action: "start" }),
                        }).catch(() => null);
                        if (!res?.ok) {
                          flash("시작하지 못했어요. 다시 시도해 주세요");
                          return;
                        }
                      }
                      setResult(null);
                      setMined(0);
                      setHud(null);
                      setPhase("run");
                      setRun((r) => r + 1);
                    }}
                  >
                    {phase === "done" ? "다시 도전" : "시작하기"}
                  </button>
                  <button type="button" className="mc-btn" onClick={() => router.push("/main")}>
                    광장으로
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* 인벤토리 · 제작 · 화로 · 상자 */}
      {gui && engine ? (
        <TipCtx.Provider value={setTip}>
        <div
          className="vx-overlay is-gui"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) throwCursor(e.button);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="vx-gui-wrap">
            {bookOpen ? (
              <div className="vx-panel vx-book">
                <h3>제작법 책</h3>
                <div className="vx-tabs">
                  {recipeTabs.map((t) => (
                    <button key={t} type="button" className={t === bookTab ? "is-on" : ""} onClick={() => setBookTab(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                <div className="vx-book-list">
                  {visibleRecipes.map((r, i) => {
                    const ok = canMake(r) && !(gridSize === 2 && needsTable(r));
                    return (
                      <button
                        key={`${r.out}-${i}`}
                        type="button"
                        className={`vx-book-item ${ok ? "is-ok" : ""}`}
                        title={`${itemName(r.out)}${needsTable(r) ? " (제작대)" : ""}\n${recipeGrid(r)
                          .map((k) => (k ? itemName(k) : "·"))
                          .reduce((acc, k, j) => acc + (j % 3 === 0 && j ? "\n" : j ? " | " : "") + k, "")}`}
                        onClick={() => fillRecipe(r)}
                      >
                        <img src={itemIcon(r.out)} alt="" />
                        {r.count > 1 ? <b>{r.count}</b> : null}
                      </button>
                    );
                  })}
                </div>
                <p className="vx-note">초록색은 지금 만들 수 있어요. 누르면 재료를 자동으로 놓아요.</p>
              </div>
            ) : null}
            <div className="vx-panel vx-gui">
              {gui.kind === "inventory" ? (
                <div className="vx-gui-top">
                  <div className="vx-armor">
                    {[0, 1, 2, 3].map((i) => (
                      <SlotView key={i} s={engine.inv.armor[i] ?? null} title={["투구", "흉갑", "레깅스", "부츠"][i]} onDown={(b, sh) => clickSlot(armorRef(i), b, sh)} />
                    ))}
                  </div>
                  <SkinPreview engine={engine} />
                  <div className="vx-offslot">
                    <SlotView s={engine.inv.offhand} title="왼손 (F)" hint={itemIcon("shield")} onDown={(b, sh) => clickSlot(offRef, b, sh)} />
                  </div>
                  <div>
                    <h4>제작</h4>
                    {craftingArea}
                  </div>
                </div>
              ) : null}
              {gui.kind === "enchanting" ? (
                <div className="vx-gui-top is-ench">
                  <h4>마법 부여</h4>
                  <div className="vx-ench">
                    <div className="vx-ench-in">
                      <div className="vx-ench-book" aria-hidden>
                        <i />
                      </div>
                      <div className="vx-ench-slots">
                        <SlotView s={gridRef.current[0] ?? null} title="마법을 부여할 아이템" onDown={(b, sh) => clickSlot(enchItemRef, b, sh)} />
                        <SlotView s={gridRef.current[1] ?? null} title="청금석" hint={itemIcon("lapis_lazuli")} onDown={(b, sh) => clickSlot(lapisRef, b, sh)} />
                      </div>
                    </div>
                    <div className="vx-ench-opts">
                      {[0, 1, 2].map((i) => {
                        const o = enchOptions?.[i];
                        return (
                          <button
                            key={i}
                            type="button"
                            className={`vx-ench-opt ${o ? (o.ok ? "is-ok" : "is-no") : "is-empty"}`}
                            disabled={!o?.ok}
                            onClick={() => doEnchant(i)}
                          >
                            {o ? (
                              <>
                                <span className="vx-ench-lapis">{i + 1}</span>
                                <span className="vx-ench-rune">{o.rune}</span>
                                <b className="vx-ench-cost">{o.cost}</b>
                                {o.hint ? <span className="vx-ench-hint">{o.hint}</span> : null}
                                {!o.ok ? <span className="vx-ench-why">{engine.xpLevel < o.cost ? `레벨 ${o.cost} 필요` : `청금석 ${i + 1}개 필요`}</span> : null}
                              </>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="vx-note">
                    책장 {enchShelves}/15개 · 내 레벨 {engine.xpLevel}
                    {enchTarget?.ench ? " · 이미 마법이 부여된 아이템이에요" : ""}
                  </p>
                </div>
              ) : null}
              {gui.kind === "crafting" ? (
                <div className="vx-gui-top">
                  <div>
                    <h4>제작대</h4>
                    {craftingArea}
                  </div>
                </div>
              ) : null}
              {gui.kind === "furnace" && furnace ? (
                <div className="vx-gui-top">
                  <div className="vx-furnace">
                    <h4>화로</h4>
                    <div className="vx-furnace-body">
                      <div className="vx-furnace-l">
                        <SlotView s={furnace.input} onDown={(b, sh) => clickSlot(furnaceRef(furnace, "input"), b, sh)} />
                        <i className="vx-flame">
                          <i style={{ height: `${furnace.burnMax ? (Math.max(0, furnace.burn) / furnace.burnMax) * 100 : 0}%` }} />
                        </i>
                        <SlotView s={furnace.fuel} onDown={(b, sh) => clickSlot(furnaceRef(furnace, "fuel"), b, sh)} />
                      </div>
                      <i className="vx-progress">
                        <i style={{ width: `${(furnace.cook / 10) * 100}%` }} />
                      </i>
                      <SlotView big s={furnace.output} onDown={(_, sh) => takeOutput(furnaceRef(furnace, "output"), sh)} />
                    </div>
                  </div>
                </div>
              ) : null}
              {gui.kind === "chest" && chest ? (
                <div className="vx-gui-top is-chest">
                  <h4>상자</h4>
                  <div className="vx-row9">
                    {range(0, 27).map((i) => (
                      <SlotView key={i} s={chest[i] ?? null} onDown={(b, sh) => clickSlot(chestRef(gui.key, i), b, sh)} />
                    ))}
                  </div>
                </div>
              ) : null}
              <h4>인벤토리</h4>
              {playerInv}
              <div className="vx-gui-actions">
                {gui.kind === "inventory" || gui.kind === "crafting" ? (
                  <button type="button" className="mc-btn is-sm" onClick={() => setBookOpen((v) => !v)}>
                    제작법 책
                  </button>
                ) : null}
                <button type="button" className="mc-btn is-sm" onClick={closeGui}>
                  닫기 (E)
                </button>
              </div>
            </div>
          </div>
          {cursorRef.current ? (
            <div className="vx-cursor" style={{ left: mouse.x, top: mouse.y }}>
              <img src={itemIcon(cursorRef.current.id)} alt="" />
              {cursorRef.current.count > 1 ? <b>{cursorRef.current.count}</b> : null}
            </div>
          ) : tip ? (
            <ItemTip s={tip} x={mouse.x} y={mouse.y} />
          ) : null}
        </div>
        </TipCtx.Provider>
      ) : null}
    </div>
  );
}
