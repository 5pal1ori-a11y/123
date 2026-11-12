"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Boxes, Check, ChevronDown, Compass, Eye, HelpCircle, Loader2, LogOut, MapPin, MessageCircle, Store, Swords, Trophy, X } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";
import { useShopUser } from "@/components/shop/user-context";
import { itemIcon } from "@/components/shop/island/island-world";
import {
  BUILD_ITEM_IDS,
  ITEMS,
  REWARD_ITEM_IDS,
  STARTER_ALLOWANCE,
  STARTER_BLOCKS,
  inventoryOf,
  type Allowance,
  type IslandView,
  type ItemId,
  type PlacedBlock,
} from "@/lib/island/world";
import type { MissionStatus, PublicCoupon, PublicRecipe } from "@/lib/world/server";
import type { InteractKind, MarketAccount, SignTexts, WorldEngine, Zone } from "./world-engine";
import { WorldNet, type ChatLine, type NetStatus } from "./world-net";
import { heartUrl, tokenUrl } from "./pixel-art";
import {
  AccountDetail,
  AttendGui,
  CouponPopup,
  CraftingGui,
  DeathScreen,
  MissionGui,
  StallCard,
  fetchGalleryAccounts,
  type GalleryAccount,
  type TokenLog,
} from "./world-guis";
import { useWorldGames, type GameGui } from "./world-games";
import { TotemOverlay, blip } from "@/components/shop/diamond-mine";
import type { GiftState } from "@/components/shop/random-box-gift";
import { formatKRW } from "@/lib/utils";
import { setGuestMode } from "@/lib/guest-mode";

type Me = {
  user: { id: string; name: string; discordId: string | null; points: number };
  tokens: number;
  mission: MissionStatus;
  coupon: PublicCoupon | null;
  couponAvailable: boolean;
  couponAmount: number;
  couponMinutes: number;
  parkourToday: boolean;
  log: TokenLog[];
  recipes: PublicRecipe[];
  adv?: Record<string, string>;
};

type Gui = "crafting" | "mission" | "account" | "help" | "attend" | "palette" | GameGui | null;
type Feed = { id: number; text: string; tone?: "kill" | "join" | "info" };
type SaveState = "idle" | "saving" | "saved" | "error";
type Chat = ChatLine & { id: number };
type Bar = (ItemId | null)[];

const BAR_FILL: ItemId[] = ["stone", "oak_planks", "cobble", "glass", "oak_log", "bricks", "sea_lantern", "poppy", "wool_white"];
const barKey = (shop: string) => `does-hotbar:${shop}`;
const usable = (id: ItemId | null, allowance: Allowance): id is ItemId =>
  Boolean(id && ITEMS[id] && (ITEMS[id].free || (allowance[id] ?? 0) > 0));

function defaultBar(allowance: Allowance): Bar {
  const bar: ItemId[] = REWARD_ITEM_IDS.filter((id) => (allowance[id] ?? 0) > 0).slice(0, 5);
  for (const id of BAR_FILL) if (bar.length < 9 && !bar.includes(id)) bar.push(id);
  return bar;
}

function signTexts(island: IslandView | null, me: Me | null): SignTexts {
  const s = island?.stats;
  return {
    owner: island ? [`${island.owner.name}의 섬`, `Lv.${island.level}`] : ["DOES MC", "하늘섬"],
    stats: s ? [`다이아 ${s.orders} · 나무 ${s.reviews}`, `잔디 ${s.attendance} · 장식 ${s.events}`] : ["출석 → 잔디", "후기 → 나무"],
    parkour: ["파쿠르는 메인 광장", me?.couponAvailable ? `완주 시 ${me.couponAmount.toLocaleString()}원 쿠폰` : "하늘색 정자로!"],
    portal: ["워프 정자 →", "메인 광장"],
  };
}

