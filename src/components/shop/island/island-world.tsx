"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Hammer, Loader2, Pickaxe, RotateCcw, Check, AlertCircle } from "lucide-react";
import { useShopUser } from "@/components/shop/user-context";
import { shopHeaders } from "@/lib/shop-client";
import { texturePixels, TEX, type TextureName } from "@/lib/island/textures";
import {
  BUILD_ITEM_IDS,
  ITEMS,
  REWARD_ITEM_IDS,
  STARTER_ALLOWANCE,
  STARTER_BLOCKS,
  inventoryOf,
  type IslandView,
  type ItemId,
  type PlacedBlock,
} from "@/lib/island/world";
import type { IslandEngine, SignTexts } from "./island-engine";

const ICON_TEX: Partial<Record<ItemId, TextureName>> = {
  grass: "grass_side",
  diamond: "diamond_block",
  tree: "oak_log",
  house: "door",
  flag: "banner",
  lantern: "lantern",
  pumpkin: "pumpkin_face",
  cake: "cake_side",
  beacon: "beacon_core",
  jukebox: "jukebox_side",
  chest: "chest_front",
  glowstone: "glowstone",
  flower: "wool_red",
};

const iconCache = new Map<TextureName, string>();
export function itemIcon(id: ItemId) {
  const box = ITEMS[id].model[ITEMS[id].model.length - 1]!;
  const name = ICON_TEX[id] ?? box.faces.front ?? box.faces.side;
  const hit = iconCache.get(name);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = TEX;
  c.height = TEX;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(TEX, TEX);
  img.data.set(texturePixels(name));
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL();
  iconCache.set(name, url);
  return url;
}

