"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Swords, Trophy, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { ADVANCEMENTS, ADV_BY_ID, type AdvId } from "@/lib/world/advancements";
import { MAZE_START, TREASURE_PER_DAY, kstDay, treasureSpotsForDay, type GameRegion } from "@/lib/world/games";
import { blip } from "@/components/shop/diamond-mine";
import type { WorldEngine } from "./world-engine";
import type { DuelEvent, DuelTop, WorldNet } from "./world-net";
import { textureUrl, tokenUrl } from "./pixel-art";

export type GameGui = "duel" | "adv" | "maze";

type MazeTop = { n: string; ms: number }[];
type MazeResult = { ms: number; best: number; rank: number | null; gained: number; top: MazeTop };
type DuelInfo = Extract<DuelEvent, { t: "dtop" }>;

export type GameHandlers = {
  onRegion: (r: GameRegion) => void;
  onMazeStart: () => void;
  onMazeGoal: () => void;
  onMazeCancel: () => void;
  onTreasure: (spot: number) => void;
  onTreasureHint: (d: number | null) => void;
  onChallenge: (id: string) => void;
  onDuel: (ev: DuelEvent) => void;
  unlock: (id: AdvId) => void;
  grant: (ids: string[]) => void;
};

export function fmtMs(ms: number) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`;
}

const REGION_TITLE: Record<Exclude<GameRegion, null>, [string, string]> = {
  maze: ["미로 탈출", "매일 자정에 길이 바뀌어요 · 출구는 북쪽 끝"],
  treasure: ["보물섬", "숨겨진 상자 5개를 찾아라 · 탐지기를 따라가요"],
  arena: ["결투장", "3초 뒤 시작 · 경기장 밖으로 나가면 기권"],
  market: ["DOES 계정시장", "점포 앞에 서면 계정 정보가 떠요 · E 로 크게 보기"],
  parkour: ["하늘 파쿠르", "정원 → 무지개 → 네더 → 엔드 → 하늘 · 슬라임은 점프!"],
};

export function useWorldGames(p: {
  shopSlug: string;
  ready: boolean;
  signedIn: boolean;
  adv: Record<string, string> | undefined;
  gui: string | null;
  engineRef: RefObject<WorldEngine | null>;
  netRef: RefObject<WorldNet | null>;
  flash: (msg: string) => void;
  pushFeed: (text: string, tone?: "kill" | "join" | "info") => void;
  showTitle: (main: string, sub: string) => void;
  openGui: (g: GameGui | null) => void;
  setHp: (hp: number) => void;
  onTokens: (tokens: number) => void;
}) {
  const { shopSlug, ready, signedIn, adv, engineRef, netRef, flash, pushFeed, showTitle, openGui, setHp, onTokens } = p;
  const signedRef = useRef(signedIn);
  signedRef.current = signedIn;

  /* ───── 도전 과제 ───── */
  const known = useRef(new Set<string>());
  const synced = useRef(false);
  const pending = useRef(new Set<string>());
  const [advMap, setAdvMap] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<{ key: number; id: string }[]>([]);

  const grant = useCallback((ids: string[]) => {
    const fresh = ids.filter((id) => ADV_BY_ID.has(id) && !known.current.has(id));
    if (!fresh.length) return;
    const now = new Date().toISOString();
    for (const id of fresh) known.current.add(id);
    setAdvMap((m) => ({ ...m, ...Object.fromEntries(fresh.map((id) => [id, m[id] ?? now])) }));
    fresh.forEach((id, i) => {
      const key = Date.now() + i;
      setTimeout(() => {
        setToasts((t) => [...t.slice(-2), { key, id }]);
        blip("totem");
        setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), 5000);
      }, i * 900);
    });
  }, []);

  useEffect(() => {
    if (!adv) return;
    if (!synced.current) {
      synced.current = true;
      for (const id of Object.keys(adv)) known.current.add(id);
      setAdvMap((m) => ({ ...adv, ...m }));
      return;
    }
    setAdvMap((m) => ({ ...adv, ...m }));
    grant(Object.keys(adv));
  }, [adv, grant]);

  const unlock = useCallback(
    (id: AdvId) => {
      if (!signedRef.current || known.current.has(id) || pending.current.has(id)) return;
      pending.current.add(id);
      void fetch("/api/world/advancement", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ id }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ adv?: string[] }>) : null))
        .then((d) => {
          if (d?.adv) grant(d.adv);
          known.current.add(id);
        })
        .catch(() => {})
        .finally(() => pending.current.delete(id));
    },
    [shopSlug, grant],
  );

  /* ───── 공용 시계 (타이머 · 카운트다운) ───── */
  const [now, setNow] = useState(() => Date.now());

  /* ───── 미로 ───── */
  const [region, setRegion] = useState<GameRegion>(null);
  const [mazeAt, setMazeAt] = useState<number | null>(null);
  const mazeAtRef = useRef<number | null>(null);
  mazeAtRef.current = mazeAt;
  const [mazeInfo, setMazeInfo] = useState<{ cleared: boolean; best: number | null; top: MazeTop; tokens: number } | null>(null);
  const [mazeResult, setMazeResult] = useState<MazeResult | null>(null);

  const loadMaze = useCallback(async () => {
    const res = await fetch("/api/world/maze", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    if (res?.ok) setMazeInfo(await res.json());
  }, [shopSlug]);

  /* ───── 보물찾기 ───── */
  const [treasure, setTreasure] = useState<{ found: number[]; claimed: boolean; tokens: number } | null>(null);
  const [hint, setHint] = useState<number | null>(null);
  const treasureBusy = useRef(false);

  const loadTreasure = useCallback(async () => {
    const spots = treasureSpotsForDay(kstDay());
    const res = await fetch("/api/world/treasure", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { found: number[]; claimed: boolean; tokens: number };
      setTreasure(data);
      engineRef.current?.setTreasures(spots, data.found);
    } else engineRef.current?.setTreasures(spots, []);
  }, [shopSlug, engineRef]);

  useEffect(() => {
    if (ready) void loadTreasure();
  }, [ready, loadTreasure]);

  /* ───── 결투 ───── */
  const [duel, setDuel] = useState<{ on: string; start: number; until: number } | null>(null);
  const [queued, setQueued] = useState(false);
  const [duelInfo, setDuelInfo] = useState<DuelInfo | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; n: string; at: number } | null>(null);

  const ticking = mazeAt !== null || duel !== null || challenge !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [ticking]);

  useEffect(() => {
    if (challenge && now - challenge.at > 20_000) setChallenge(null);
  }, [challenge, now]);

  const answer = useCallback(
    (yes: boolean) => {
      if (!challenge) return;
      if (yes) netRef.current?.acceptDuel(challenge.id);
      else netRef.current?.declineDuel(challenge.id);
      setChallenge(null);
    },
    [challenge, netRef],
  );

  useEffect(() => {
    if (!challenge) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "KeyY") answer(true);
      else if (e.code === "KeyN") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [challenge, answer]);

  /* ───── 엔진 · 네트워크 콜백 (항상 최신 상태를 본다) ───── */
  const handlers: GameHandlers = {
    onRegion: (r) => {
      setRegion(r);
      if (r) {
        const [main, sub] = REGION_TITLE[r];
        if (r !== "arena") showTitle(main, sub);
        try {
          const seen = new Set<string>(JSON.parse(localStorage.getItem("mcw-explore") || "[]") as string[]);
          seen.add(r);
          localStorage.setItem("mcw-explore", JSON.stringify([...seen]));
          if (seen.size >= 3) unlock("explorer");
        } catch {
          /* 저장소를 못 쓰면 건너뛴다 */
        }
      }
      if (r === "maze") void loadMaze();
      if (r === "treasure") void loadTreasure();
      if (r !== "treasure") setHint(null);
    },
    onMazeStart: () => {
      setMazeAt(Date.now());
      setMazeResult(null);
      flash("출발! 출구는 북쪽 끝에 있어요");
      if (!signedRef.current) return;
      void fetch("/api/world/maze", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug), body: JSON.stringify({ action: "start" }) }).catch(() => {});
    },
    onMazeCancel: () => setMazeAt(null),
    onMazeGoal: () => {
      const local = mazeAtRef.current ? Date.now() - mazeAtRef.current : 0;
      setMazeAt(null);
      if (!signedRef.current) {
        showTitle("탈출 성공!", `${fmtMs(local)} · 로그인하면 기록이 저장돼요`);
        return;
      }
      void (async () => {
        try {
          const res = await fetch("/api/world/maze", {
            method: "POST",
            credentials: "include",
            headers: shopHeaders(shopSlug),
            body: JSON.stringify({ action: "finish" }),
          });
          const data = (await res.json().catch(() => ({}))) as Partial<MazeResult> & { error?: string; tokens?: number; adv?: string[] };
          if (!res.ok || data.ms === undefined) {
            showTitle("탈출 성공!", `${fmtMs(local)} · ${data.error || "기록을 저장하지 못했어요"}`);
            return;
          }
          blip("totem");
          setMazeResult({ ms: data.ms, best: data.best ?? data.ms, rank: data.rank ?? null, gained: data.gained ?? 0, top: data.top ?? [] });
          setMazeInfo((m) => ({ cleared: true, best: data.best ?? data.ms!, top: data.top ?? m?.top ?? [], tokens: m?.tokens ?? 0 }));
          if (typeof data.tokens === "number") onTokens(data.tokens);
          if (data.gained) pushFeed(`미로 탈출! 토큰 +${data.gained}`, "info");
          openGui("maze");
          grant(data.adv ?? []);
        } catch {
          showTitle("탈출 성공!", fmtMs(local));
        }
      })();
    },
    onTreasure: (spot) => {
      if (!signedRef.current) return flash("로그인하면 보물을 찾을 수 있어요");
      if (treasureBusy.current) return;
      treasureBusy.current = true;
      void (async () => {
        try {
          const res = await fetch("/api/world/treasure", {
            method: "POST",
            credentials: "include",
            headers: shopHeaders(shopSlug),
            body: JSON.stringify({ spot }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            found?: number[];
            total?: number;
            claimed?: boolean;
            gained?: number;
            tokens?: number;
            adv?: string[];
          };
          if (!res.ok || !data.found) return flash(data.error || "상자를 열지 못했어요");
          engineRef.current?.openTreasure(spot);
          blip("break");
          setTreasure((t) => ({ found: data.found!, claimed: Boolean(data.claimed), tokens: t?.tokens ?? 0 }));
          const total = data.total ?? TREASURE_PER_DAY;
          if (data.gained) {
            showTitle("보물 사냥 완료!", `오늘의 상자 ${total}개를 모두 찾았어요 · 토큰 +${data.gained}`);
            pushFeed(`보물찾기 완료! 토큰 +${data.gained}`, "info");
          } else flash(`보물 상자 발견! (${data.found.length}/${total})`);
          if (typeof data.tokens === "number") onTokens(data.tokens);
          grant(data.adv ?? []);
        } catch {
          flash("상자를 열지 못했어요");
        } finally {
          treasureBusy.current = false;
        }
      })();
    },
    onTreasureHint: setHint,
    onChallenge: (id) => {
      if (duel) return;
      netRef.current?.challenge(id);
    },
    onDuel: (ev) => {
      switch (ev.t) {
        case "dq":
          setQueued(ev.on);
          flash(ev.on ? `결투 대기열에 들어갔어요 · ${ev.n}명 대기 중` : "대기열에서 나왔어요");
          return;
        case "dch":
          setChallenge({ id: ev.id, n: ev.n, at: Date.now() });
          setNow(Date.now());
          blip("dig");
          return;
        case "dcs":
          flash(`${ev.n}님에게 결투를 신청했어요`);
          return;
        case "dno":
          flash(
            ev.busy
              ? `${ev.n ?? "상대"}님은 지금 결투 중이에요`
              : ev.expired
                ? "결투 신청이 만료됐어요"
                : ev.gone
                  ? "상대가 떠났어요"
                  : `${ev.n ?? "상대"}님이 결투를 거절했어요`,
          );
          return;
        case "dfull":
          flash("결투장 3곳이 모두 사용 중이에요. 잠시 뒤 다시 시도해 주세요");
          return;
        case "dstart": {
          const t = Date.now();
          openGui(null);
          setChallenge(null);
          setQueued(false);
          setHp(ev.hp);
          setDuel({ on: ev.on, start: t + ev.delay, until: t + ev.delay + ev.limit });
          setNow(t);
          engineRef.current?.startDuel(ev.slot, ev.side, ev.opp, ev.delay);
          return;
        }
        case "dend": {
          engineRef.current?.endDuel();
          setDuel(null);
          setHp(ev.hp);
          const record = `${ev.w}승 ${ev.l}패`;
          if (ev.draw) showTitle("무승부", `시간 종료 · 남은 체력이 같아요 · ${record}`);
          else if (ev.win) {
            const why =
              ev.reason === "ko" ? `${ev.ln}님을 쓰러뜨렸어요` : ev.reason === "time" ? "시간 종료 · 체력 판정승" : ev.reason === "out" ? "상대가 경기장을 벗어났어요" : "상대가 나갔어요";
            showTitle("승리!", `${why} · ${record}${ev.streak >= 2 ? ` · ${ev.streak}연승` : ""}`);
            blip("totem");
            unlock("duel");
            if (ev.streak >= 3) unlock("duel3");
          } else {
            const why = ev.reason === "ko" ? `${ev.wn}님에게 졌어요` : ev.reason === "time" ? "시간 종료 · 체력 판정패" : "경기장을 벗어나 기권패";
            showTitle("패배", `${why} · ${record}`);
          }
          return;
        }
        case "dfeed":
          if (ev.k === "start") pushFeed(`${ev.a} vs ${ev.b} 결투 시작!`, "info");
          else if (ev.k === "draw") pushFeed(`${ev.a} vs ${ev.b} 결투 무승부`, "info");
          else pushFeed(`${ev.a}님이 결투에서 ${ev.b}님을 이겼어요${(ev.streak ?? 0) >= 2 ? ` (${ev.streak}연승)` : ""}`, "kill");
          return;
        case "dtop":
          setDuelInfo(ev);
          setQueued(ev.q);
          return;
      }
    },
    unlock,
    grant,
  };
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  /** 엔진 · 네트워크에 한 번만 넘기는 고정 함수들 */
  const stable = useMemo<GameHandlers>(
    () => ({
      onRegion: (r) => handlersRef.current.onRegion(r),
      onMazeStart: () => handlersRef.current.onMazeStart(),
      onMazeGoal: () => handlersRef.current.onMazeGoal(),
      onMazeCancel: () => handlersRef.current.onMazeCancel(),
      onTreasure: (s) => handlersRef.current.onTreasure(s),
      onTreasureHint: (d) => handlersRef.current.onTreasureHint(d),
      onChallenge: (id) => handlersRef.current.onChallenge(id),
      onDuel: (ev) => handlersRef.current.onDuel(ev),
      unlock: (id) => handlersRef.current.unlock(id),
      grant: (ids) => handlersRef.current.grant(ids),
    }),
    [],
  );

  const openDuel = useCallback(() => {
    netRef.current?.duelTop();
    openGui("duel");
  }, [netRef, openGui]);

  const retryMaze = useCallback(() => {
    openGui(null);
    engineRef.current?.teleport(MAZE_START.x, MAZE_START.y, MAZE_START.z, MAZE_START.yaw);
  }, [engineRef, openGui]);

  const found = treasure?.found.length ?? 0;
  const layer = (
    <>
      {mazeAt !== null && region === "maze" ? (
        <div className="mcw-game-hud is-maze">
          <small>미로 탈출</small>
          <b>{fmtMs(now - mazeAt)}</b>
          {mazeInfo?.best ? <span>오늘 최고 {fmtMs(mazeInfo.best)}</span> : null}
        </div>
      ) : region === "maze" && mazeInfo ? (
        <div className="mcw-game-hud is-maze">
          <small>오늘의 미로</small>
          <b>{mazeInfo.top[0] ? `1위 ${fmtMs(mazeInfo.top[0].ms)}` : "첫 탈출에 도전!"}</b>
          <span>{mazeInfo.cleared ? `내 최고 ${mazeInfo.best ? fmtMs(mazeInfo.best) : "-"}` : `첫 탈출 시 토큰 +${mazeInfo.tokens}`}</span>
        </div>
      ) : null}

      {region === "treasure" ? <TreasureHud found={found} claimed={Boolean(treasure?.claimed)} hint={hint} tokens={treasure?.tokens ?? 0} /> : null}

      {duel ? <DuelBar duel={duel} now={now} /> : null}

      <div className="mcw-adv-toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => {
            const a = ADV_BY_ID.get(t.id);
            if (!a) return null;
            return (
              <motion.div
                key={t.key}
                className="mcw-adv-toast"
                initial={{ x: 320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 320, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={textureUrl(a.icon)} alt="" />
                <div>
                  <small>도전 과제 달성!</small>
                  <b>{a.title}</b>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {challenge && !duel ? (
        <div className="mcw-challenge">
          <Swords />
          <div>
            <b>{challenge.n}</b>님이 1:1 결투를 신청했어요
            <small>{Math.max(0, Math.ceil((20_000 - (now - challenge.at)) / 1000))}초 안에 응답</small>
          </div>
          <button type="button" className="is-yes" onClick={() => answer(true)}>
            수락 <kbd>Y</kbd>
          </button>
          <button type="button" className="is-no" onClick={() => answer(false)}>
            거절 <kbd>N</kbd>
          </button>
        </div>
      ) : null}

      {p.gui === "duel" ? (
        <DuelGui
          info={duelInfo}
          queued={queued}
          engine={engineRef}
          onQueue={() => netRef.current?.duelQueue()}
          onChallenge={(id) => {
            netRef.current?.challenge(id);
            openGui(null);
          }}
          onClose={() => openGui(null)}
        />
      ) : null}
      {p.gui === "adv" ? <AdvGui got={advMap} onClose={() => openGui(null)} /> : null}
      {p.gui === "maze" && mazeResult ? <MazeResultGui result={mazeResult} onRetry={retryMaze} onClose={() => openGui(null)} /> : null}
    </>
  );

  return { handlers: stable, layer, region, inDuel: duel !== null, openDuel, advCount: Object.keys(advMap).length };
}

/* ───────────── HUD ───────────── */

function TreasureHud({ found, claimed, hint, tokens }: { found: number; claimed: boolean; hint: number | null; tokens: number }) {
  const heat = hint === null || hint < 0 ? 0 : Math.max(0, Math.min(1, 1 - (hint - 2) / 20));
  const label =
    hint === -1 || claimed
      ? "오늘 보물을 모두 찾았어요!"
      : hint === null
        ? "탐지기 준비 중"
        : hint < 4
          ? "아주 뜨거워요! 바로 근처예요"
          : hint < 8
            ? "뜨거워요"
            : hint < 14
              ? "미지근해요"
              : "차가워요";
  return (
    <div className="mcw-game-hud is-treasure">
      <small>보물찾기</small>
      <b>
        {found}/{TREASURE_PER_DAY}
        {!claimed && tokens > 0 ? (
          <em>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tokenUrl()} alt="" />+{tokens}
          </em>
        ) : null}
      </b>
      <div className="mcw-heat" aria-hidden>
        <i style={{ width: `${Math.round(heat * 100)}%` }} />
      </div>
      <span className={hint !== null && hint >= 0 && hint < 4 ? "is-hot" : ""}>{label}</span>
    </div>
  );
}

function DuelBar({ duel, now }: { duel: { on: string; start: number; until: number }; now: number }) {
  const before = duel.start - now;
  const left = duel.until - now;
  return (
    <>
      <div className="mcw-duel-bar">
        <Swords />
        <span>
          vs <b>{duel.on}</b>
        </span>
        <em className={left < 15_000 && before <= 0 ? "is-low" : ""}>{before > 0 ? "준비" : fmtMs(left).replace(/\.\d$/, "")}</em>
      </div>
      {before > -800 ? (
        <div key={before > 0 ? Math.ceil(before / 1000) : "go"} className={`mcw-countdown ${before <= 0 ? "is-go" : ""}`}>
          {before > 0 ? Math.ceil(before / 1000) : "싸워라!"}
        </div>
      ) : null}
    </>
  );
}

/* ───────────── GUI ───────────── */

function Back({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="mcw-gui-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`mcw-gui ${wide ? "is-wide" : ""}`}>{children}</div>
    </div>
  );
}

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mcw-gui-head">
      <b>{title}</b>
      <button type="button" onClick={onClose} aria-label="닫기">
        <X />
      </button>
    </div>
  );
}

function DuelGui({
  info,
  queued,
  engine,
  onQueue,
  onChallenge,
  onClose,
}: {
  info: DuelInfo | null;
  queued: boolean;
  engine: RefObject<WorldEngine | null>;
  onQueue: () => void;
  onChallenge: (id: string) => void;
  onClose: () => void;
}) {
  const [near, setNear] = useState<{ id: string; name: string; dist: number }[]>([]);
  useEffect(() => {
    const read = () => setNear(engine.current?.nearbyPlayers() ?? []);
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [engine]);
  const top: DuelTop[] = info?.top ?? [];
  return (
    <Back onClose={onClose}>
      <Head title="1:1 결투" onClose={onClose} />
      <div className="mcw-duel-me">
        <Swords />
        <div>
          <b>
            {info ? `${info.me.w}승 ${info.me.l}패` : "기록 불러오는 중"}
            {info && info.me.s >= 2 ? <em>{info.me.s}연승 중</em> : null}
          </b>
          <small>
            {info ? `최고 ${info.me.b}연승 · 진행 중 ${info.live}/${info.slots} · 대기 ${info.n}명` : "\u00a0"}
          </small>
        </div>
      </div>
      <button type="button" className={`mc-btn ${queued ? "is-on" : ""}`} onClick={onQueue}>
        {queued ? "매칭 대기 중… (눌러서 취소)" : "랜덤 상대와 매칭하기"}
      </button>

      <div className="mcw-divider" />
      <p className="mcw-label">근처 플레이어에게 직접 신청</p>
      {near.length ? (
        <ul className="mcw-duel-near">
          {near.slice(0, 6).map((r) => (
            <li key={r.id}>
              <span>{r.name}</span>
              <small>{Math.round(r.dist)}m</small>
              <button type="button" onClick={() => onChallenge(r.id)}>
                신청
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mcw-empty">주변에 다른 플레이어가 없어요. 광장에서 상대를 우클릭해도 신청할 수 있어요.</p>
      )}

      <div className="mcw-divider" />
      <p className="mcw-label">
        <Trophy size={14} /> 결투 랭킹
      </p>
      {top.length ? (
        <ol className="mcw-rank">
          {top.map((r, i) => (
            <li key={`${r.n}${i}`}>
              <i>{i + 1}</i>
              <span>{r.n}</span>
              <b>
                {r.w}승 {r.l}패
              </b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mcw-empty">아직 기록이 없어요. 첫 승리의 주인공이 되어 보세요!</p>
      )}
      <ul className="mcw-help is-tips">
        <li>3초 카운트다운 뒤 시작 · 체력 20 · 2분 제한</li>
        <li>시간이 끝나면 남은 체력이 많은 쪽이 승리</li>
        <li>경기장 밖으로 나가거나 접속을 끊으면 기권패</li>
        <li>보상 없는 순수 실력 대결이에요</li>
      </ul>
    </Back>
  );
}

function AdvGui({ got, onClose }: { got: Record<string, string>; onClose: () => void }) {
  const done = ADVANCEMENTS.filter((a) => got[a.id]).length;
  return (
    <Back onClose={onClose} wide>
      <Head title={`도전 과제 · ${done}/${ADVANCEMENTS.length}`} onClose={onClose} />
      <div className="mcw-adv-progress" aria-hidden>
        <i style={{ width: `${(done / ADVANCEMENTS.length) * 100}%` }} />
      </div>
      <ul className="mcw-adv-list">
        {ADVANCEMENTS.map((a) => {
          const at = got[a.id];
          return (
            <li key={a.id} className={at ? "is-done" : ""}>
              <span className="mcw-adv-icon">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={textureUrl(a.icon)} alt="" />
                {!at ? <Lock /> : null}
              </span>
              <div>
                <b>{a.title}</b>
                <small>{a.desc}</small>
              </div>
              {at ? <time>{new Date(at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}</time> : null}
            </li>
          );
        })}
      </ul>
    </Back>
  );
}

function MazeResultGui({ result, onRetry, onClose }: { result: MazeResult; onRetry: () => void; onClose: () => void }) {
  return (
    <Back onClose={onClose}>
      <Head title="미로 탈출 성공!" onClose={onClose} />
      <div className="mcw-maze-hero">
        <small>이번 기록</small>
        <b>{fmtMs(result.ms)}</b>
        <span>
          오늘 최고 {fmtMs(result.best)}
          {result.rank ? ` · 오늘 ${result.rank}위` : ""}
        </span>
        {result.gained ? (
          <em>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tokenUrl()} alt="" /> 토큰 +{result.gained}
          </em>
        ) : null}
      </div>
      <p className="mcw-label">
        <Trophy size={14} /> 오늘의 미로 랭킹
      </p>
      <ol className="mcw-rank">
        {result.top.map((r, i) => (
          <li key={`${r.n}${i}`} className={result.rank === i + 1 ? "is-me" : ""}>
            <i>{i + 1}</i>
            <span>{r.n}</span>
            <b>{fmtMs(r.ms)}</b>
          </li>
        ))}
      </ol>
      <button type="button" className="mc-btn" onClick={onRetry}>
        다시 도전
      </button>
    </Back>
  );
}