export function WorldClient({ shopSlug }: { shopSlug: string }) {
  const router = useRouter();
  const { refresh, user: shopUser, loading: userLoading, logout } = useShopUser();
  const mcUuid = shopUser?.minecraftUuid ?? null;
  const [loggingOut, setLoggingOut] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const netRef = useRef<WorldNet | null>(null);
  const myIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedId = useRef(0);
  const parkourAt = useRef(0);
  const swingAt = useRef(0);
  const meRef = useRef<Me | null>(null);

  const [island, setIsland] = useState<IslandView | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocks, setBlocks] = useState<PlacedBlock[]>(STARTER_BLOCKS);
  const [bar, setBar] = useState<Bar>([]);
  const [slot, setSlot] = useState(0);
  const barReady = useRef(false);
  const [chat, setChat] = useState<Chat[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const chatId = useRef(0);
  const chatInput = useRef<HTMLInputElement>(null);
  const sentRef = useRef<string[]>([]);
  const sentIdx = useRef(-1);
  const [mobileTool, setMobileTool] = useState<"place" | "break">("place");
  const [zone, setZone] = useState<Zone>("island");
  const [firstPerson, setFirstPerson] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gui, setGui] = useState<Gui>(null);
  const [coupon, setCoupon] = useState<PublicCoupon | null>(null);
  const [hp, setHp] = useState(20);
  const [hurtFlash, setHurtFlash] = useState(0);
  const [dead, setDead] = useState<{ killer: string | null } | null>(null);
  const [online, setOnline] = useState(0);
  const [net, setNet] = useState<NetStatus>("connecting");
  const [feed, setFeed] = useState<Feed[]>([]);
  const [save, setSave] = useState<SaveState>("idle");
  const [touch, setTouch] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  /** 계정 시장: 진열 계정 · 지금 서 있는 진열대 · 상세 창으로 연 점포 */
  const [market, setMarket] = useState<{ accounts: GalleryAccount[]; hypixel: boolean } | null>(null);
  const [stall, setStall] = useState<number | null>(null);
  const [stallOpen, setStallOpen] = useState<number | null>(null);
  const marketAt = useRef(0);
  const loadMarketRef = useRef<() => void>(() => {});

  meRef.current = me;
  const editable = Boolean(island?.mine);
  const allowance = island?.allowance ?? STARTER_ALLOWANCE;
  const inventory = useMemo(() => inventoryOf(allowance, blocks), [allowance, blocks]);
  const hotbar = useMemo(() => Array.from({ length: 9 }, (_, i) => (usable(bar[i] ?? null, allowance) ? bar[i]! : null)), [bar, allowance]);
  const selected = hotbar[slot] ?? null;

  /* 핫바 구성은 기기에 저장 — 처음엔 보상 아이템 + 기본 건축 블록 */
  useEffect(() => {
    if (!loaded || barReady.current) return;
    barReady.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(barKey(shopSlug)) || "null") as unknown;
      if (Array.isArray(saved) && saved.length === 9) {
        setBar(saved.map((id) => (typeof id === "string" && id in ITEMS ? (id as ItemId) : null)));
        return;
      }
    } catch {
      /* 기본값 */
    }
    setBar(defaultBar(allowance));
  }, [loaded, allowance, shopSlug]);

  useEffect(() => {
    if (!barReady.current || bar.length !== 9) return;
    try {
      localStorage.setItem(barKey(shopSlug), JSON.stringify(bar));
    } catch {
      /* 저장 공간 없음 */
    }
  }, [bar, shopSlug]);

  const putInBar = useCallback(
    (id: ItemId) => {
      setBar((prev) => {
        const next = Array.from({ length: 9 }, (_, i) => prev[i] ?? null);
        const at = next.indexOf(id);
        if (at >= 0 && at !== slot) next[at] = next[slot] ?? null;
        next[slot] = id;
        return next;
      });
    },
    [slot],
  );

  const pushChat = useCallback((lines: ChatLine[], replace = false) => {
    const tagged = lines.map((l) => ({ ...l, id: ++chatId.current }));
    setChat((c) => (replace ? tagged : [...c, ...tagged]).slice(-60));
  }, []);
  const sys = useCallback((m: string) => pushChat([{ n: "", m, at: Date.now(), sys: true }]), [pushChat]);

  const [unread, setUnread] = useState(0);
  const chatOpenRef = useRef(false);
  const ownSent = useRef<{ m: string; at: number }[]>([]);
  const lastPing = useRef(0);
  const notifyChat = useCallback((lines: ChatLine[]) => {
    const now = Date.now();
    ownSent.current = ownSent.current.filter((s) => now - s.at < 8000);
    const others = lines.filter((l) => {
      if (l.sys) return false;
      const i = ownSent.current.findIndex((s) => s.m === l.m);
      if (i < 0) return true;
      ownSent.current.splice(i, 1);
      return false;
    });
    if (!others.length) return;
    if (!chatOpenRef.current || document.hidden) setUnread((u) => Math.min(99, u + others.length));
    if (now - lastPing.current > 1500) {
      lastPing.current = now;
      chatPing();
    }
  }, []);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2400);
  }, []);

  const [title, setTitle] = useState<{ key: number; main: string; sub: string } | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTitle = useCallback((main: string, sub: string) => {
    setTitle({ key: Date.now(), main, sub });
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => setTitle(null), 4300);
  }, []);

  const pushFeed = useCallback((text: string, tone?: Feed["tone"]) => {
    const id = ++feedId.current;
    setFeed((f) => [...f.slice(-5), { id, text, tone }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 7000);
  }, []);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/world/me", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Me;
    setMe(data);
    return data;
  }, [shopSlug]);

  /* 첫 로딩: 내 섬(또는 ?island= 친구 섬) + 월드 정보 */
  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
    const target = new URLSearchParams(window.location.search).get("island");
    void (async () => {
      try {
        const qs = target ? `?u=${encodeURIComponent(target)}` : "";
        const [islandRes] = await Promise.all([
          fetch(`/api/island${qs}`, { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" }),
          loadMe().catch(() => null),
        ]);
        if (islandRes.ok) {
          const data = (await islandRes.json()) as { island?: IslandView };
          if (data.island) {
            setIsland(data.island);
            setBlocks(data.island.blocks);
          }
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, [shopSlug, loadMe]);

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
          setIsland(data.island);
          setTimeout(() => setSave((s) => (s === "saved" ? "idle" : s)), 1600);
        } catch (err) {
          setSave("error");
          flash(err instanceof Error ? err.message : "저장 실패");
        }
      }, 900);
    },
    [shopSlug, flash],
  );

  const parkourStart = useCallback(() => {
    const now = Date.now();
    if (now - parkourAt.current < 3000) return;
    parkourAt.current = now;
    void fetch("/api/world/parkour", {
      method: "POST",
      credentials: "include",
      headers: shopHeaders(shopSlug),
      body: JSON.stringify({ action: "start" }),
    }).catch(() => {});
    flash("파쿠르 시작! 정상의 신호기까지 올라가세요");
  }, [shopSlug, flash]);

  const parkourGoal = useCallback(async () => {
    try {
      const res = await fetch("/api/world/parkour", {
        method: "POST",
        credentials: "include",
        headers: shopHeaders(shopSlug),
        body: JSON.stringify({ action: "finish" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; seconds?: number; coupon?: PublicCoupon | null; fresh?: boolean };
      if (!res.ok) {
        flash(data.error || "기록을 확인하지 못했어요");
        return;
      }
      pushFeed(`파쿠르 완주! (${data.seconds ?? 0}초)`, "info");
      if (data.coupon && !data.coupon.usedAt && new Date(data.coupon.expiresAt).getTime() > Date.now()) setCoupon(data.coupon);
      else if (data.coupon) flash("쿠폰은 계정당 한 번만 받을 수 있어요");
      else flash("정상 도착! 클리어 🎉");
      void loadMe();
    } catch {
      flash("기록을 확인하지 못했어요");
    }
  }, [shopSlug, flash, pushFeed, loadMe]);

  const openGui = useCallback((g: Gui) => {
    setGui(g);
    if (g !== null) setChatOpen(false);
    engineRef.current?.setInputEnabled(g === null);
  }, []);

  const openChat = useCallback((prefill = "") => {
    setChatText(prefill);
    sentIdx.current = -1;
    setChatOpen(true);
    setUnread(0);
    engineRef.current?.setInputEnabled(false);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    setChatText("");
    engineRef.current?.setInputEnabled(true);
  }, []);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    const apply = () => {
      document.title = unread > 0 && document.hidden ? `(${unread > 9 ? "9+" : unread}) ${base}` : base;
    };
    const onVisible = () => {
      apply();
      if (!document.hidden && chatOpenRef.current) setUnread(0);
    };
    apply();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.title = base;
    };
  }, [unread]);

  useEffect(() => {
    if (chatOpen) chatInput.current?.focus();
  }, [chatOpen]);

  /** 섬을 바꿔 끼우고 섬 입구로 이동 (엔진은 그대로) */
  const enterIsland = useCallback(
    (v: IslandView) => {
      setIsland(v);
      setBlocks(v.blocks);
      const e = engineRef.current;
      if (e) {
        e.setEditable(v.mine);
        e.setBlocks(v.blocks);
        e.goIsland();
      }
      const url = new URL(window.location.href);
      if (v.mine) url.searchParams.delete("island");
      else url.searchParams.set("island", v.userId);
      window.history.replaceState(window.history.state, "", url);
      showTitle(v.mine ? "내 섬" : `${v.owner.name}의 섬`, v.mine ? "집에 돌아왔어요" : "섬 구경 중 · /내섬 으로 돌아가기");
    },
    [showTitle],
  );

  const runCommand = useCallback(
    async (line: string) => {
      const [cmd = "", ...rest] = line.slice(1).trim().split(/\s+/);
      const arg = rest.join(" ").replace(/^@/, "").trim();
      const c = cmd.toLowerCase();
      if (c === "섬방문" || c === "방문" || c === "visit") {
        if (!arg) return sys("사용법: /섬방문 @닉네임");
        sys(`${arg}님의 섬을 찾는 중…`);
        try {
          const res = await fetch(`/api/island?u=${encodeURIComponent(arg)}`, {
            credentials: "include",
            headers: shopHeaders(shopSlug, false),
            cache: "no-store",
          });
          const data = (await res.json().catch(() => ({}))) as { island?: IslandView };
          if (!res.ok || !data.island) return sys(`'${arg}' 유저의 섬을 찾지 못했어요`);
          enterIsland(data.island);
          sys(data.island.mine ? "내 섬으로 왔어요" : `${data.island.owner.name}님의 섬에 놀러 왔어요`);
        } catch {
          sys("섬을 불러오지 못했어요");
        }
        return;
      }
      if (c === "내섬" || c === "home") {
        try {
          const res = await fetch("/api/island", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" });
          const data = (await res.json().catch(() => ({}))) as { island?: IslandView };
          if (res.status === 401) return sys("로그인하면 내 섬이 생겨요");
          if (!res.ok || !data.island) return sys("내 섬을 불러오지 못했어요");
          enterIsland(data.island);
        } catch {
          sys("내 섬을 불러오지 못했어요");
        }
        return;
      }
      if (c === "광장" || c === "spawn") {
        engineRef.current?.goPlaza();
        return;
      }
      if (c === "야생" || c === "wild") {
        router.push("/wild");
        return;
      }
      if (c === "광산" || c === "mine") {
        router.push("/mine");
        return;
      }
      if (c === "스킨" || c === "skin") {
        if (!meRef.current?.user) return sys("로그인하면 스킨을 등록할 수 있어요");
        if (!arg) return sys("사용법: /스킨 자바닉네임  (예: /스킨 Notch)");
        sys(`${arg} 스킨을 찾는 중…`);
        try {
          const res = await fetch("/api/user/minecraft", {
            method: "POST",
            credentials: "include",
            headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
            body: JSON.stringify({ name: arg }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string; user?: { minecraftName?: string | null } };
          if (!res.ok) return sys(data.error ?? "스킨을 등록하지 못했어요");
          sys(`스킨을 ${data.user?.minecraftName ?? arg}(으)로 바꿨어요`);
          await refresh();
        } catch {
          sys("스킨을 등록하지 못했어요");
        }
        return;
      }
      if (c === "도움말" || c === "help" || c === "명령어") {
        sys("/섬방문 @닉네임 · 그 유저의 섬으로 이동");
        sys("/내섬 · 내 섬으로  /광장 · 메인 광장으로");
        sys("/스킨 자바닉네임 · 그 닉네임의 스킨 입기");
        sys("/야생 · 야생 마인크래프트  /광산 · 오늘의 광물 캐기 대회");
        return;
      }
      sys(`알 수 없는 명령어예요: /${cmd} (/도움말)`);
    },
    [shopSlug, sys, enterIsland],
  );

  const submitChat = useCallback(() => {
    const text = chatText.trim();
    closeChat();
    if (!text) return;
    sentRef.current = [text, ...sentRef.current.filter((t) => t !== text)].slice(0, 20);
    if (text.startsWith("/")) {
      void runCommand(text);
      return;
    }
    if (!meRef.current?.user) return sys("로그인하면 채팅할 수 있어요");
    if (!netRef.current?.sendChat(text)) sys("채팅 서버에 연결되지 않았어요");
    else ownSent.current.push({ m: text.slice(0, 100), at: Date.now() });
  }, [chatText, closeChat, runCommand, sys]);

  const games = useWorldGames({
    shopSlug,
    ready,
    signedIn: Boolean(me?.user),
    adv: me?.adv,
    gui,
    engineRef,
    netRef,
    flash,
    pushFeed,
    showTitle,
    openGui,
    setHp,
    onTokens: (tokens) => setMe((m) => (m ? { ...m, tokens } : m)),
  });
  const { handlers: gameHandlers, openDuel } = games;
  const unlock = gameHandlers.unlock;

  useEffect(() => {
    if (ready && me?.user) unlock("welcome");
  }, [ready, me?.user, unlock]);

  useEffect(() => {
    if (ready && mcUuid) engineRef.current?.setPlayerSkin(`/api/world/skin?uuid=${mcUuid}`);
  }, [ready, mcUuid]);

  const skinHinted = useRef(false);
  useEffect(() => {
    if (!ready || userLoading || !me?.user || mcUuid || skinHinted.current) return;
    skinHinted.current = true;
    sys("스킨이 기본 모습이면 채팅에 /스킨 자바닉네임 을 입력해 보세요 (예: /스킨 Notch)");
  }, [ready, userLoading, me?.user, mcUuid, sys]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setGuestMode(shopSlug, false);
      window.location.href = "/main";
    }
  }, [loggingOut, logout, shopSlug]);

  /* 출석 광산: 광장 북쪽 다이아 원석을 캐면 오늘의 출석 보상 */
  const [attend, setAttend] = useState<GiftState | null>(null);
  const [attendLogin, setAttendLogin] = useState(false);
  const [attendFresh, setAttendFresh] = useState(false);
  const [totem, setTotem] = useState<{ key: number; jackpot: boolean } | null>(null);
  const attendRef = useRef<GiftState | null>(null);
  const attendLoginRef = useRef(false);
  const attendBusy = useRef(false);
  attendRef.current = attend;
  attendLoginRef.current = attendLogin;

  const loadAttend = useCallback(async () => {
    try {
      const res = await fetch("/api/gift/random-box", { credentials: "include", headers: shopHeaders(shopSlug, false), cache: "no-store" });
      if (res.status === 401) {
        setAttendLogin(true);
        return;
      }
      if (!res.ok) return;
      setAttendLogin(false);
      setAttend((await res.json()) as GiftState);
    } catch {
      /* 원석 라벨만 기본값으로 둔다 */
    }
  }, [shopSlug]);

  const finishAttend = useCallback(async () => {
    blip("break");
    try {
      const res = await fetch("/api/gift/random-box", { method: "POST", credentials: "include", headers: shopHeaders(shopSlug) });
      const data = (await res.json().catch(() => ({}))) as GiftState & { error?: string };
      if (res.status === 401) {
        setAttendLogin(true);
        throw new Error("로그인하면 출석 다이아를 캘 수 있어요");
      }
      if (!res.ok) throw new Error(data.error || "다이아몬드를 캘 수 없어요");
      setAttend(data);
      setAttendFresh(!data.already);
      if (!data.already) pushFeed(`출석 다이아 +${formatKRW(data.amount ?? 0)}${data.jackpot ? " · 잭팟!" : ""}`, "info");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || data.already) openGui("attend");
      else setTotem({ key: Date.now(), jackpot: data.jackpot });
      void refresh();
      void loadMe();
    } catch (err) {
      flash(err instanceof Error ? err.message : "다이아몬드를 캘 수 없어요");
    } finally {
      attendBusy.current = false;
    }
  }, [shopSlug, flash, pushFeed, openGui, refresh, loadMe]);

  const totemDone = useCallback(() => {
    setTotem(null);
    openGui("attend");
  }, [openGui]);

  const startAttend = useCallback(() => {
    if (attendRef.current?.claimed) {
      setAttendFresh(false);
      openGui("attend");
      return;
    }
    if (attendLoginRef.current) {
      flash("로그인하면 출석 다이아를 캘 수 있어요");
      return;
    }
    if (attendBusy.current) return;
    if (engineRef.current?.mineOre(() => void finishAttend())) attendBusy.current = true;
  }, [openGui, flash, finishAttend]);
  const startAttendRef = useRef(startAttend);
  startAttendRef.current = startAttend;

  useEffect(() => {
    if (ready) void loadAttend();
  }, [ready, loadAttend]);

  useEffect(() => {
    if (attend?.claimed) unlock("miner");
    if ((attend?.history?.streak ?? 0) >= 7) unlock("streak7");
  }, [attend, unlock]);

  /* 광장 게시판: 재고현황 (1분) · 최근 후기 (5분) */
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    type P = { name: string; price: number; availableCount?: number; stockStatus?: string; stockBoardHidden?: boolean; fulfillment?: string };
    type R = { displayName: string; rating: number | null; body: string; product: string | null; createdAt: string };
    const loadStock = async () => {
      const res = await fetch("/api/products", { headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
      if (!alive || !res?.ok) return;
      const data = (await res.json().catch(() => null)) as { products?: P[] } | null;
      const list = (data?.products ?? [])
        .filter((p) => !p.stockBoardHidden)
        .map((p) => ({
          name: p.name,
          price: p.price,
          count: p.availableCount ?? 0,
          manual: p.fulfillment === "manual",
          status: (p.stockStatus === "sold_out" || p.stockStatus === "low_stock" ? p.stockStatus : "in_stock") as "in_stock" | "low_stock" | "sold_out",
        }))
        .sort((a, b) => Number(a.status === "sold_out" && !a.manual) - Number(b.status === "sold_out" && !b.manual));
      engineRef.current?.setStockBoard(list);
    };
    const loadReviews = async () => {
      const res = await fetch("/api/reviews/feed?limit=12", { headers: shopHeaders(shopSlug, false), cache: "no-store" }).catch(() => null);
      if (!alive || !res?.ok) return;
      const data = (await res.json().catch(() => null)) as { items?: R[]; total?: number; average?: number | null } | null;
      if (!data) return;
      engineRef.current?.setReviewBoard({
        items: (data.items ?? []).map((r) => ({ name: r.displayName, rating: r.rating, body: r.body, product: r.product, createdAt: r.createdAt })),
        total: data.total ?? data.items?.length ?? 0,
        average: data.average ?? null,
      });
    };
    void loadStock();
    void loadReviews();
    const a = setInterval(() => void loadStock(), 60_000);
    const b = setInterval(() => void loadReviews(), 300_000);
    return () => {
      alive = false;
      clearInterval(a);
      clearInterval(b);
    };
  }, [ready, shopSlug]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (attend?.claimed) e.setAttendLabel({ sub: `오늘 출석 완료 · +${formatKRW(attend.amount ?? 0)}`, done: true });
    else if (attendLogin) e.setAttendLabel({ sub: "로그인하고 다이아 캐기", done: false });
    else e.setAttendLabel({ sub: "클릭해서 다이아 캐기 · 하루 1번", done: false });
  }, [attend, attendLogin, ready]);

  /* 계정 시장에 들어갈 때 진열 계정을 받아 점포 마네킹 · 간판에 건다 (1분 안엔 다시 받지 않는다) */
  loadMarketRef.current = () => {
    if (Date.now() - marketAt.current < 60_000) return;
    marketAt.current = Date.now();
    fetchGalleryAccounts(shopSlug)
      .then(setMarket)
      .catch(() => {
        marketAt.current = 0;
        flash("판매 계정을 불러오지 못했어요");
      });
  };

  useEffect(() => {
    if (!market) return;
    engineRef.current?.setMarketAccounts(
      market.accounts.map(
        (a): MarketAccount => ({
          ign: a.ign,
          uuid: a.uuid,
          rank: a.stats?.rank ?? null,
          rankColor: a.stats?.rankColor ?? null,
          price: a.product?.price ?? null,
          soldOut: a.product?.soldOut ?? false,
          level: a.stats?.level ?? null,
        }),
      ),
    );
  }, [market, ready]);

  const openStall = useCallback(
    (i: number) => {
      setStallOpen(i);
      openGui("account");
    },
    [openGui],
  );

  const onInteract = useCallback(
    (kind: InteractKind) => {
      if (kind === "attend") {
        startAttendRef.current();
        return;
      }
      if (kind === "duel") {
        openDuel();
        return;
      }
      void loadMe();
      openGui(kind === "crafting" ? "crafting" : "mission");
    },
    [loadMe, openGui, openDuel],
  );

  /* 엔진 만들기 */
  useEffect(() => {
    if (!loaded) return;
    const host = hostRef.current;
    if (!host) return;
    let engine: WorldEngine | null = null;
    let cancelled = false;
    import("./world-engine")
      .then(({ WorldEngine: Engine }) => {
        if (cancelled) return;
        try {
          engine = new Engine(host, {
            blocks: island?.blocks ?? STARTER_BLOCKS,
            editable: Boolean(island?.mine),
            signs: signTexts(island, meRef.current),
            onBlocksChange: (next) => {
              setBlocks(next);
              persist(next);
              unlock("builder");
            },
            onZone: (z) => {
              setZone(z);
              if (z === "island") engine?.clearRemotes();
              else unlock("plaza");
              pushFeed(z === "plaza" ? "메인 광장에 도착했어요 · PvP 구역" : "하늘섬으로 돌아왔어요", "info");
              if (z === "plaza") showTitle("메인 광장", "PvP 구역 · 파쿠르 · 제작대 · 일일 미션");
              else showTitle("하늘섬", "B: 블록 고르기 · T: 채팅 · /섬방문 @닉네임");
              const n = netRef.current;
              if (n && engine) n.heartbeat(engine.netState());
            },
            onShopPortal: () => {
              setLeaving(true);
              router.push("/dashboard");
            },
            onZonePortal: (zone) => {
              setLeaving(true);
              router.push(zone === "wild" ? "/wild" : "/mine");
            },
            onEndPortal: () => unlock("end"),
            onInteract,
            onRegion: (r) => {
              gameHandlers.onRegion(r);
              if (r === "market") loadMarketRef.current();
            },
            onStall: setStall,
            onStallOpen: openStall,
            onMazeStart: gameHandlers.onMazeStart,
            onMazeGoal: gameHandlers.onMazeGoal,
            onMazeCancel: gameHandlers.onMazeCancel,
            onTreasure: gameHandlers.onTreasure,
            onTreasureHint: gameHandlers.onTreasureHint,
            onChallenge: gameHandlers.onChallenge,
            onFall: () => unlock("fall"),
            onHover: setHover,
            onParkourStart: parkourStart,
            onGoal: () => void parkourGoal(),
            onViewChange: setFirstPerson,
            onLockChange: setLocked,
            onNotice: flash,
            onAttack: (id) => netRef.current?.hit(id),
            onMineCancel: () => {
              attendBusy.current = false;
            },
            onSwing: () => {
              const now = Date.now();
              if (now - swingAt.current > 200) {
                swingAt.current = now;
                netRef.current?.swing();
              }
            },
          });
          engineRef.current = engine;
          setReady(true);
          showTitle(island ? (island.mine ? "내 섬" : `${island.owner.name}의 섬`) : "하늘섬", "DOES MC 월드에 오신 걸 환영해요");
        } catch (err) {
          console.error("[world] webgl init failed", err);
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
    // 엔진은 한 번만 만든다 — 섬 방문은 enterIsland 가 블록만 바꿔 끼운다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    engineRef.current?.updateSigns(signTexts(island, me));
  }, [island, me, ready]);

  useEffect(() => {
    const id = selected && (inventory[selected] ?? 0) > 0 ? selected : null;
    engineRef.current?.setSelected(id);
  }, [selected, inventory, ready]);

  useEffect(() => {
    engineRef.current?.setMobileTool(mobileTool);
  }, [mobileTool, ready]);

  /* 멀티플레이 */
  useEffect(() => {
    if (!ready) return;
    const n = new WorldNet(shopSlug, {
      status: setNet,
      welcome: (id, hpNow, count, players) => {
        myIdRef.current = id;
        setHp(hpNow);
        setOnline(count);
        for (const p of players) engineRef.current?.upsertRemote(p.id, p.n, p.p, p.m === 1, p.dead === 1, p.k);
        const e = engineRef.current;
        if (e) n.heartbeat(e.netState());
      },
      online: setOnline,
      pos: (p) => {
        if (engineRef.current?.getZone() === "plaza") engineRef.current.upsertRemote(p.id, p.n, p.p, p.m === 1, p.dead === 1, p.k);
      },
      join: (_id, name) => pushFeed(`${name}님이 광장에 들어왔어요`, "join"),
      roster: (players) => {
        const e = engineRef.current;
        if (!e) return;
        e.clearRemotes();
        for (const p of players) e.upsertRemote(p.id, p.n, p.p, p.m === 1, p.dead === 1, p.k);
      },
      gone: (id) => engineRef.current?.removeRemote(id),
      hurt: (ev) => {
        if (ev.me || ev.id === myIdRef.current) {
          setHp(ev.hp);
          setHurtFlash((x) => x + 1);
          engineRef.current?.hurtSelf(ev.kx, ev.kz);
        } else engineRef.current?.remoteHurt(ev.id);
      },
      die: (ev) => {
        pushFeed(`${ev.n}님이 ${ev.bn}님에게 쓰러졌어요`, "kill");
        if (ev.by === myIdRef.current) unlock("pvp");
        if (ev.id === myIdRef.current) {
          setHp(0);
          setDead({ killer: ev.bn });
          setGui(null);
          engineRef.current?.setDead(true);
        } else engineRef.current?.remoteDead(ev.id, true);
      },
      respawn: (id) => engineRef.current?.remoteDead(id, false),
      heal: (id) => engineRef.current?.remoteDead(id, false),
      swing: (id) => engineRef.current?.remoteSwing(id),
      hp: setHp,
      safe: (game) => flash(game ? "미니게임 구역에서는 PvP가 꺼져 있어요" : "스폰 보호 구역에 있는 사람은 때릴 수 없어요"),
      duel: gameHandlers.onDuel,
      chat: (lines, history) => {
        pushChat(lines, history);
        if (!history) notifyChat(lines);
      },
    });
    netRef.current = n;
    void n.connect();
    const tick = setInterval(() => {
      const e = engineRef.current;
      if (e) n.sendPos(e.netState());
    }, 100);
    const beat = setInterval(() => {
      const e = engineRef.current;
      if (e) n.heartbeat(e.netState());
    }, 2000);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
      n.close();
      netRef.current = null;
    };
  }, [ready, shopSlug, pushFeed, pushChat, notifyChat, flash, unlock, gameHandlers]);

  /* 키보드: 핫바 1~9 · T/Enter 채팅 · B 블록 · ESC/E 로 GUI 닫기 */
  const canBuild = zone === "island" && editable;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (gui) {
        if (e.key === "Escape" || e.code === "KeyE" || (gui === "palette" && e.code === "KeyB")) {
          e.preventDefault();
          openGui(null);
        }
        return;
      }
      if (chatOpen || dead) return;
      if (e.code === "KeyT" || e.key === "Enter") {
        e.preventDefault();
        openChat();
        return;
      }
      if (e.code === "Slash" && e.key !== "?") {
        e.preventDefault();
        openChat("/");
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 9) setSlot(n - 1);
      if (e.key === "?") openGui("help");
      if (e.code === "KeyL") openGui("adv");
      if (e.code === "KeyB" && canBuild) openGui("palette");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gui, chatOpen, dead, canBuild, openGui, openChat]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const respawn = () => {
    netRef.current?.respawn();
    engineRef.current?.setDead(false);
    engineRef.current?.goPlaza();
    setDead(null);
    setHp(20);
  };

  const hearts = Array.from({ length: 10 }, (_, i) => {
    const v = hp - i * 2;
    return v >= 2 ? "full" : v === 1 ? "half" : "empty";
  });

  const showHotbar = canBuild;
  const keys: [string, string][] = !locked
    ? [["클릭", "마우스로 조작"], ["WASD", "이동"], ["Space", "점프"], ["T", "채팅"], ["휠", "1인칭 ↔ 3인칭"]]
    : zone === "plaza"
      ? games.region
        ? [["좌클릭 · E", "상호작용"], ["R", "체크포인트로"], ["T", "채팅"], ["ESC", "마우스 해제"]]
        : [["좌클릭", "공격"], ["우클릭", "결투 신청 · 상호작용"], ["T", "채팅"], ["ESC", "마우스 해제"]]
      : canBuild
        ? [["좌클릭", "부수기"], ["우클릭", "놓기"], ["B", "블록 고르기"], ["T", "채팅"]]
        : [["T", "채팅"], ["/내섬", "내 섬으로"], ["ESC", "마우스 해제"]];

  /* 스폰에서 바라본 방향 기준 */
  const guide: [string, string, string][] =
    zone === "plaza"
      ? [
          ["↖", "서쪽 정자", "상점 · 계정시장 · 출석 광산"],
          ["↑", "북쪽 정자", "미로 · 야생 · 파쿠르"],
          ["↗", "동쪽 정자", "광산 레이스 · 보물찾기 · 1:1 결투"],
          ["↔", "스폰 양옆 노점", "제작대 · 일일 미션"],
          ["↓", "뒤쪽 분홍 아치", "내 섬으로"],
        ]
      : [
          ["↑", "도리이 너머 다리", editable ? "내 섬 · B로 블록 고르기" : "섬 구경 · /내섬"],
          ["→", "오른쪽 워프 정자", "메인 광장 · 파쿠르"],
          ["T", "채팅", "/섬방문 @닉네임"],
        ];

  const zoneLabel = zone === "plaza" ? "메인 광장" : island ? (island.mine ? "내 섬" : `${island.owner.name}의 섬`) : "하늘섬";

  return (
    <div className="mcw">
      <div ref={hostRef} className="mcw-canvas" />

      <div className="mcw-vignette" aria-hidden />

      {!ready && !failed ? (
        <div className="mcw-loading is-boot">
          <div className="mcw-boot-grid" aria-hidden />
          <div className="mcw-cube" aria-hidden>
            <i className="f-top" />
            <i className="f-front" />
            <i className="f-right" />
            <i className="f-back" />
            <i className="f-left" />
          </div>
          <span className="mcw-boot-kicker">MINECRAFT WORLD</span>
          <div className="mcw-boot-logo">
            DOES<span>MC</span>
          </div>
          <div className="mcw-boot-bar" aria-hidden>
            <i />
          </div>
          <span className="mcw-boot-tip">월드를 불러오는 중…</span>
          <BootHint />
        </div>
      ) : null}
      {failed ? (
        <div className="mcw-loading">
          <AlertCircle />
          <span>이 기기에서는 3D 월드를 표시할 수 없어요 (WebGL 미지원)</span>
          <button type="button" className="mc-btn" onClick={() => router.push("/dashboard")}>
            상점으로 가기
          </button>
        </div>
      ) : null}

      {/* 좌상단: 위치 · 접속 상태 · 플레이어 */}
      <div className="mcw-top">
        <div className="mcw-card mcw-brand">
          <div className="mcw-brand-row">
            <b>DOES MC</b>
            <span key={zoneLabel} className={`mcw-zone is-${zone}`}>
              {zone === "plaza" ? <Swords /> : <MapPin />}
              {zoneLabel}
            </span>
          </div>
          <div className="mcw-brand-meta">
            <span className={`mcw-net is-${net}`} title="멀티플레이 상태">
              <i aria-hidden />
              {net === "online" ? `${online}명 접속` : net === "connecting" ? "연결 중" : net === "replaced" ? "다른 탭에서 접속함" : "싱글 플레이"}
            </span>
            {shopUser ? (
              <>
                <span className="mcw-player" title={shopUser.minecraftName ? `${shopUser.minecraftName} (${shopUser.name})` : shopUser.name}>
                  {mcUuid ? <img className="mcw-player-head" src={`https://mc-heads.net/avatar/${mcUuid}/32`} alt="" width={16} height={16} /> : null}
                  {shopUser.minecraftName ?? shopUser.name}
                </span>
                <button type="button" className="mcw-logout" onClick={() => void handleLogout()} disabled={loggingOut} title="로그아웃">
                  {loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
                  <span>로그아웃</span>
                </button>
              </>
            ) : !userLoading ? (
              <button
                type="button"
                className="mcw-login"
                onClick={() => {
                  setGuestMode(shopSlug, false);
                  window.location.href = "/main";
                }}
              >
                게스트 · <b>로그인</b>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 우상단: 메뉴 · 길 안내 */}
      <div className="mcw-side">
        <div className="mcw-actions">
          <button type="button" onClick={() => engineRef.current?.toggleView()} title="시점 전환 (V · F5 · 휠)">
            <Eye />
            <span>{firstPerson ? "1인칭" : "3인칭"}</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (chatOpen ? closeChat() : openChat())}
            title="채팅 (T · Enter)"
          >
            <MessageCircle />
            <span>채팅</span>
            {unread > 0 && !chatOpen && <b className="mcw-unread">{unread > 9 ? "9+" : unread}</b>}
          </button>
          <button type="button" onClick={() => openGui("adv")} title="도전 과제 (L)">
            <Trophy />
            <span>도전 과제</span>
          </button>
          <button type="button" onClick={() => openGui("help")} title="조작법 (?)">
            <HelpCircle />
            <span>조작법</span>
          </button>
          <button type="button" className="is-shop" onClick={() => router.push("/dashboard")} title="상점으로">
            <Store />
            <span>상점</span>
          </button>
        </div>

        {save !== "idle" && editable ? (
          <div className={`mcw-save is-${save}`}>
            {save === "saving" ? <Loader2 className="animate-spin" /> : save === "saved" ? <Check /> : <AlertCircle />}
            {save === "saving" ? "저장 중" : save === "saved" ? "저장됨" : "저장 실패"}
          </div>
        ) : null}

        {ready && !games.region ? (
          <div className={`mcw-card mcw-guide ${guideOpen ? "" : "is-closed"}`}>
            <button type="button" className="mcw-guide-head" onClick={() => setGuideOpen((o) => !o)} aria-expanded={guideOpen}>
              <Compass />
              <b>길 안내</b>
              <ChevronDown className="mcw-guide-chev" />
            </button>
            {guideOpen ? (
              <ul>
                {guide.map(([dir, place, what]) => (
                  <li key={place}>
                    <kbd>{dir}</kbd>
                    <span>
                      <b>{place}</b>
                      <small>{what}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {(locked || firstPerson || touch) && !dead ? <div className="mcw-crosshair" aria-hidden /> : null}
      {hover && !gui ? <div className="mcw-hover">{hover}</div> : null}
      {notice ? (
        <div key={notice} className="mcw-notice">
          {notice}
        </div>
      ) : null}
      {title && ready ? (
        <div key={title.key} className="mcw-title" aria-live="polite">
          <h2>{title.main}</h2>
          <p>{title.sub}</p>
        </div>
      ) : null}

      {/* 좌하단: 채팅 · 피드 · 단축키 */}
      <div className="mcw-left">
        {ready ? (
          <div className={`mcw-chat ${chatOpen ? "is-open" : ""}`} aria-live="polite">
            <div className="mcw-chat-log">
              {(chatOpen ? chat.slice(-14) : chat.slice(-6)).map((c) => (
                <p key={c.id} className={c.sys ? "is-sys" : ""}>
                  {c.sys ? null : <b>{c.n}</b>}
                  {c.m}
                </p>
              ))}
            </div>
            {chatOpen ? (
              <form
                className="mcw-chat-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitChat();
                }}
              >
                <input
                  ref={chatInput}
                  value={chatText}
                  maxLength={100}
                  placeholder={me?.user ? "메시지 · /섬방문 @닉네임 · /내섬" : "/섬방문 @닉네임 (채팅은 로그인 후)"}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeChat();
                    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      const list = sentRef.current;
                      if (!list.length) return;
                      e.preventDefault();
                      const i = Math.max(-1, Math.min(list.length - 1, sentIdx.current + (e.key === "ArrowUp" ? 1 : -1)));
                      sentIdx.current = i;
                      setChatText(i < 0 ? "" : list[i]!);
                    }
                  }}
                  onBlur={closeChat}
                />
              </form>
            ) : null}
          </div>
        ) : null}
        <div className="mcw-feed" aria-live="polite">
          {feed.map((f) => (
            <p key={f.id} className={f.tone ? `is-${f.tone}` : ""}>
              {f.text}
            </p>
          ))}
        </div>
        {!touch && ready ? (
          <ul className="mcw-keys" aria-label="단축키">
            {keys.map(([k, v]) => (
              <li key={k + v}>
                <kbd>{k}</kbd>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 하단 가운데: 체력 · 토큰 · 핫바 */}
      <div className={`mcw-hud ${showHotbar ? "" : "is-compact"}`}>
        <div className="mcw-stats-row">
          <div key={`hp${hurtFlash}`} className={`mcw-hearts ${hurtFlash > 0 ? "is-hit" : ""} ${hp <= 6 && hp > 0 ? "is-low" : ""}`} aria-label={`체력 ${hp}/20`}>
            {ready
              ? hearts.map((h, i) => (
                  <span key={i} className={`mcw-heart is-${h}`} style={{ animationDelay: `${(i * 0.137) % 0.6}s` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={heartUrl(true)} alt="" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {h !== "empty" ? <img className="mcw-heart-fill" src={heartUrl()} alt="" /> : null}
                  </span>
                ))
              : null}
          </div>
          <div className="mcw-tokens" title="월드 토큰 — 미션으로 모아 제작대에서 상품으로 교환">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ready ? <img src={tokenUrl()} alt="" /> : null}
            <b key={me?.tokens ?? 0}>{me?.tokens ?? 0}</b>
            <small>토큰</small>
          </div>
        </div>
        {showHotbar ? (
          <div className="mcw-hotbar-row">
            <div className="mcw-hotbar" role="listbox" aria-label="핫바">
              {hotbar.map((id, i) => {
                const left = id ? inventory[id] ?? 0 : 0;
                return (
                  <button
                    key={i}
                    type="button"
                    role="option"
                    aria-selected={slot === i}
                    className={`mcw-hslot ${slot === i ? "is-on" : ""} ${id && left === 0 ? "is-empty" : ""}`}
                    onClick={() => {
                      setSlot(i);
                      setMobileTool("place");
                    }}
                    title={id ? `${ITEMS[id].label} · ${ITEMS[id].source}` : "빈 칸 · B로 블록 넣기"}
                  >
                    {!touch ? <i className="mcw-hkey">{i + 1}</i> : null}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {id && ready ? <img src={itemIcon(id)} alt="" /> : null}
                    {id && left !== Infinity ? <b>{left}</b> : null}
                  </button>
                );
              })}
            </div>
            <button type="button" className="mcw-palette-btn" onClick={() => openGui("palette")} title="블록 고르기 (B)">
              <Boxes />
              <span>블록</span>
            </button>
          </div>
        ) : null}
        {showHotbar && selected ? <p className="mcw-hname">{ITEMS[selected].label}</p> : null}
      </div>

      {/* 포털 · 피격 연출 */}
      <AnimatePresence>
        {hurtFlash > 0 ? (
          <motion.div
            key={hurtFlash}
            className="mcw-hurt"
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>
      {leaving ? (
        <div className="mcw-loading is-portal">
          <Loader2 className="animate-spin" />
          <span>상점으로 이동 중…</span>
        </div>
      ) : null}

      {/* 모바일 */}
      {touch && ready && !dead ? (
        <TouchControls
          engine={engineRef}
          zone={zone}
          editable={editable}
          tool={mobileTool}
          onTool={() => setMobileTool((t) => (t === "place" ? "break" : "place"))}
        />
      ) : null}

      {/* GUI */}
      {gui === "crafting" && me ? (
        <CraftingGui
          shopSlug={shopSlug}
          tokens={me.tokens}
          recipes={me.recipes}
          onCrafted={(tokens) => {
            setMe((m) => (m ? { ...m, tokens } : m));
            void refresh();
            void loadMe();
          }}
          onClose={() => openGui(null)}
        />
      ) : null}
      {gui === "mission" && me ? (
        <MissionGui
          shopSlug={shopSlug}
          mission={me.mission}
          tokens={me.tokens}
          log={me.log}
          onClaimed={(tokens, mission) => {
            setMe((m) => (m ? { ...m, tokens, mission } : m));
            pushFeed(`미션 보상으로 토큰을 받았어요`, "info");
            void loadMe();
          }}
          onClose={() => openGui(null)}
        />
      ) : null}
      {stall !== null && !gui && market?.accounts[stall] ? (
        <StallCard account={market.accounts[stall]} stall={stall} hypixel={market.hypixel} touch={touch} onOpen={() => openStall(stall)} />
      ) : null}
      {gui === "account" && stallOpen !== null && market?.accounts[stallOpen] ? (
        <AccountDetail
          account={market.accounts[stallOpen]}
          hypixel={market.hypixel}
          kicker={`${stallOpen + 1}번 점포 · 기본 닉네임`}
          market
          onClose={() => openGui(null)}
        />
      ) : null}
      {gui === "help" ? <HelpGui touch={touch} onClose={() => openGui(null)} /> : null}
      {gui === "palette" ? (
        <PaletteGui
          allowance={allowance}
          inventory={inventory}
          hotbar={hotbar}
          slot={slot}
          onSlot={setSlot}
          onPick={(id) => {
            putInBar(id);
            setMobileTool("place");
          }}
          onClear={() => setBar((prev) => Array.from({ length: 9 }, (_, i) => (i === slot ? null : prev[i] ?? null)))}
          onClose={() => openGui(null)}
        />
      ) : null}
      {gui === "attend" && attend ? <AttendGui status={attend} fresh={attendFresh} onClose={() => openGui(null)} /> : null}
      <AnimatePresence>{totem ? <TotemOverlay key={totem.key} jackpot={totem.jackpot} onDone={totemDone} /> : null}</AnimatePresence>
      {(gui === "crafting" || gui === "mission") && !me ? (
        <div className="mcw-gui-back" onPointerDown={() => openGui(null)}>
          <Loader2 className="animate-spin text-white" />
        </div>
      ) : null}

      {coupon ? (
        <CouponPopup
          shopSlug={shopSlug}
          coupon={coupon}
          minutes={me?.couponMinutes ?? 10}
          onClose={() => setCoupon(null)}
          onRedeemed={() => {
            void refresh();
            void loadMe();
          }}
        />
      ) : null}

      {games.layer}

      {dead ? <DeathScreen killer={dead.killer} onRespawn={respawn} /> : null}
    </div>
  );
}

let chatAudio: AudioContext | null = null;

/** 다른 사람 채팅이 왔을 때 짧게 울리는 알림음 */
function chatPing() {
  try {
    chatAudio ??= new AudioContext();
    const ctx = chatAudio;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = now + i * 0.07;
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.25);
    });
  } catch {
    /* 오디오를 못 쓰는 환경 */
  }
}

const BOOT_HINTS = [
  "광장 상점에서 마크 계정 · 아이템을 구경할 수 있어요",
  "포탈을 타면 다른 유저들과 함께하는 야생 서버로 갈 수 있어요",
  "다른 유저를 우클릭하면 1:1 결투를 신청할 수 있어요",
  "채팅에 /내섬 을 치면 내 섬으로 바로 갈 수 있어요",
  "T 또는 Enter 키로 채팅, V 또는 F5 키로 시점을 바꿀 수 있어요",
];

function BootHint() {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(Math.floor(Math.random() * BOOT_HINTS.length));
    const t = setInterval(() => setI((n) => (n + 1) % BOOT_HINTS.length), 3200);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="mcw-boot-hint" key={i}>
      <b>TIP</b>
      {BOOT_HINTS[i]}
    </p>
  );
}

function HelpGui({ touch, onClose }: { touch: boolean; onClose: () => void }) {
  const rows = touch
    ? [
        ["왼쪽 동그라미", "이동"],
        ["화면 드래그", "시점 돌리기"],
        ["두 손가락", "줌 (끝까지 당기면 1인칭)"],
        ["점프 버튼", "점프"],
        ["⚔ 버튼", "공격 (광장) / 부수기·놓기 (내 섬)"],
        ["✋ 버튼", "제작대 · 미션 · 결투 · 보물 상자"],
        ["화면 탭", "누른 곳 블록 놓기/부수기 · 사람 공격"],
      ]
    : [
        ["W A S D", "이동"],
        ["Space", "점프"],
        ["Ctrl · W 두 번", "달리기"],
        ["Shift", "웅크리기 (모서리에서 안 떨어짐)"],
        ["마우스", "시점 (화면 클릭 후)"],
        ["휠", "1인칭 ↔ 3인칭 (로블록스식)"],
        ["좌클릭", "공격 (광장) / 블록 부수기 (내 섬)"],
        ["우클릭 · E", "제작대 · 미션 상호작용 / 블록 놓기"],
        ["우클릭 (사람)", "1:1 결투 신청"],
        ["1 ~ 9", "핫바 선택"],
        ["B", "블록 고르기 (핫바 꾸미기)"],
        ["T · Enter", "채팅 (/섬방문 @닉네임 · /내섬 · /스킨 닉네임)"],
        ["V · F5", "시점 전환"],
        ["R", "체크포인트로 돌아가기"],
        ["L", "도전 과제"],
        ["ESC", "마우스 해제 · 창 닫기"],
      ];
  return (
    <div className="mcw-gui-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mcw-gui">
        <div className="mcw-gui-head">
          <b>조작법</b>
        </div>
        <ul className="mcw-help">
          {rows.map(([k, v]) => (
            <li key={k}>
              <kbd>{k}</kbd>
              <span>{v}</span>
            </li>
          ))}
        </ul>
        <div className="mcw-divider" />
        <ul className="mcw-help is-tips">
          <li>도착 정원 동쪽 워프 정자 → 메인 광장</li>
          <li>광장을 둘러싼 정자 → 상점 · 계정시장 · 미로 · 야생 · 파쿠르 · 광산 레이스 · 보물섬 (빛나는 발판을 밟거나 정자 클릭)</li>
          <li>계정시장 → 점포 진열대 앞에 서면 계정 정보 카드 · E 로 상세 보기 · 구매</li>
          <li>스폰 뒤 분홍 아치 → 내 섬</li>
          <li>출석 광산 정자 → 출석 다이아 (하루 1번)</li>
          <li>1:1 결투 정자 과녁 → 결투 매칭</li>
          <li>스폰 양옆 노점 → 제작대 · 일일 미션</li>
          <li>채팅에 /섬방문 @닉네임 → 그 유저의 섬 구경</li>
        </ul>
        <button type="button" className="mc-btn" onClick={onClose}>
          게임으로 돌아가기
        </button>
      </div>
    </div>
  );
}

function PaletteGui({
  allowance,
  inventory,
  hotbar,
  slot,
  onSlot,
  onPick,
  onClear,
  onClose,
}: {
  allowance: Allowance;
  inventory: Allowance;
  hotbar: (ItemId | null)[];
  slot: number;
  onSlot: (i: number) => void;
  onPick: (id: ItemId) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const rewards = REWARD_ITEM_IDS.filter((id) => (allowance[id] ?? 0) > 0);
  const cell = (id: ItemId) => {
    const left = inventory[id] ?? 0;
    return (
      <button
        key={id}
        type="button"
        className={`mcw-slot is-inv mcw-pick ${hotbar[slot] === id ? "is-on" : ""} ${left === 0 ? "is-empty" : ""}`}
        onClick={() => onPick(id)}
        title={`${ITEMS[id].label} · ${ITEMS[id].source}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={itemIcon(id)} alt="" />
        {left !== Infinity ? <b>{left}</b> : null}
      </button>
    );
  };
  return (
    <div className="mcw-gui-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mcw-gui is-wide">
        <div className="mcw-gui-head">
          <b>블록 고르기</b>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X />
          </button>
        </div>
        <p className="mcw-gui-sub">핫바 칸을 고른 뒤 아래 블록을 누르면 그 칸에 들어가요</p>
        <div className="mcw-palette-bar">
          {hotbar.map((id, i) => (
            <button key={i} type="button" className={`mcw-slot is-inv mcw-pick ${slot === i ? "is-on" : ""}`} onClick={() => onSlot(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {id ? <img src={itemIcon(id)} alt="" /> : null}
              <i>{i + 1}</i>
            </button>
          ))}
          <button type="button" className="mc-btn mcw-palette-clear" onClick={onClear}>
            칸 비우기
          </button>
        </div>
        {rewards.length ? (
          <>
            <div className="mcw-divider" />
            <p className="mcw-gui-sub">보상 아이템 · 활동으로 모은 개수만큼</p>
            <div className="mcw-palette">{rewards.map(cell)}</div>
          </>
        ) : null}
        <div className="mcw-divider" />
        <p className="mcw-gui-sub">건축 블록 · 무제한</p>
        <div className="mcw-palette">{BUILD_ITEM_IDS.map(cell)}</div>
      </div>
    </div>
  );
}

function TouchControls({
  engine,
  zone,
  editable,
  tool,
  onTool,
}: {
  engine: React.RefObject<WorldEngine | null>;
  zone: Zone;
  editable: boolean;
  tool: "place" | "break";
  onTool: () => void;
}) {
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
  const jump = (on: boolean) => engine.current?.setMobileJump(on);

  return (
    <>
      <div
        ref={baseRef}
        className="mcw-joy"
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
      <div className="mcw-tbtns">
        <button type="button" className="mcw-tbtn is-jump" onPointerDown={() => jump(true)} onPointerUp={() => jump(false)} onPointerCancel={() => jump(false)} onPointerLeave={() => jump(false)}>
          점프
        </button>
        <button type="button" className="mcw-tbtn" onClick={() => engine.current?.primary()}>
          ⚔
        </button>
        <button type="button" className="mcw-tbtn" onClick={() => engine.current?.interactNearest()}>
          ✋
        </button>
        {zone === "island" && editable ? (
          <button type="button" className="mcw-tbtn is-tool" onClick={onTool}>
            {tool === "place" ? "놓기" : "부수기"}
          </button>
        ) : null}
      </div>
    </>
  );
}