export function signTextsFor(island: IslandView | null): SignTexts {
  const s = island?.stats;
  return {
    owner: island ? [`${island.owner.name}의 섬`, `Lv.${island.level}`] : ["DOES 스카이블럭", "로그인하면 내 섬!"],
    stats: s ? [`다이아 ${s.orders} · 나무 ${s.reviews}`, `잔디 ${s.attendance} · 장식 ${s.events}`] : ["출석 → 잔디", "후기 → 나무"],
    parkour: ["파쿠르는 메인 광장", "하늘색 정자로!"],
    portal: ["워프 정자 →", "메인 광장"],
  };
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function IslandWorld({
  shopSlug,
  island,
  editable,
  onPortal,
  onIslandChange,
  className = "",
  children,
}: {
  shopSlug: string;
  island: IslandView | null;
  editable: boolean;
  onPortal?: () => void;
  onIslandChange?: (v: IslandView) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const { user } = useShopUser();
  const skinUrl = user?.minecraftUuid ? `/api/world/skin?uuid=${user.minecraftUuid}` : undefined;
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<IslandEngine | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portalRef = useRef(onPortal);
  portalRef.current = onPortal;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocks, setBlocks] = useState<PlacedBlock[]>(island?.blocks ?? STARTER_BLOCKS);
  const [build, setBuild] = useState(false);
  const [tool, setTool] = useState<"place" | "break">("place");
  const [selected, setSelected] = useState<ItemId | null>(null);
  const [firstPerson, setFirstPerson] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [touch, setTouch] = useState(false);

  const allowance = island?.allowance ?? STARTER_ALLOWANCE;
  const inventory = useMemo(() => inventoryOf(allowance, blocks), [allowance, blocks]);
  const owned = useMemo(
    () => [...REWARD_ITEM_IDS.filter((id) => (allowance[id] ?? 0) > 0), ...BUILD_ITEM_IDS],
    [allowance],
  );

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2200);
  }, []);

  const persist = useCallback(
    (next: PlacedBlock[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSave("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/island", {
            method: "PUT",
            credentials: "include",
            headers: shopHeaders(shopSlug),
            body: JSON.stringify({ blocks: next }),
          });
          const data = (await res.json()) as { island?: IslandView; error?: string };
          if (!res.ok || !data.island) throw new Error(data.error || "저장 실패");
          setSave("saved");
          onIslandChange?.(data.island);
        } catch (err) {
          setSave("error");
          flash(err instanceof Error ? err.message : "저장 실패");
        }
      }, 900);
    },
    [shopSlug, onIslandChange, flash],
  );

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: IslandEngine | null = null;
    let cancelled = false;
    import("./island-engine")
      .then(({ IslandEngine: Engine }) => {
        if (cancelled) return;
        try {
          engine = new Engine(host, {
            blocks: island?.blocks ?? STARTER_BLOCKS,
            editable,
            signs: signTextsFor(island),
            onBlocksChange: (next) => {
              setBlocks(next);
              persist(next);
            },
            onPortal: () => portalRef.current?.(),
            onViewChange: setFirstPerson,
            onNotice: flash,
          });
          engineRef.current = engine;
          setReady(true);
        } catch (err) {
          console.error("[island] webgl init failed", err);
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
    // 섬 주인이 바뀔 때만 엔진을 새로 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [island?.userId]);

  useEffect(() => {
    if (!island) return;
    engineRef.current?.updateSigns(signTextsFor(island));
  }, [island]);

  useEffect(() => {
    if (ready && skinUrl) engineRef.current?.setSkin(skinUrl);
  }, [skinUrl, ready, island?.userId]);

  useEffect(() => {
    engineRef.current?.setBuildMode(build);
  }, [build, ready]);
  useEffect(() => {
    engineRef.current?.setTool(tool);
  }, [tool, ready]);
  useEffect(() => {
    const id = selected && (inventory[selected] ?? 0) > 0 ? selected : null;
    engineRef.current?.setSelected(id);
  }, [selected, inventory, ready]);

  useEffect(() => {
    if (!build) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && owned[n - 1]) setSelected(owned[n - 1]!);
      if (e.key === "q" || e.key === "Q") setTool((t) => (t === "place" ? "break" : "place"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [build, owned]);

  useEffect(() => {
    if (build && !selected) {
      const first = owned.find((id) => (inventory[id] ?? 0) > 0);
      if (first) setSelected(first);
    }
  }, [build, selected, owned, inventory]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  return (
    <div className={`isl-world ${className}`}>
      <div ref={hostRef} className="isl-canvas" />

      {!ready && !failed ? (
        <div className="isl-loading">
          <Loader2 className="animate-spin" />
          <span>섬을 불러오는 중…</span>
        </div>
      ) : null}
      {failed ? (
        <div className="isl-loading">
          <AlertCircle />
          <span>이 기기에서는 3D 섬을 표시할 수 없어요 (WebGL 미지원)</span>
        </div>
      ) : null}

      {children}

      <div className="isl-tools">
        <button type="button" onClick={() => engineRef.current?.toggleView()} title="시점 전환 (V)">
          <Eye />
          <span>{firstPerson ? "1인칭" : "3인칭"}</span>
        </button>
        <button type="button" onClick={() => engineRef.current?.respawnPlayer()} title="리스폰 (R)">
          <RotateCcw />
          <span>리스폰</span>
        </button>
        {editable ? (
          <button type="button" className={build ? "is-on" : ""} onClick={() => setBuild((b) => !b)} title="건축 모드">
            <Hammer />
            <span>{build ? "건축 중" : "꾸미기"}</span>
          </button>
        ) : null}
      </div>

      {save !== "idle" && editable ? (
        <div className={`isl-save is-${save}`}>
          {save === "saving" ? <Loader2 className="animate-spin" /> : save === "saved" ? <Check /> : <AlertCircle />}
          {save === "saving" ? "저장 중" : save === "saved" ? "저장됨" : "저장 실패"}
        </div>
      ) : null}

      {notice ? <div className="isl-notice">{notice}</div> : null}
      {firstPerson ? <div className="isl-crosshair" aria-hidden /> : null}

      {build ? (
        <div className="isl-hotbar-wrap">
          <div className="isl-toolswitch">
            <button type="button" className={tool === "place" ? "is-on" : ""} onClick={() => setTool("place")}>
              <Hammer /> 설치
            </button>
            <button type="button" className={tool === "break" ? "is-on" : ""} onClick={() => setTool("break")}>
              <Pickaxe /> 부수기
            </button>
          </div>
          <div className="isl-hotbar" role="listbox" aria-label="인벤토리">
            {owned.length === 0 ? <span className="isl-hotbar-empty">아직 아이템이 없어요</span> : null}
            {owned.map((id, i) => {
              const left = inventory[id] ?? 0;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={selected === id}
                  className={`isl-slot ${selected === id ? "is-on" : ""} ${left === 0 ? "is-empty" : ""}`}
                  onClick={() => {
                    setSelected(id);
                    setTool("place");
                  }}
                  title={`${ITEMS[id].label} · ${ITEMS[id].source}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={itemIcon(id)} alt="" />
                  <b>{left === Infinity ? "∞" : left}</b>
                  {i < 9 ? <i>{i + 1}</i> : null}
                </button>
              );
            })}
          </div>
          {selected ? (
            <p className="isl-hotbar-label">
              {ITEMS[selected].label} <span>· {ITEMS[selected].source}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="isl-hint">
          {touch
            ? "드래그: 시점 · 두 손가락: 줌 · 조이스틱: 이동"
            : "WASD 이동 · Space 점프 · Ctrl 달리기 · Shift 웅크리기 · 드래그 시점 · 휠↑ 1인칭 / 휠↓ 멀리"}
        </p>
      )}

      {touch && ready ? <TouchControls engine={engineRef} /> : null}
    </div>
  );
}

function TouchControls({ engine }: { engine: React.RefObject<IslandEngine | null> }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  const update = (e: React.PointerEvent) => {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });
    engine.current?.setMobileMove(dx / max, dy / max);
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    engine.current?.setMobileMove(0, 0);
  };

  return (
    <>
      <div
        ref={baseRef}
        className="isl-joy"
        onPointerDown={(e) => {
          active.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e);
        }}
        onPointerMove={(e) => active.current === e.pointerId && update(e)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button
        type="button"
        className="isl-jump"
        onPointerDown={() => engine.current?.setMobileJump(true)}
        onPointerUp={() => engine.current?.setMobileJump(false)}
        onPointerCancel={() => engine.current?.setMobileJump(false)}
        onPointerLeave={() => engine.current?.setMobileJump(false)}
      >
        점프
      </button>
    </>
  );
}
