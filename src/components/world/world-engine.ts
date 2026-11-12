import * as THREE from "three";
import { PlazaBoards, type ReviewSummary, type StockItem } from "./plaza-boards";
import { CUTOUT_TEXTURES, TEX, TRANSLUCENT_TEXTURES, texturePixels, type TextureName } from "@/lib/island/textures";
import {
  BUILD,
  PORTAL_CELLS,
  SIGNS,
  STATIC_CELLS,
  cellKey,
  SPAWN,
  inBuildArea,
  occupiedCells,
  sceneItems,
  staticItems,
  type ItemId,
  type ModelBox,
  type PlacedBlock,
  type SignFacing,
  type SignSpec,
} from "@/lib/island/world";
import {
  ATTEND_ORE,
  END_PORTAL_CELLS,
  HOME_PORTAL_CELLS,
  HOME_SPOT,
  INTERACTABLES,
  ISLAND_BOARDS,
  ISLAND_DECOR,
  MISSION_NPC,
  PLAZA,
  PLAZA_BLOCKS,
  PLAZA_CELLS,
  PLAZA_BOARDS,
  PLAZA_SIGNS,
  PLAZA_SPAWN,
  SHOP_PORTAL_CELLS,
  inPlaza,
  type Interactable,
} from "@/lib/world/layout";
import {
  ACCOUNTS_RETURN,
  ARENAS,
  DUEL_RETURN,
  GATE_ORDER,
  SPOTS,
  type GateKey,
  MAZE,
  MAZE_ENTRY,
  MAZE_GATE_CELLS,
  MAZE_RETURN,
  MAZE_SIZE,
  MAZE_START,
  MARKET_START,
  MARKET_STALL_LIST,
  marketStallNear,
  MINE_GATE_CELLS,
  WILD_GATE_CELLS,
  PARKOUR_AREA,
  PARKOUR_GATE_CELLS,
  PARKOUR_RETURN,
  PARKOUR_START,
  PARKOUR_STEPS,
  SLIME_JUMP_V,
  TREASURE,
  TREASURE_GATE_CELLS,
  TREASURE_RETURN,
  TREASURE_START,
  arenaSpawn,
  gameRegion,
  kstDay,
  type GameRegion,
} from "@/lib/world/games";
import {
  ARENA_BLOCKS,
  GAME_LABELS,
  MARKET_BACK_CELLS,
  MARKET_BLOCKS,
  MARKET_BOARDS,
  MAZE_BACK_CELLS,
  PARKOUR_BACK_CELLS,
  PARKOUR_BLOCKS,
  PARKOUR_CP_CELLS,
  PARKOUR_GOAL_CELLS,
  TREASURE_BACK_CELLS,
  TREASURE_BLOCKS,
  TREASURE_SPOT_CELLS,
  mazeBlocks,
} from "@/lib/world/games-build";
import { buildFirstPersonArm, buildSteve, lookFromName, makeSkinTexture, poseSteve, type SteveLimbs } from "./steve-model";
import { DustPuffs, FountainSpray, Motes, Sparkles, blobShadow, makeCloud, makeSun } from "./world-fx";

export type SignTexts = Record<SignSpec["key"], string[]>;
export type Zone = "island" | "plaza";
export type InteractKind = Interactable["kind"];
export type NetPos = [number, number, number, number, number];
/** 계정 시장 점포에 세울 계정 (i 번째 = i 번 점포) */
export type MarketAccount = { ign: string; uuid: string | null; rank: string | null; rankColor: string | null; price: number | null; soldOut: boolean; level: number | null };

export type WorldEngineOptions = {
  blocks: PlacedBlock[];
  editable: boolean;
  signs: SignTexts;
  onBlocksChange?: (blocks: PlacedBlock[]) => void;
  onZone?: (zone: Zone) => void;
  onShopPortal?: () => void;
  onZonePortal?: (zone: "wild" | "mine") => void;
  onEndPortal?: () => void;
  onInteract?: (kind: InteractKind) => void;
  onHover?: (label: string | null) => void;
  onPortalCharge?: (t: number) => void;
  onParkourStart?: () => void;
  onGoal?: () => void;
  onViewChange?: (firstPerson: boolean) => void;
  onLockChange?: (locked: boolean) => void;
  onNotice?: (msg: string) => void;
  onAttack?: (id: string) => void;
  onSwing?: () => void;
  onMineCancel?: () => void;
  onRegion?: (region: GameRegion) => void;
  onMazeStart?: () => void;
  onMazeGoal?: () => void;
  onMazeCancel?: () => void;
  onTreasure?: (spot: number) => void;
  /** 가장 가까운 숨은 상자까지 거리 (보물섬 밖이면 null) */
  onTreasureHint?: (dist: number | null) => void;
  onChallenge?: (id: string) => void;
  onFall?: () => void;
  /** 계정 시장에서 진열대 앞에 선 점포 번호 (벗어나면 null) */
  onStall?: (stall: number | null) => void;
  /** 진열대 앞에서 E — 계정 상세 창 */
  onStallOpen?: (stall: number) => void;
};

type Chest = { spot: number; root: THREE.Group; lid: THREE.Group; openT: number };
type PortalTarget = "plaza" | "island" | "shop" | "maze" | "treasure" | "parkour" | "back" | "wild" | "mine" | "accounts";

type WarpKey = GateKey | "home";
const GATE_TARGET: Record<WarpKey, PortalTarget> = {
  parkour: "parkour",
  maze: "maze",
  wild: "wild",
  shop: "shop",
  accounts: "accounts",
  mine: "mine",
  treasure: "treasure",
  home: "island",
};
const GATE_NAME: Record<WarpKey, string> = {
  parkour: "하늘 파쿠르",
  maze: "미로 탈출",
  wild: "야생",
  shop: "상점",
  accounts: "계정시장",
  mine: "광산 레이스",
  treasure: "보물찾기",
  home: "내 섬",
};

const EYE = 1.62;
/** 120fps 상한 — rAF 간격 편차를 감안해 살짝 여유를 둔다 */
const FRAME_MIN_MS = 1000 / 120 - 0.5;
const HALF_W = 0.3;
const HEIGHT = 1.8;
const GRAVITY = 28;
const JUMP_V = 8.6;
const WALK = 4.3;
const SPRINT = 5.9;
const SNEAK = 1.3;
const SNEAK_EYE = 1.27;
const MAX_ZOOM = 18;
const FP_THRESHOLD = 0.7;
const REACH = 5.5;
const ATTACK_REACH = 3.6;
const PORTAL_CHARGE = 1.2;
/** 섬 워프 정자 서쪽에 내려 내 섬(북쪽)을 바라본다 */
const ISLAND_ARRIVAL = { x: 2.5, y: 1, z: 19.5, yaw: 0 };

type Face = { o: THREE.Vector3Tuple; r: THREE.Vector3Tuple; u: THREE.Vector3Tuple; n: THREE.Vector3Tuple; tex: keyof ModelBox["faces"]; dir: [number, number, number] };

function boxFaces(b: ModelBox, ox: number, oy: number, oz: number): Face[] {
  const [x0, y0, z0] = [ox + b.min[0], oy + b.min[1], oz + b.min[2]];
  const [x1, y1, z1] = [ox + b.max[0], oy + b.max[1], oz + b.max[2]];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  return [
    { o: [x1, y0, z1], r: [0, 0, -dz], u: [0, dy, 0], n: [1, 0, 0], tex: "side", dir: [1, 0, 0] },
    { o: [x0, y0, z0], r: [0, 0, dz], u: [0, dy, 0], n: [-1, 0, 0], tex: "side", dir: [-1, 0, 0] },
    { o: [x0, y0, z1], r: [dx, 0, 0], u: [0, dy, 0], n: [0, 0, 1], tex: "front", dir: [0, 0, 1] },
    { o: [x1, y0, z0], r: [-dx, 0, 0], u: [0, dy, 0], n: [0, 0, -1], tex: "side", dir: [0, 0, -1] },
    { o: [x0, y1, z1], r: [dx, 0, 0], u: [0, 0, -dz], n: [0, 1, 0], tex: "top", dir: [0, 1, 0] },
    { o: [x0, y0, z0], r: [dx, 0, 0], u: [0, 0, dz], n: [0, -1, 0], tex: "bottom", dir: [0, -1, 0] },
  ];
}

type Bucket = { pos: number[]; nor: number[]; uv: number[]; idx: number[] };

function makeCanvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function uiFont() {
  try {
    return getComputedStyle(document.body).fontFamily || "sans-serif";
  } catch {
    return "sans-serif";
  }
}

/** 반투명(글자판 등)은 사각형 그림자가 생기므로 불투명 · 컷아웃만 그림자를 드리운다 */
function castShadows(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.castShadow = mats.every((m) => !m.transparent || m.alphaTest > 0);
    mesh.receiveShadow = true;
  });
}

const facingYaw = (f: SignFacing) => (f === "+x" ? Math.PI / 2 : f === "-x" ? -Math.PI / 2 : f === "-z" ? Math.PI : 0);

function hashColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const shirts = [0x2aa7b8, 0xd94848, 0x3fae49, 0x8e44ad, 0xe67e22, 0x2c3e90, 0xf1c40f, 0x16a085, 0xc0392b, 0x7f8c8d];
  return shirts[h % shirts.length]!;
}

type Remote = {
  id: string;
  name: string;
  root: THREE.Group;
  body: THREE.Group;
  limbs: SteveLimbs;
  skin: THREE.Texture;
  skinId?: string;
  tint: THREE.MeshLambertMaterial[];
  hitbox: THREE.Mesh;
  tag: THREE.Sprite;
  shadow: THREE.Mesh | null;
  to: THREE.Vector3;
  yaw: number;
  yawTo: number;
  pitch: number;
  moving: boolean;
  walk: number;
  vy: number;
  hurtT: number;
  swingT: number;
  dead: boolean;
  deadT: number;
};

export class WorldEngine {
  private container: HTMLElement;
  private opts: WorldEngineOptions;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private worldGroup = new THREE.Group();
  private pickables: THREE.Object3D[] = [];
  private textures = new Map<string, THREE.Texture>();
  private materials = new Map<string, THREE.Material>();
  private blocks: PlacedBlock[];
  private solid = new Set<string>();
  private opaque = new Set<string>();
  /** 반투명이라 면 컬링엔 안 쓰지만 3인칭 카메라는 통과하면 안 되는 칸 (포털 막) */
  private camStop = new Set<string>();
  private slimeCells = new Set<string>();
  private occupant = new Map<string, number>();
  private player = new THREE.Group();
  private playerMats: THREE.MeshLambertMaterial[] = [];
  private limbs: SteveLimbs | null = null;
  private playerSkin: THREE.Texture | null = null;
  private hand = new THREE.Group();
  private handLag = new THREE.Vector2();
  private lastYaw = 0;
  private lastPitch = 0;
  /** 그림자맵은 데스크톱에서만, 모바일은 발밑 원형 그림자 */
  private hq = true;
  private sun!: THREE.DirectionalLight;
  private sunSprite: THREE.Sprite | null = null;
  private playerShadow: THREE.Mesh | null = null;
  private sparkles: Sparkles[] = [];
  private motes: Motes | null = null;
  private fountain: FountainSpray | null = null;
  private dust = new DustPuffs(48);
  private mining: { t: number; done: () => void; puff: number } | null = null;
  private crack: THREE.Mesh | null = null;
  private crackCanvas: HTMLCanvasElement | null = null;
  private crackTex: THREE.CanvasTexture | null = null;
  private crackStage = -1;
  private oreHolo: THREE.Sprite | null = null;
  private oreGem: THREE.Mesh | null = null;
  private landT = 0;
  private stepDust = 0;
  private time = 0;
  private highlight: THREE.LineSegments;
  private pos: THREE.Vector3;
  private vel = new THREE.Vector3();
  private knock = new THREE.Vector2();
  private onGround = false;
  private yaw: number;
  private pitch = -0.2;
  private zoom = 7;
  private zoomTarget = 7;
  private bodyYaw = Math.PI;
  private keys = new Set<string>();
  private sprintLatch = false;
  private lastForwardTap = 0;
  private sneaking = false;
  private sneakT = 0;
  private mobileMove = { x: 0, y: 0 };
  private mobileJump = false;
  private respawn: THREE.Vector3;
  private reachedGoal = false;
  private onParkourStartBlock = false;
  private portalCharge = 0;
  private portalTarget: PortalTarget | null = null;
  private portalLock = 0;
  private region: GameRegion = null;
  private gameItems: ReturnType<typeof staticItems> = [];
  private gameGroup = new THREE.Group();
  private gamePickables: THREE.Object3D[] = [];
  private gameBeams: THREE.Mesh[] = [];
  private labelGroup = new THREE.Group();
  private mazeRunning = false;
  private chests = new Map<number, Chest>();
  private chestGroup = new THREE.Group();
  private hintTick = 0;
  private lastHint: number | null = null;
  private duel: { slot: number; side: 0 | 1; opp: string; freezeUntil: number } | null = null;
  private lanterns: THREE.Group | null = null;
  private walkPhase = 0;
  /** 걷기 애니메이션용 속도 (실제 속도를 부드럽게 따라가서 멈출 때 팔다리가 툭 끊기지 않게) */
  private animSpeed = 0;
  /** 포털 통과 직후 화면이 다시 펴지는 연출 (1 → 0) */
  private warpT = 0;
  private portalFx = -1;
  private fov = 70;
  /** 포털 왜곡 후처리 (처음 포털에 들어갈 때 만든다) */
  private warpFx: { target: THREE.WebGLRenderTarget; scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;
  private warpSize = new THREE.Vector2();
  private swingT = 0;
  private hurtT = 0;
  private dead = false;
  private deadT = 0;
  private inputOn = true;
  private raf = 0;
  private last = 0;
  private introT = 0;
  private disposed = false;
  private selected: ItemId | null = null;
  private mobileTool: "place" | "break" = "place";
  private pointer = new THREE.Vector2(0, 0);
  private pointerInside = false;
  private drag: { id: number; x: number; y: number; moved: boolean; button: number; type: string } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private firstPerson = false;
  private locked = false;
  private zone: Zone;
  private hoverLabel: string | null = null;
  private beams: THREE.Mesh[] = [];
  private clouds: THREE.Object3D[] = [];
  private villager = new THREE.Group();
  private villagerHead: THREE.Object3D | null = null;
  private remotes = new Map<string, Remote>();
  private remoteGroup = new THREE.Group();
  private signGroup = new THREE.Group();
  private boards: PlazaBoards | null = null;
  private islandBoards: PlazaBoards | null = null;
  private marketBoards: PlazaBoards | null = null;
  /** 계정 시장 점포 마네킹 · 빈 점포 셔터 */
  private marketGroup = new THREE.Group();
  private mannequins: { stall: number; root: THREE.Group; limbs: SteveLimbs; mats: THREE.MeshLambertMaterial[]; skin: THREE.Texture; uuid: string | null }[] = [];
  private marketCount = 0;
  private marketList: MarketAccount[] = [];
  private stallNear: number | null = null;
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private raycaster = new THREE.Raycaster();
  private interactCells = new Map<string, Interactable>();

  constructor(container: HTMLElement, opts: WorldEngineOptions) {
    this.container = container;
    this.opts = opts;
    this.blocks = opts.blocks.map((b) => [...b] as PlacedBlock);
    // 섬 꼭대기가 아니라 허브에서 섬을 바라보며 시작한다 (집·나무에 카메라가 막히지 않게)
    this.pos = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z);
    this.respawn = this.pos.clone();
    this.yaw = SPAWN.yaw;
    this.zone = "island";
    for (const it of INTERACTABLES) this.interactCells.set(cellKey(it.x, it.y, it.z), it);

    this.hq = !window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.hq, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.hq ? 2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.hq ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const el = this.renderer.domElement;
    el.style.display = "block";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.touchAction = "none";
    el.tabIndex = 0;
    container.appendChild(el);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.scene.add(this.camera);
    this.scene.background = makeCanvasTexture((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#5b8fe2");
      g.addColorStop(0.38, "#94c0f2");
      g.addColorStop(0.62, "#d3e6f8");
      g.addColorStop(0.8, "#fbeedd");
      g.addColorStop(0.92, "#f9dcc4");
      g.addColorStop(1, "#f4cbb8");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, 4, 512);
    this.scene.fog = new THREE.Fog(0xe4edf7, 60, 185);

    this.scene.add(new THREE.HemisphereLight(0xeef5ff, 0x9a8670, 1.15));
    this.sun = new THREE.DirectionalLight(0xfff0d6, 1.9);
    this.sun.position.set(30, 60, 20);
    {
      this.sun.castShadow = true;
      const size = this.hq ? 4096 : 1536;
      const span = this.hq ? 40 : 28;
      this.sun.shadow.mapSize.set(size, size);
      const sc = this.sun.shadow.camera;
      sc.left = -span;
      sc.right = span;
      sc.top = span;
      sc.bottom = -span;
      sc.near = 1;
      sc.far = 180;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.035;
      this.sun.shadow.radius = 3;
    }
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.36));
    this.sunSprite = makeSun();
    this.scene.add(this.sunSprite);

    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, transparent: true, opacity: 0.9 });
    const rand = (i: number) => ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;
    // 섬 · 광장 · (멀리 떨어진) 미니게임 구역마다 구름을 따로 띄운다
    const skies: [number, number, number][] = [
      [0, 0, 14],
      [PLAZA.x, PLAZA.z, 14],
      [MAZE.x0 + MAZE_SIZE / 2, MAZE.z0 + MAZE_SIZE / 2, 8],
      [TREASURE.x, TREASURE.z, 8],
      [ARENAS[1]!.x, ARENAS[1]!.z, 8],
      [PARKOUR_AREA.x + 8, PARKOUR_AREA.z - 28, 12],
    ];
    for (const [cx, cz, count] of skies) {
      for (let i = 0; i < count; i++) {
        const c = makeCloud(i * 13 + cx + cz, cloudMat);
        c.position.set(cx - 100 + rand(i + 3 + cz) * 200, 30 + rand(i + 11) * 10, cz - 100 + rand(i + 5 + cx) * 200);
        c.userData.base = cx;
        c.userData.speed = 0.6 + rand(i + 19) * 0.8;
        this.clouds.push(c);
        this.scene.add(c);
      }
    }

    // 워프 발판 위로 피어오르는 빛 (발판 색)
    const padFx = (cells: [number, number, number][], color: number) => new Sparkles(cells, { perCell: 3, color, size: 0.1, rise: 2.2, spread: 0.32 });
    this.sparkles = [
      padFx(PORTAL_CELLS, 0x9ff6ff),
      padFx(HOME_PORTAL_CELLS, 0xff9ad8),
      padFx(SHOP_PORTAL_CELLS, 0xc77bff),
      padFx(END_PORTAL_CELLS, 0xff8a6b),
      padFx(MAZE_GATE_CELLS, 0x7cf28f),
      padFx(TREASURE_GATE_CELLS, 0xffd34d),
      padFx([...MAZE_BACK_CELLS, ...TREASURE_BACK_CELLS, ...PARKOUR_BACK_CELLS, ...MARKET_BACK_CELLS], 0x9ff6ff),
      padFx(PARKOUR_GATE_CELLS, 0x6fe3ff),
      padFx(WILD_GATE_CELLS, 0xa6f05a),
      padFx(MINE_GATE_CELLS, 0xff9a4a),
    ];
    for (const s of this.sparkles) this.scene.add(s.points);
    this.motes = new Motes(this.hq ? 160 : 70, 0xffe9a8);
    this.scene.add(this.motes.points);
    this.fountain = new FountainSpray(PLAZA.x + 0.5, PLAZA.z + 0.5, this.hq ? 1100 : 480);
    this.scene.add(this.fountain.points);
    this.scene.add(this.dust.group);

    this.gameItems = staticItems([...mazeBlocks(kstDay()), ...TREASURE_BLOCKS, ...ARENA_BLOCKS, ...PARKOUR_BLOCKS, ...MARKET_BLOCKS]);
    this.scene.add(this.worldGroup);
    this.scene.add(this.marketGroup);
    this.scene.add(this.gameGroup);
    this.scene.add(this.chestGroup);
    this.scene.add(this.labelGroup);
    this.scene.add(this.remoteGroup);
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.buildPlayer();
    this.buildHand();
    this.buildVillager();
    this.rebuildWorld();
    this.buildMeshes(this.gameItems, this.gameGroup, this.gamePickables, this.gameBeams);
    this.addSigns();
    this.addGameLabels();
    this.boards = new PlazaBoards(PLAZA_BOARDS, uiFont);
    this.scene.add(this.boards.group);
    this.islandBoards = new PlazaBoards(ISLAND_BOARDS, uiFont);
    this.scene.add(this.islandBoards.group);
    this.marketBoards = new PlazaBoards(MARKET_BOARDS, uiFont);
    this.scene.add(this.marketBoards.group);
    for (const b of [this.boards, this.islandBoards, this.marketBoards]) castShadows(b.group);
    this.setMarketAccounts([]);
    this.buildOreFx();
    this.buildLanterns();
    void document.fonts?.ready.then(() => {
      if (this.disposed) return;
      this.boards?.redraw();
      this.islandBoards?.redraw();
      this.marketBoards?.redraw();
      this.shutterTex?.dispose();
      this.shutterTex = null;
      this.setMarketAccounts(this.marketList);
      this.addSigns();
      this.addGameLabels();
      this.setAttendLabel(this.attendLines);
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.bindInput();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ───────────── 공개 API ───────────── */

  setBlocks(blocks: PlacedBlock[]) {
    this.blocks = blocks.map((b) => [...b] as PlacedBlock);
    this.rebuildWorld();
  }

  setEditable(on: boolean) {
    this.opts.editable = on;
  }

  setSelected(id: ItemId | null) {
    this.selected = id;
  }

  /** 광장 재고현황 게시판 */
  setStockBoard(items: StockItem[]) {
    this.boards?.setStock(items);
  }

  /** 광장 후기 게시판 */
  setReviewBoard(data: ReviewSummary) {
    this.boards?.setReviews(data);
  }

  /** 계정 시장: 계정이 있는 점포엔 그 스킨을 입은 마네킹과 간판, 나머지 점포는 셔터를 내린다 */
  setMarketAccounts(list: MarketAccount[]) {
    this.marketList = list;
    this.clearMannequins();
    this.marketCount = Math.min(list.length, MARKET_STALL_LIST.length);
    for (const s of MARKET_STALL_LIST) {
      const a = list[s.i];
      const key = `stall-${s.i}`;
      if (!a) {
        this.marketGroup.add(this.makeShutter(s.side, s.fx, s.cz));
        this.marketBoards?.setWood(key, { text: "빈 점포", sub: "곧 새 계정이 들어와요", color: "#c9c2b8" });
        continue;
      }
      const mats: THREE.MeshLambertMaterial[] = [];
      const skin = makeSkinTexture(lookFromName(a.ign, hashColor(a.ign)));
      const { root: body, limbs } = buildSteve(skin, mats);
      const root = new THREE.Group();
      root.add(body);
      root.position.set(s.mx, 1, s.cz);
      root.rotation.y = s.yaw;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nameTexture(a.rank ? `[${a.rank}] ${a.ign}` : a.ign), transparent: true }));
      tag.scale.set(2.4, 0.3, 1);
      tag.position.y = 2.2;
      root.add(tag);
      this.marketGroup.add(root);
      const m = { stall: s.i, root, limbs, mats, skin: skin as THREE.Texture, uuid: a.uuid };
      this.mannequins.push(m);
      if (a.uuid) {
        this.loadSkin(`/api/world/skin?uuid=${a.uuid}`, (tex) => {
          if (!this.mannequins.includes(m)) return tex.dispose();
          m.skin.dispose();
          m.skin = tex;
          for (const mat of mats) {
            mat.map = tex;
            mat.needsUpdate = true;
          }
        });
      }
      const price = a.price === null ? "가격 문의" : a.soldOut ? "품절" : `${a.price.toLocaleString("ko-KR")}원`;
      this.marketBoards?.setWood(key, { text: a.ign, sub: a.level ? `${price} · 하이픽셀 Lv.${a.level}` : price, color: a.rankColor ?? "#ffe9a8" });
    }
    if (this.stallNear !== null && this.stallNear >= this.marketCount) {
      this.stallNear = null;
      this.opts.onStall?.(null);
    }
  }

  private shutterTex: THREE.Texture | null = null;

  /** 진열대 앞에 내려진 골판 셔터 (빈 점포) */
  private makeShutter(side: -1 | 1, fx: number, cz: number) {
    this.shutterTex ??= makeCanvasTexture((ctx, w, h) => {
      ctx.fillStyle = "#9aa0a6";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        ctx.fillStyle = "#b9bec4";
        ctx.fillRect(0, y, w, 7);
        ctx.fillStyle = "#7d838a";
        ctx.fillRect(0, y + 13, w, 3);
      }
      ctx.fillStyle = "#5c6168";
      ctx.fillRect(0, h - 22, w, 22);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(w / 2 - 120, h / 2 - 34, 240, 68);
      ctx.fillStyle = "#3b3f45";
      ctx.font = `800 40px ${uiFont()}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("준비 중", w / 2, h / 2 + 2);
    }, 512, 384);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshLambertMaterial({ map: this.shutterTex }));
    mesh.position.set(fx + side * -0.02, 2.5, cz);
    mesh.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    return mesh;
  }

  private clearMannequins() {
    for (const m of this.mannequins) m.skin.dispose();
    this.mannequins = [];
    for (const o of [...this.marketGroup.children]) {
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | undefined;
        if (mat instanceof THREE.SpriteMaterial) mat.map?.dispose();
        mat?.dispose();
      });
      this.marketGroup.remove(o);
    }
  }

  /** 마네킹이 가까운 손님을 쳐다보고, 진열대 앞에 서면 점포 번호를 알린다 */
  private updateMarket() {
    const inside = this.region === "market" && !this.dead;
    this.marketGroup.visible = this.region === "market";
    const near = inside ? marketStallNear(this.pos.x, this.pos.z) : -1;
    const stall = near >= 0 && near < this.marketCount ? near : null;
    if (stall !== this.stallNear) {
      this.stallNear = stall;
      this.opts.onStall?.(stall);
    }
    if (!this.marketGroup.visible) return;
    for (const m of this.mannequins) {
      poseSteve(m.limbs, { t: this.time + m.stall * 1.7, walk: 0, speed: 0, swing: 0, pitch: 0, wave: m.stall === stall ? 1 : 0 });
      const dx = this.pos.x - m.root.position.x;
      const dz = this.pos.z - m.root.position.z;
      const close = Math.hypot(dx, dz) < 7;
      const look = Math.atan2(-dx, -dz) - m.root.rotation.y;
      const want = close ? THREE.MathUtils.clamp(Math.atan2(Math.sin(look), Math.cos(look)), -0.9, 0.9) : Math.sin(this.time * 0.4 + m.stall) * 0.35;
      m.limbs.head.rotation.y += (want - m.limbs.head.rotation.y) * 0.12;
    }
  }

  setMobileTool(tool: "place" | "break") {
    this.mobileTool = tool;
  }

  setMobileMove(x: number, y: number) {
    this.mobileMove.x = x;
    this.mobileMove.y = y;
  }

  setMobileJump(on: boolean) {
    this.mobileJump = on;
  }

  /** GUI 가 열려 있으면 조작을 멈춘다 */
  setInputEnabled(on: boolean) {
    this.inputOn = on;
    if (!on) {
      this.keys.clear();
      this.mobileMove = { x: 0, y: 0 };
      this.releasePointer();
    }
  }

  releasePointer() {
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  /** 로블록스식 휠 줌: 끝까지 당기면 1인칭, 밀수록 몸에서 멀어진다 */
  zoomBy(delta: number) {
    if (delta > 0 && this.zoomTarget < FP_THRESHOLD) {
      this.zoomTarget = 2;
      return;
    }
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget + delta, 0, MAX_ZOOM);
    if (delta < 0 && this.zoomTarget < 1.4) this.zoomTarget = 0;
  }

  toggleView() {
    this.zoomTarget = this.zoomTarget < FP_THRESHOLD ? 7 : 0;
  }

  respawnPlayer() {
    if (this.dead) return;
    if (this.duel) {
      this.opts.onNotice?.("결투 중에는 스폰으로 이동할 수 없어요.");
      return;
    }
    this.pos.copy(this.respawn);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0);
  }

  updateSigns(signs: SignTexts) {
    this.opts.signs = signs;
    this.addSigns();
  }

  getZone() {
    return this.zone;
  }

  netState(): { p: NetPos; m: 0 | 1; z: 0 | 1 } {
    const r = (n: number) => Math.round(n * 100) / 100;
    return {
      p: [r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.bodyYaw), r(this.pitch)],
      m: Math.hypot(this.vel.x, this.vel.z) > 0.4 ? 1 : 0,
      z: this.zone === "plaza" ? 1 : 0,
    };
  }

  teleport(x: number, y: number, z: number, yaw: number) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0);
    this.yaw = yaw;
    this.bodyYaw = yaw + Math.PI;
    this.updateZone();
    this.setRespawnForRegion();
  }

  private setRespawnForRegion() {
    if (this.duel) {
      const s = arenaSpawn(this.duel.slot, this.duel.side);
      this.respawn.set(s.x, s.y, s.z);
    } else if (this.region === "maze") this.respawn.set(MAZE_START.x, MAZE_START.y, MAZE_START.z);
    else if (this.region === "treasure") this.respawn.set(TREASURE_START.x, TREASURE_START.y, TREASURE_START.z);
    else if (this.region === "parkour") this.respawn.set(PARKOUR_START.x, PARKOUR_START.y, PARKOUR_START.z);
    else if (this.region === "market") this.respawn.set(MARKET_START.x, MARKET_START.y, MARKET_START.z);
    else if (this.zone === "plaza") this.respawn.set(PLAZA_SPAWN.x, PLAZA_SPAWN.y, PLAZA_SPAWN.z);
    else this.respawn.set(SPAWN.x, SPAWN.y, SPAWN.z);
  }

  goPlaza() {
    this.teleport(PLAZA_SPAWN.x, PLAZA_SPAWN.y, PLAZA_SPAWN.z, PLAZA_SPAWN.yaw);
    this.portalLock = 1.5;
  }

  goIsland() {
    this.teleport(ISLAND_ARRIVAL.x, ISLAND_ARRIVAL.y, ISLAND_ARRIVAL.z, ISLAND_ARRIVAL.yaw);
    this.portalLock = 1.5;
  }

  /** 다른 플레이어에게 맞음 */
  hurtSelf(kx: number, kz: number) {
    this.hurtT = 0.35;
    this.knock.set(kx, kz);
    if (this.onGround) this.vel.y = 5.2;
    this.onGround = false;
    for (const m of this.playerMats) m.emissive.setHex(0x880000);
  }

  setDead(dead: boolean) {
    this.dead = dead;
    this.deadT = 0;
    if (dead) {
      this.keys.clear();
      this.releasePointer();
    } else {
      this.player.rotation.z = 0;
    }
  }

  upsertRemote(id: string, name: string, p: NetPos, moving: boolean, dead: boolean, skin?: string) {
    let r = this.remotes.get(id);
    if (!r) {
      r = this.createRemote(id, name);
      r.root.position.set(p[0], p[1], p[2]);
      r.yaw = p[3];
      this.remotes.set(id, r);
    }
    if (r.name !== name) this.setRemoteName(r, name);
    if (skin && r.skinId !== skin && /^[0-9a-f]{32}$/.test(skin)) this.setRemoteSkin(r, skin);
    r.to.set(p[0], p[1], p[2]);
    if (r.root.position.distanceTo(r.to) > 10) r.root.position.copy(r.to);
    r.yawTo = p[3];
    r.pitch = p[4];
    r.moving = moving;
    if (r.dead !== dead) {
      r.dead = dead;
      r.deadT = 0;
    }
  }

  removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.remoteGroup.remove(r.root);
    r.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    (r.tag.material as THREE.SpriteMaterial).map?.dispose();
    r.tag.material.dispose();
    for (const m of r.tint) m.dispose();
    r.skin.dispose();
    if (r.shadow) {
      this.remoteGroup.remove(r.shadow);
      r.shadow.geometry.dispose();
      (r.shadow.material as THREE.Material).dispose();
    }
    this.remotes.delete(id);
  }

  clearRemotes() {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
  }

  remoteHurt(id: string) {
    const r = this.remotes.get(id);
    if (r) r.hurtT = 0.35;
  }

  remoteSwing(id: string) {
    const r = this.remotes.get(id);
    if (r) r.swingT = 0.3;
  }

  remoteDead(id: string, dead: boolean) {
    const r = this.remotes.get(id);
    if (r) {
      r.dead = dead;
      r.deadT = 0;
    }
  }

  /** 좌클릭 — 광장: 공격 / 내 섬: 블록 부수기 */
  primary(ndc?: THREE.Vector2) {
    if (this.dead || !this.inputOn) return;
    if (this.mining) return;
    this.swing();
    if (this.zone === "plaza") {
      const chest = this.pickChest(ndc);
      if (chest !== null) return this.opts.onTreasure?.(chest);
      if (!this.pickRemote(ndc) && this.clickGate(ndc)) return;
      if (!this.pickRemote(ndc) && this.pickInteract(ndc) === "attend") {
        this.opts.onInteract?.("attend");
        return;
      }
      if (!this.canAttack()) return;
      const target = this.pickRemote(ndc) ?? this.nearestRemoteInFront();
      if (target && (!this.duel || target === this.duel.opp)) this.opts.onAttack?.(target);
      return;
    }
    if (this.opts.editable) this.act("break", ndc);
  }

  /** 결투 중엔 상대만, 미니게임 구역에선 아무도 공격할 수 없다 */
  private canAttack() {
    if (this.duel) return performance.now() >= this.duel.freezeUntil;
    return this.region === null;
  }

  /** 우클릭 — 상호작용 / 블록 놓기 */
  secondary(ndc?: THREE.Vector2) {
    if (this.dead || !this.inputOn) return;
    const chest = this.pickChest(ndc);
    if (chest !== null) {
      this.swing();
      return this.opts.onTreasure?.(chest);
    }
    if (this.zone === "plaza" && !this.duel) {
      const other = this.pickRemote(ndc, 8);
      if (other) return this.opts.onChallenge?.(other);
      if (this.clickGate(ndc)) return;
    }
    const target = this.pickInteract(ndc);
    if (target) {
      this.opts.onInteract?.(target);
      this.swing();
      return;
    }
    if (this.zone === "island" && this.opts.editable) {
      this.swing();
      this.act("place", ndc);
    }
  }

  /** E 키 / 모바일 사용 버튼: 바라보는 곳 또는 가까운 상호작용 */
  interactNearest() {
    if (this.dead || !this.inputOn || this.mining) return;
    if (this.stallNear !== null) return this.opts.onStallOpen?.(this.stallNear);
    const chest = this.pickChest() ?? (this.region === "treasure" ? this.nearestChest(2.6) : null);
    if (chest !== null) return this.opts.onTreasure?.(chest);
    const target = this.pickInteract();
    if (target) return this.opts.onInteract?.(target);
    let best: Interactable | null = null;
    let bestD = 3.2;
    for (const it of INTERACTABLES) {
      const d = Math.hypot(this.pos.x - (it.x + 0.5), this.pos.z - (it.z + 0.5));
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    const npc = Math.hypot(this.pos.x - MISSION_NPC.x, this.pos.z - MISSION_NPC.z);
    if (npc < bestD) return this.opts.onInteract?.("mission");
    if (best) this.opts.onInteract?.(best.kind);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const fn of this.cleanup) fn();
    this.releasePointer();
    this.clearRemotes();
    for (const s of this.sparkles) s.dispose();
    this.motes?.dispose();
    this.fountain?.dispose();
    this.dust.dispose();
    this.crackTex?.dispose();
    this.oreHolo?.material.map?.dispose();
    this.playerSkin?.dispose();
    this.boards?.dispose();
    this.islandBoards?.dispose();
    this.marketBoards?.dispose();
    this.clearMannequins();
    this.shutterTex?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    if (this.warpFx) {
      this.warpFx.target.dispose();
      this.warpFx.mat.dispose();
      this.warpFx.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ───────────── 재질 · 지오메트리 ───────────── */

  private texture(name: TextureName) {
    const hit = this.textures.get(name);
    if (hit) return hit;
    const px = texturePixels(name);
    const t = makeCanvasTexture((ctx) => {
      const img = ctx.createImageData(TEX, TEX);
      img.data.set(px);
      ctx.putImageData(img, 0, 0);
    }, TEX, TEX);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = false;
    this.textures.set(name, t);
    return t;
  }

  private material(name: TextureName, box: ModelBox) {
    const key = `${name}|${box.glow ? 1 : 0}|${box.clear ? 1 : 0}`;
    const hit = this.materials.get(key);
    if (hit) return hit;
    const map = this.texture(name);
    const cutout = CUTOUT_TEXTURES.has(name);
    const clear = TRANSLUCENT_TEXTURES.has(name);
    const see = clear || name === "end_portal";
    const m = new THREE.MeshLambertMaterial({
      map,
      transparent: clear,
      opacity: name === "portal" || name.startsWith("portal_") ? 0.82 : name === "water" ? 0.8 : 1,
      depthWrite: name !== "water",
      alphaTest: cutout ? 0.5 : 0,
      side: cutout || see ? THREE.DoubleSide : THREE.FrontSide,
      emissive: box.glow ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
      emissiveMap: box.glow ? map : null,
      emissiveIntensity: box.glow ? 0.75 : 0,
    });
    this.materials.set(key, m);
    return m;
  }

  private rebuildWorld() {
    for (const child of [...this.worldGroup.children]) {
      this.worldGroup.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
      (child as THREE.Mesh).customDepthMaterial?.dispose();
    }
    this.pickables = [];
    for (const b of this.beams) this.scene.remove(b);
    this.beams = [];

    const userCells = new Set<string>();
    for (const b of this.blocks) for (const [x, y, z] of occupiedCells(b)) userCells.add(cellKey(x, y, z));
    const decor = ISLAND_DECOR.filter(([x, y, z]) => !userCells.has(cellKey(x, y, z)));
    const items = [...sceneItems(this.blocks), ...staticItems(decor), ...staticItems(PLAZA_BLOCKS)];
    this.solid.clear();
    this.opaque.clear();
    this.occupant.clear();
    this.camStop.clear();
    this.slimeCells.clear();
    for (const it of [...items, ...this.gameItems]) {
      if (it.cube) this.opaque.add(cellKey(it.x, it.y, it.z));
      if (it.id === "slime") this.slimeCells.add(cellKey(it.x, it.y, it.z));
      if (it.kind === "static" && (it.id === "water" || it.id === "waterfall")) this.camStop.add(cellKey(it.x, it.y, it.z));
      if (it.kind === "user" && it.index !== undefined) {
        for (const [x, y, z] of occupiedCells(this.blocks[it.index]!)) {
          this.occupant.set(cellKey(x, y, z), it.index);
          if (!it.passable) this.solid.add(cellKey(x, y, z));
        }
      } else if (!it.passable) {
        this.solid.add(cellKey(it.x, it.y, it.z));
      }
    }

    this.buildMeshes(items, this.worldGroup, this.pickables, this.beams);
    this.pickables.push(...this.gamePickables);
  }

  /** 같은 재질끼리 한 메시로 묶어 그린다 (가려진 면은 뺀다) */
  private buildMeshes(items: ReturnType<typeof staticItems>, group: THREE.Group, pickList: THREE.Object3D[], beams: THREE.Mesh[]) {
    const buckets = new Map<string, { bucket: Bucket; material: THREE.Material; pick: boolean }>();
    const bucketFor = (tex: TextureName, box: ModelBox) => {
      const key = `${tex}|${box.glow ? 1 : 0}|${box.clear ? 1 : 0}|${box.ghost ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) {
        b = { bucket: { pos: [], nor: [], uv: [], idx: [] }, material: this.material(tex, box), pick: !box.ghost };
        buckets.set(key, b);
      }
      return b.bucket;
    };

    for (const it of items) {
      for (const box of it.model) {
        for (const f of boxFaces(box, it.x, it.y, it.z)) {
          if (it.cube && this.opaque.has(cellKey(it.x + f.dir[0], it.y + f.dir[1], it.z + f.dir[2]))) continue;
          const texName = (f.tex === "front" ? box.faces.front ?? box.faces.side : box.faces[f.tex]) as TextureName;
          const bk = bucketFor(texName, box);
          const base = bk.pos.length / 3;
          const ru = Math.hypot(...f.r);
          const uu = Math.hypot(...f.u);
          const U = ru > 1.001 ? Math.round(ru) : 1;
          const V = uu > 1.001 ? Math.round(uu) : 1;
          const corners: [number, number, number, number, number][] = [
            [f.o[0], f.o[1], f.o[2], 0, 0],
            [f.o[0] + f.r[0], f.o[1] + f.r[1], f.o[2] + f.r[2], U, 0],
            [f.o[0] + f.r[0] + f.u[0], f.o[1] + f.r[1] + f.u[1], f.o[2] + f.r[2] + f.u[2], U, V],
            [f.o[0] + f.u[0], f.o[1] + f.u[1], f.o[2] + f.u[2], 0, V],
          ];
          for (const [x, y, z, u, v] of corners) {
            bk.pos.push(x, y, z);
            bk.nor.push(...f.n);
            bk.uv.push(u, v);
          }
          bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
      if (it.id === "beacon") beams.push(this.addBeam(it.x + 0.5, it.y + 1, it.z + 0.5));
    }

    for (const { bucket, material, pick } of buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(bucket.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uv, 2));
      g.setIndex(bucket.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.receiveShadow = true;
      const lm = material as THREE.MeshLambertMaterial;
      mesh.castShadow = !lm.transparent;
      if (lm.alphaTest > 0) {
        mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: lm.map, alphaTest: lm.alphaTest });
      }
      group.add(mesh);
      if (pick) pickList.push(mesh);
    }
  }

  private addBeam(x: number, y: number, z: number) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 60, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.35, depthWrite: false, fog: false }),
    );
    beam.position.set(x, y + 30, z);
    this.scene.add(beam);
    return beam;
  }

  /** 미니게임 입구 · 출발대 위에 떠 있는 안내 문구 */
  private addGameLabels() {
    for (const child of [...this.labelGroup.children]) {
      const s = child as THREE.Sprite;
      s.material.map?.dispose();
      s.material.dispose();
      this.labelGroup.remove(s);
    }
    const font = uiFont();
    for (const l of GAME_LABELS) {
      const H = l.cta ? 212 : 150;
      const tex = makeCanvasTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        // 종이 카드: 아이보리 바탕 · 부드러운 그림자 · 둥근 모서리
        const card = (x: number, y: number, cw: number, ch: number, r: number) => {
          ctx.beginPath();
          ctx.roundRect(x, y, cw, ch, r);
        };
        ctx.save();
        ctx.shadowColor = "rgba(60,40,20,0.28)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = "#fbf9f4";
        card(14, 10, w - 28, 128, 26);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = "rgba(43,38,32,0.08)";
        ctx.lineWidth = 2;
        card(14, 10, w - 28, 128, 26);
        ctx.stroke();
        ctx.fillStyle = l.color;
        ctx.beginPath();
        ctx.arc(52, 52, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = `bold 44px ${font}`;
        ctx.fillStyle = "#2b2620";
        ctx.fillText(l.title, 76, 54, w - 110);
        ctx.font = `26px ${font}`;
        ctx.fillStyle = "#7a7064";
        ctx.fillText(l.sub, 40, 108, w - 80);
        if (l.cta) {
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.18)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;
          ctx.fillStyle = l.color;
          card(w / 2 - 130, 150, 260, 52, 26);
          ctx.fill();
          ctx.restore();
          ctx.textAlign = "center";
          ctx.font = `bold 26px ${font}`;
          ctx.fillStyle = "#ffffff";
          ctx.fillText("클릭해서 이동  ›", w / 2, 177);
        }
      }, 512, H);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.set(3.4, (3.4 * H) / 512, 1);
      s.position.set(l.x, l.y, l.z);
      s.userData.baseY = l.y;
      s.userData.phase = l.x * 0.37;
      this.labelGroup.add(s);
    }
  }

  /** 시작 섬 둘레를 천천히 떠도는 종이 등불 */
  private buildLanterns() {
    const g = new THREE.Group();
    const paper = new THREE.MeshLambertMaterial({ color: 0xffb35c, emissive: 0xff8a2a, emissiveIntensity: 0.85, transparent: true, opacity: 0.92 });
    const cap = new THREE.MeshLambertMaterial({ color: 0x7a3b12 });
    const body = new THREE.BoxGeometry(0.42, 0.52, 0.42);
    const lid = new THREE.BoxGeometry(0.3, 0.06, 0.3);
    for (let i = 0; i < 12; i++) {
      const l = new THREE.Group();
      const b = new THREE.Mesh(body, paper);
      const top = new THREE.Mesh(lid, cap);
      top.position.y = 0.29;
      const bottom = new THREE.Mesh(lid, cap);
      bottom.position.y = -0.29;
      l.add(b, top, bottom);
      const a = (i / 12) * Math.PI * 2;
      l.userData = { a, r: 13 + (i % 3) * 1.8, y: 3.5 + ((i * 7) % 5) * 1.1, sp: 0.04 + (i % 4) * 0.012, ph: i * 1.7 };
      g.add(l);
    }
    this.lanterns = g;
    this.scene.add(g);
  }

  private updateLanterns() {
    const g = this.lanterns;
    if (!g) return;
    g.visible = this.zone === "island";
    if (!g.visible) return;
    for (const l of g.children) {
      const d = l.userData as { a: number; r: number; y: number; sp: number; ph: number };
      const a = d.a + this.time * d.sp;
      l.position.set(Math.cos(a) * d.r, d.y + Math.sin(this.time * 0.8 + d.ph) * 0.35, Math.sin(a) * d.r);
      l.rotation.y = this.time * 0.3 + d.ph;
      l.rotation.z = Math.sin(this.time * 1.1 + d.ph) * 0.06;
    }
  }

  /* ───────────── 보물찾기 ───────────── */

  /** 오늘 숨겨진 상자 중 아직 못 찾은 것만 놓는다 */
  setTreasures(spots: number[], found: number[]) {
    const want = new Set(spots.filter((s) => !found.includes(s)));
    for (const [spot, c] of this.chests) {
      if (want.has(spot) || c.openT > 0) continue;
      this.removeChest(spot);
    }
    for (const spot of want) {
      if (this.chests.has(spot)) continue;
      const cell = TREASURE_SPOT_CELLS[spot];
      if (!cell) continue;
      this.chests.set(spot, this.createChest(spot, cell));
    }
  }

  /** 찾은 상자 — 뚜껑이 열리고 사라진다 */
  openTreasure(spot: number) {
    const c = this.chests.get(spot);
    if (!c || c.openT > 0) return;
    c.openT = 0.001;
    const p = c.root.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    this.dust.burst(p, 18, 1.8, 0xffd34d);
    this.dust.burst(p, 8, 1.2, 0xffffff);
  }

  private createChest(spot: number, [x, y, z]: [number, number, number]): Chest {
    const mats = (front: TextureName) => [
      this.materialPlain("chest_side"),
      this.materialPlain("chest_side"),
      this.materialPlain("chest_top"),
      this.materialPlain("chest_top"),
      this.materialPlain(front),
      this.materialPlain("chest_side"),
    ];
    const root = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.62, 0.88), mats("chest_front"));
    base.position.y = 0.31;
    base.castShadow = true;
    const lid = new THREE.Group();
    lid.position.set(0, 0.62, -0.44);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.26, 0.88), mats("chest_side"));
    lidMesh.position.set(0, 0.13, 0.44);
    lidMesh.castShadow = true;
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.06), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    latch.position.set(0, 0.04, 0.9);
    lid.add(lidMesh, latch);
    root.add(base, lid);
    root.position.set(x + 0.5, y, z + 0.5);
    root.rotation.y = Math.atan2(TREASURE.x + 0.5 - (x + 0.5), TREASURE.z + 0.5 - (z + 0.5));
    for (const m of [base, lidMesh, latch]) m.userData.chest = spot;
    this.chestGroup.add(root);
    return { spot, root, lid, openT: 0 };
  }

  private materialPlain(name: TextureName) {
    return this.material(name, { min: [0, 0, 0], max: [1, 1, 1], faces: { side: name, top: name, bottom: name } });
  }

  private removeChest(spot: number) {
    const c = this.chests.get(spot);
    if (!c) return;
    this.chestGroup.remove(c.root);
    c.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    this.chests.delete(spot);
  }

  private pickChest(ndc?: THREE.Vector2): number | null {
    if (!this.chests.size || this.region !== "treasure") return null;
    this.raycaster.setFromCamera(this.ndcFor(ndc), this.camera);
    this.raycaster.far = 40;
    const hit = this.raycaster.intersectObjects(this.chestGroup.children, true)[0];
    if (!hit || hit.point.distanceTo(this.eye()) > REACH) return null;
    const spot = hit.object.userData.chest as number | undefined;
    const c = spot === undefined ? undefined : this.chests.get(spot);
    return c && c.openT === 0 ? c.spot : null;
  }

  private nearestChest(maxD: number): number | null {
    let best: number | null = null;
    for (const c of this.chests.values()) {
      if (c.openT > 0) continue;
      const d = c.root.position.distanceTo(this.pos);
      if (d < maxD) {
        maxD = d;
        best = c.spot;
      }
    }
    return best;
  }

  private updateChests(dt: number) {
    for (const c of [...this.chests.values()]) {
      if (c.openT <= 0) continue;
      c.openT += dt;
      c.lid.rotation.x = -Math.min(1, c.openT * 3) * 1.9;
      if (c.openT > 0.9) c.root.scale.setScalar(Math.max(0.01, 1 - (c.openT - 0.9) * 2.5));
      if (c.openT > 1.3) this.removeChest(c.spot);
    }
    this.hintTick -= dt;
    if (this.hintTick > 0) return;
    this.hintTick = 0.25;
    let hint: number | null = null;
    if (this.region === "treasure") {
      hint = Infinity;
      for (const c of this.chests.values()) if (c.openT === 0) hint = Math.min(hint, c.root.position.distanceTo(this.pos));
      if (hint === Infinity) hint = -1;
      hint = Math.round(hint * 2) / 2;
    }
    if (hint !== this.lastHint) {
      this.lastHint = hint;
      this.opts.onTreasureHint?.(hint);
    }
  }

  /* ───────────── 1:1 결투 ───────────── */

  /** 경기장으로 이동하고 카운트다운 동안은 움직이지 못한다 */
  startDuel(slot: number, side: 0 | 1, opp: string, delayMs: number) {
    const s = arenaSpawn(slot, side);
    this.duel = { slot, side, opp, freezeUntil: performance.now() + delayMs };
    this.mining = null;
    this.setDead(false);
    this.teleport(s.x, s.y, s.z, s.yaw);
    this.pitch = -0.05;
    this.portalLock = 2;
  }

  endDuel() {
    if (!this.duel) return;
    this.duel = null;
    this.teleport(DUEL_RETURN.x, DUEL_RETURN.y, DUEL_RETURN.z, DUEL_RETURN.yaw);
    this.portalLock = 2;
  }

  inDuel() {
    return this.duel !== null;
  }

  /** 근처(광장)에 보이는 다른 플레이어 */
  nearbyPlayers(maxD = 24) {
    return [...this.remotes.values()]
      .filter((r) => !r.dead && r.root.visible && r.root.position.distanceTo(this.pos) <= maxD)
      .map((r) => ({ id: r.id, name: r.name, dist: r.root.position.distanceTo(this.pos) }))
      .sort((a, b) => a.dist - b.dist);
  }

  private addSigns() {
    this.scene.remove(this.signGroup);
    this.signGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.MeshBasicMaterial | undefined;
      mat?.map?.dispose();
      mat?.dispose?.();
    });
    this.signGroup = new THREE.Group();
    const font = uiFont();
    const list = [
      ...SIGNS.map((s) => ({ x: s.x, y: s.y, z: s.z, facing: s.facing, lines: this.opts.signs[s.key] ?? [] })),
      ...PLAZA_SIGNS,
    ];
    for (const s of list) {
      const lines = s.lines.slice(0, 3);
      const tex = makeCanvasTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#2b1d0e";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        lines.forEach((line, i) => {
          ctx.font = `${i === 0 ? 36 : 30}px ${font}`;
          const y = h / 2 + (i - (lines.length - 1) / 2) * 42;
          ctx.fillText(line, w / 2, y, w - 20);
        });
      }, 320, 144);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.5),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      const holder = new THREE.Group();
      holder.position.set(s.x + 0.5, s.y + 0.88, s.z + 0.5);
      holder.rotation.y = facingYaw(s.facing);
      plane.position.set(0, 0, 0.065);
      holder.add(plane);
      this.signGroup.add(holder);
    }
    castShadows(this.signGroup);
    this.scene.add(this.signGroup);
  }

  /* ───────────── 출석 광산 ───────────── */

  private attendLines: { sub: string; done: boolean } = { sub: "클릭해서 다이아 캐기", done: false };

  private oreCenter() {
    return new THREE.Vector3(ATTEND_ORE.x + 0.5, ATTEND_ORE.y + 0.5, ATTEND_ORE.z + 0.5);
  }

  private buildOreFx() {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    this.crackCanvas = c;
    this.crackTex = new THREE.CanvasTexture(c);
    this.crackTex.magFilter = THREE.NearestFilter;
    this.crackTex.minFilter = THREE.NearestFilter;
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.crack.position.copy(this.oreCenter());
    this.crack.visible = false;
    this.scene.add(this.crack);

    this.oreGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshLambertMaterial({ color: 0x5ef0e6, emissive: 0x1aa39a, emissiveIntensity: 0.9 }),
    );
    this.oreGem.position.copy(this.oreCenter()).add(new THREE.Vector3(0, 0.95, 0));
    this.scene.add(this.oreGem);

    this.oreHolo = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.oreHolo.scale.set(2.3, 0.58, 1);
    this.oreHolo.position.copy(this.oreCenter()).add(new THREE.Vector3(0, 1.62, 0));
    this.scene.add(this.oreHolo);
    this.setAttendLabel(this.attendLines);
  }

  /** 원석 위 홀로그램 문구 (오늘 캤는지에 따라 바뀜) */
  setAttendLabel(lines: { sub: string; done: boolean }) {
    this.attendLines = lines;
    if (!this.oreHolo) return;
    const font = uiFont();
    const mat = this.oreHolo.material;
    mat.map?.dispose();
    mat.map = makeCanvasTexture((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(10,8,24,0.55)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = lines.done ? "#7dff9a" : "#5ef0e6";
      ctx.fillRect(0, h - 6, w, 6);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `40px ${font}`;
      ctx.fillStyle = "#3a2a0a";
      ctx.fillText("출석 광산", w / 2 + 3, 44 + 3);
      ctx.fillStyle = "#ffd84a";
      ctx.fillText("출석 광산", w / 2, 44);
      ctx.font = `30px ${font}`;
      ctx.fillStyle = lines.done ? "#b9ffc8" : "#ffffff";
      ctx.fillText(lines.sub, w / 2, 98, w - 24);
    }, 512, 128);
    mat.needsUpdate = true;
    if (this.oreGem) this.oreGem.visible = !lines.done;
  }

  private drawCrack(stage: number) {
    const c = this.crackCanvas;
    if (!c || !this.crackTex) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 16, 16);
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.fillStyle = "rgba(0,0,0,0.78)";
    const rays = 3 + stage;
    for (let k = 0; k < rays; k++) {
      let x = 7 + Math.floor(rnd() * 3);
      let y = 7 + Math.floor(rnd() * 3);
      const dx = Math.round(rnd() * 2 - 1) || 1;
      const dy = Math.round(rnd() * 2 - 1);
      const len = 2 + stage + Math.floor(rnd() * 3);
      for (let i = 0; i < len; i++) {
        g.fillRect(x, y, 1, 1);
        x += rnd() < 0.7 ? dx : 0;
        y += rnd() < 0.6 ? dy || (rnd() < 0.5 ? 1 : -1) : 0;
        if (x < 0 || y < 0 || x > 15 || y > 15) break;
      }
    }
    this.crackTex.needsUpdate = true;
  }

  /** 원석 캐기 연출 — 다 캐면 done() */
  mineOre(done: () => void) {
    if (this.mining || this.dead) return false;
    if (this.oreCenter().distanceTo(this.eye()) > REACH + 1.4) {
      this.opts.onNotice?.("원석에 조금 더 가까이 가 주세요");
      return false;
    }
    this.mining = { t: 0, done, puff: 0 };
    this.crackStage = -1;
    return true;
  }

  private updateMining(dt: number) {
    const m = this.mining;
    if (this.oreGem) {
      this.oreGem.rotation.y += dt * 2.2;
      this.oreGem.position.y = ATTEND_ORE.y + 1.45 + Math.sin(this.time * 2.4) * 0.08;
    }
    for (const s of this.labelGroup.children) {
      const base = s.userData.baseY as number | undefined;
      if (base !== undefined) s.position.y = base + Math.sin(this.time * 1.6 + (s.userData.phase as number)) * 0.09;
    }
    if (!m || !this.crack) return;
    const center = this.oreCenter();
    if (this.dead || this.zone !== "plaza" || center.distanceTo(this.eye()) > REACH + 2.4) {
      this.mining = null;
      this.crack.visible = false;
      this.opts.onNotice?.("채굴이 취소됐어요");
      this.opts.onMineCancel?.();
      return;
    }
    const DUR = 1.6;
    m.t += dt;
    const target = Math.atan2(center.x - this.pos.x, center.z - this.pos.z);
    let diff = target - this.bodyYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.bodyYaw += diff * Math.min(1, dt * 10);
    if (this.swingT <= 0.02) this.swing();
    const stage = Math.min(9, Math.floor((m.t / DUR) * 10));
    if (stage !== this.crackStage) {
      this.crackStage = stage;
      this.drawCrack(stage);
    }
    this.crack.visible = true;
    this.crack.position.set(center.x + (Math.random() - 0.5) * 0.03, center.y + (Math.random() - 0.5) * 0.03, center.z + (Math.random() - 0.5) * 0.03);
    m.puff -= dt;
    if (m.puff <= 0) {
      m.puff = 0.18;
      this.dust.burst(center.clone().add(new THREE.Vector3(0, 0.3, 0)), 2, 0.6, Math.random() < 0.4 ? 0x5ef0e6 : 0x8a8a8a);
    }
    if (m.t >= DUR) {
      this.mining = null;
      this.crack.visible = false;
      const at = center.clone().add(new THREE.Vector3(0, -0.2, 0));
      this.dust.burst(at, 14, 1.6, 0x5ef0e6);
      this.dust.burst(at, 10, 1.3, 0x9a9a9a);
      m.done();
    }
  }

  /* ───────────── 캐릭터 ───────────── */

  private buildPlayer() {
    this.playerSkin = makeSkinTexture({ shirt: 0x2aa7b8, hair: 0x3b2414, pants: 0x3b3f9e, accent: 0x5ef0e6, seed: 42 });
    const { root, limbs } = buildSteve(this.playerSkin, this.playerMats);
    this.player.add(root);
    this.limbs = limbs;
    this.scene.add(this.player);
    if (!this.renderer.shadowMap.enabled) {
      this.playerShadow = blobShadow(0.95);
      this.scene.add(this.playerShadow);
    }
  }

  /** 스킨 PNG → 64×64 텍스처. 옛 64×32 스킨은 64×64 배치로 늘려 쓴다 */
  private loadSkin(url: string, done: (tex: THREE.Texture) => void) {
    new THREE.ImageLoader().load(url, (img) => {
      if (this.disposed || img.width !== 64 || (img.height !== 64 && img.height !== 32)) return;
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d");
      if (!g) return;
      g.drawImage(img, 0, 0);
      if (img.height === 32) {
        // 옛 스킨엔 왼팔·왼다리 칸이 없어서 오른쪽 것을 좌우 반전해 채운다
        const mirror = (sx: number, sy: number, dx: number, dy: number) => {
          g.save();
          g.translate(dx + 16, dy);
          g.scale(-1, 1);
          g.drawImage(img, sx, sy, 16, 16, 0, 0, 16, 16);
          g.restore();
        };
        mirror(0, 16, 16, 48);
        mirror(40, 16, 32, 48);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      done(tex);
    });
  }

  /** 정품 스킨으로 내 캐릭터와 1인칭 팔 텍스처를 바꾼다 */
  setPlayerSkin(url: string) {
    this.loadSkin(url, (tex) => {
      const old = this.playerSkin;
      this.playerSkin = tex;
      for (const m of this.playerMats) {
        m.map = tex;
        m.needsUpdate = true;
      }
      old?.dispose();
    });
  }

  private setRemoteSkin(r: Remote, uuid: string) {
    r.skinId = uuid;
    this.loadSkin(`/api/world/skin?uuid=${uuid}`, (tex) => {
      if (r.skinId !== uuid || !this.remotes.has(r.id)) return tex.dispose();
      const old = r.skin;
      r.skin = tex;
      for (const m of r.tint) {
        m.map = tex;
        m.needsUpdate = true;
      }
      old.dispose();
    });
  }

  private buildHand() {
    if (!this.playerSkin) return;
    const arm = buildFirstPersonArm(this.playerSkin, this.playerMats);
    arm.scale.setScalar(0.8);
    this.hand.add(arm);
    this.hand.position.set(0.42, -0.42, -0.3);
    this.hand.rotation.set(0.12, 0.32, -0.08);
    this.hand.visible = false;
    this.camera.add(this.hand);
  }

  private buildVillager() {
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const robe = mat(0x6b4a2b);
    const skin = mat(0xb9876a);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.15, 0.36), robe);
    body.position.y = 0.6;
    const head = new THREE.Group();
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), skin);
    headMesh.position.y = 0.3;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.12), skin);
    nose.position.set(0, 0.16, 0.3);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.02), mat(0x3a2414));
    brow.position.set(0, 0.42, 0.26);
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), mat(0x2f8f3a));
    eyeL.position.set(-0.12, 0.33, 0.26);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.12;
    head.add(headMesh, nose, brow, eyeL, eyeR);
    head.position.y = 1.18;
    const arms = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.24), robe);
    arms.position.set(0, 0.86, 0.22);
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.56), mat(0x2f6a3a));
    hat.position.y = 1.82;
    this.villager.add(body, head, arms, hat);
    this.villager.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.villager.position.set(MISSION_NPC.x, MISSION_NPC.y, MISSION_NPC.z);
    this.villager.rotation.y = MISSION_NPC.yaw;
    this.villager.userData.npc = "mission";
    this.villagerHead = head;
    this.scene.add(this.villager);
  }

  private nameTexture(name: string) {
    const font = uiFont();
    return makeCanvasTexture((ctx, w, h) => {
      ctx.font = `40px ${font}`;
      const tw = Math.min(w - 8, ctx.measureText(name).width + 28);
      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.fillRect((w - tw) / 2, 6, tw, h - 12);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, w / 2, h / 2 + 2, w - 24);
    }, 512, 64);
  }

  private setRemoteName(r: Remote, name: string) {
    r.name = name;
    const mat = r.tag.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.map = this.nameTexture(name);
    mat.needsUpdate = true;
  }

  private createRemote(id: string, name: string): Remote {
    const tint: THREE.MeshLambertMaterial[] = [];
    const skin = makeSkinTexture(lookFromName(name, hashColor(name)));
    const { root: body, limbs } = buildSteve(skin, tint);
    const root = new THREE.Group();
    root.add(body);
    let shadow: THREE.Mesh | null = null;
    if (!this.renderer.shadowMap.enabled) {
      shadow = blobShadow(0.95);
      this.remoteGroup.add(shadow);
    }
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.y = 0.95;
    hitbox.userData.remote = id;
    root.add(hitbox);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nameTexture(name), depthTest: false, transparent: true }));
    tag.scale.set(2.4, 0.3, 1);
    tag.position.y = 2.25;
    tag.renderOrder = 10;
    root.add(tag);
    this.remoteGroup.add(root);
    return {
      id,
      name,
      root,
      body,
      limbs,
      tint,
      skin,
      shadow,
      vy: 0,
      hitbox,
      tag,
      to: new THREE.Vector3(),
      yaw: 0,
      yawTo: 0,
      pitch: 0,
      moving: false,
      walk: 0,
      hurtT: 0,
      swingT: 0,
      dead: false,
      deadT: 0,
    };
  }

  /* ───────────── 입력 ───────────── */

  private bindInput() {
    const el = this.renderer.domElement;
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));
    };
    const keyDown = (e: KeyboardEvent) => {
      if (isTyping(e) || !this.inputOn) return;
      const k = e.code;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "F5"].includes(k)) e.preventDefault();
      // Ctrl 은 달리기 — Ctrl+S/D/A 같은 브라우저 단축키가 끼어들지 않게 막는다 (Ctrl+W 탭 닫기는 브라우저가 막지 못하게 한다)
      if (e.ctrlKey && /^(Key[ASDFGHQEZXC]|Space|Digit\d)$/.test(k)) e.preventDefault();
      if (k === "ControlLeft" || k === "ControlRight") this.sprintLatch = true;
      if ((k === "KeyW" || k === "ArrowUp") && !e.repeat) {
        const now = performance.now();
        if (now - this.lastForwardTap < 280) this.sprintLatch = true;
        this.lastForwardTap = now;
      }
      this.keys.add(k);
      if (k === "KeyV" || k === "F5") this.toggleView();
      if (k === "KeyR") this.respawnPlayer();
      if (k === "KeyE" || k === "KeyF") this.interactNearest();
    };
    const keyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => {
      this.keys.clear();
      this.sprintLatch = false;
    };
    /* Ctrl 을 누른 채 W 를 누르면 탭이 닫히므로 그때만 나가기 확인 창을 띄운다 */
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!this.inputOn || !(this.keys.has("ControlLeft") || this.keys.has("ControlRight"))) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    window.addEventListener("beforeunload", beforeUnload);

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = Math.sign(e.deltaY) * Math.max(0.6, this.zoomTarget * 0.14);
      this.zoomBy(step);
    };
    el.addEventListener("wheel", wheel, { passive: false });

    const lockChange = () => {
      const on = document.pointerLockElement === el;
      if (on === this.locked) return;
      this.locked = on;
      this.opts.onLockChange?.(on);
    };
    document.addEventListener("pointerlockchange", lockChange);

    const down = (e: PointerEvent) => {
      if (this.locked) {
        if (e.button === 0) this.primary();
        else if (e.button === 2) this.secondary();
        return;
      }
      el.setPointerCapture?.(e.pointerId);
      if (e.pointerType === "touch") {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) {
          const [a, b] = [...this.touches.values()];
          this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: this.zoomTarget };
          this.drag = null;
          return;
        }
      }
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: e.button, type: e.pointerType };
      this.updatePointer(e);
    };
    const move = (e: PointerEvent) => {
      if (this.locked) {
        if (!this.inputOn) return;
        this.yaw -= e.movementX * 0.0024;
        this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0024, -1.55, 1.55);
        return;
      }
      this.updatePointer(e);
      if (e.pointerType === "touch") {
        if (!this.touches.has(e.pointerId)) return;
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pinch && this.touches.size >= 2) {
          const [a, b] = [...this.touches.values()];
          const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          this.zoomTarget = THREE.MathUtils.clamp(this.pinch.zoom * (this.pinch.dist / Math.max(20, d)), 0, MAX_ZOOM);
          if (this.zoomTarget < FP_THRESHOLD) this.zoomTarget = 0;
          return;
        }
      }
      if (!this.drag || this.drag.id !== e.pointerId || !this.inputOn) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        const sens = e.pointerType === "touch" ? 0.006 : 0.0045;
        this.yaw -= dx * sens;
        this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -1.5, 1.5);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        this.touches.delete(e.pointerId);
        if (this.touches.size < 2) this.pinch = null;
      }
      const d = this.drag;
      this.drag = null;
      if (!d || d.id !== e.pointerId || d.moved || this.locked) return;
      if (d.type === "mouse") {
        if (d.button === 0 && this.clickGate(this.pointer.clone())) return;
        el.focus();
        el.requestPointerLock?.();
        return;
      }
      this.tap();
    };
    const enter = () => (this.pointerInside = true);
    const leave = () => {
      this.pointerInside = false;
      if (!this.locked) this.highlight.visible = false;
    };
    const ctx = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("contextmenu", ctx);

    this.cleanup.push(() => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("pointerlockchange", lockChange);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("contextmenu", ctx);
    });
  }

  /** 모바일 탭: 누른 자리 기준으로 공격 · 상호작용 · 건축 */
  private tap() {
    const ndc = this.pointer.clone();
    const chest = this.pickChest(ndc);
    if (chest !== null) {
      this.swing();
      return this.opts.onTreasure?.(chest);
    }
    if (this.zone === "plaza") {
      const id = this.pickRemote(ndc);
      if (id) {
        this.swing();
        if (this.canAttack() && (!this.duel || id === this.duel.opp)) this.opts.onAttack?.(id);
        return;
      }
      if (this.clickGate(ndc)) return;
    }
    const it = this.pickInteract(ndc);
    if (it) {
      this.opts.onInteract?.(it);
      return;
    }
    if (this.zone === "island" && this.opts.editable) {
      this.swing();
      this.act(this.mobileTool, ndc);
    }
  }

  private updatePointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private swing() {
    this.swingT = 0.28;
    this.opts.onSwing?.();
  }

  /* ───────────── 레이캐스트 ───────────── */

  private ndcFor(ndc?: THREE.Vector2) {
    if (ndc) return ndc;
    if (this.locked || this.firstPerson) return new THREE.Vector2(0, 0);
    return this.pointerInside ? this.pointer : new THREE.Vector2(0, 0);
  }

  private eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE - (EYE - SNEAK_EYE) * this.sneakT, this.pos.z);
  }

  /** 발밑 바로 아래에 디딜 블록이 있나 (웅크리면 모서리에서 떨어지지 않는다) */
  private supported(x: number, z: number) {
    return this.collides(x, this.pos.y - 0.12, z);
  }

  private pickBlock(ndc?: THREE.Vector2): { cell: [number, number, number]; normal: [number, number, number]; dist: number } | null {
    this.raycaster.setFromCamera(this.ndcFor(ndc), this.camera);
    this.raycaster.far = 40;
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit || !hit.face) return null;
    const n = hit.face.normal;
    const p = hit.point;
    if (p.distanceTo(this.eye()) > REACH + 0.6) return null;
    const cell: [number, number, number] = [
      Math.floor(p.x - n.x * 0.01),
      Math.floor(p.y - n.y * 0.01),
      Math.floor(p.z - n.z * 0.01),
    ];
    return { cell, normal: [Math.round(n.x), Math.round(n.y), Math.round(n.z)], dist: hit.distance };
  }

  private pickRemote(ndc?: THREE.Vector2, reach = ATTACK_REACH + 0.4): string | null {
    if (!this.remotes.size) return null;
    this.raycaster.setFromCamera(this.ndcFor(ndc), this.camera);
    this.raycaster.far = 40;
    const boxes = [...this.remotes.values()].filter((r) => !r.dead && r.root.visible).map((r) => r.hitbox);
    for (const hit of this.raycaster.intersectObjects(boxes, false)) {
      const id = hit.object.userData.remote as string | undefined;
      const r = id ? this.remotes.get(id) : undefined;
      if (r && r.root.position.distanceTo(this.pos) <= reach) return id!;
    }
    return null;
  }

  private nearestRemoteInFront(): string | null {
    const fx = Math.sin(this.bodyYaw);
    const fz = Math.cos(this.bodyYaw);
    let best: string | null = null;
    let bestD = ATTACK_REACH - 0.4;
    for (const r of this.remotes.values()) {
      if (r.dead) continue;
      const dx = r.root.position.x - this.pos.x;
      const dz = r.root.position.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD || Math.abs(r.root.position.y - this.pos.y) > 2) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < 0.45) continue;
      best = r.id;
      bestD = d;
    }
    return best;
  }

  private pickInteract(ndc?: THREE.Vector2): InteractKind | null {
    this.raycaster.setFromCamera(this.ndcFor(ndc), this.camera);
    this.raycaster.far = 40;
    const npcHit = this.raycaster.intersectObject(this.villager, true)[0];
    const blockHit = this.pickBlock(ndc);
    if (npcHit && npcHit.point.distanceTo(this.eye()) <= REACH && (!blockHit || npcHit.distance < blockHit.dist)) return "mission";
    if (!blockHit) return null;
    const it = this.interactCells.get(cellKey(...blockHit.cell));
    return it ? it.kind : null;
  }

  /* ───────────── 건축 ───────────── */

  private act(kind: "place" | "break", ndc?: THREE.Vector2) {
    const hit = this.pickBlock(ndc);
    if (!hit) return;
    const key = cellKey(...hit.cell);
    if (kind === "break") {
      const idx = this.occupant.get(key);
      if (idx === undefined) {
        this.opts.onNotice?.(STATIC_CELLS.has(key) || PLAZA_CELLS.has(key) ? "공용 구조물은 부술 수 없어요" : "내 섬 블록만 부술 수 있어요");
        return;
      }
      const next = this.blocks.filter((_, i) => i !== idx);
      this.blocks = next;
      this.rebuildWorld();
      this.opts.onBlocksChange?.(next);
      return;
    }
    if (!this.selected) {
      this.opts.onNotice?.("핫바에서 놓을 블록을 골라주세요 (1~9)");
      return;
    }
    const [x, y, z] = [hit.cell[0] + hit.normal[0], hit.cell[1] + hit.normal[1], hit.cell[2] + hit.normal[2]];
    const block: PlacedBlock = [x, y, z, this.selected];
    if (!inBuildArea(x, z)) {
      this.opts.onNotice?.("건축 범위 밖이에요 (섬 중심 ±16칸)");
      return;
    }
    for (const [cx, cy, cz] of occupiedCells(block)) {
      const k = cellKey(cx, cy, cz);
      if (cy < BUILD.minY || cy > BUILD.maxY) return this.opts.onNotice?.("건축 높이 제한이에요");
      if (this.occupant.has(k) || STATIC_CELLS.has(k) || this.solid.has(k)) return this.opts.onNotice?.("이미 블록이 있어요");
      if (this.intersectsPlayer(cx, cy, cz)) return;
    }
    const next = [...this.blocks, block];
    this.blocks = next;
    this.rebuildWorld();
    this.opts.onBlocksChange?.(next);
  }

  private intersectsPlayer(cx: number, cy: number, cz: number) {
    return (
      this.pos.x + HALF_W > cx && this.pos.x - HALF_W < cx + 1 &&
      this.pos.z + HALF_W > cz && this.pos.z - HALF_W < cz + 1 &&
      this.pos.y + HEIGHT > cy && this.pos.y < cy + 1
    );
  }

  /* ───────────── 물리 ───────────── */

  private collides(px: number, py: number, pz: number) {
    const x0 = Math.floor(px - HALF_W + 1e-4);
    const x1 = Math.floor(px + HALF_W - 1e-4);
    const y0 = Math.floor(py + 1e-4);
    const y1 = Math.floor(py + HEIGHT - 1e-4);
    const z0 = Math.floor(pz - HALF_W + 1e-4);
    const z1 = Math.floor(pz + HALF_W - 1e-4);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) if (this.solid.has(cellKey(x, y, z))) return true;
    return false;
  }

  private updateZone() {
    const z: Zone = inPlaza(this.pos.x) ? "plaza" : "island";
    if (z !== this.zone) {
      this.zone = z;
      this.highlight.visible = false;
      this.opts.onZone?.(z);
    }
    const r = z === "plaza" ? gameRegion(this.pos.x, this.pos.z) : null;
    if (r !== this.region) {
      this.region = r;
      if (r !== "maze" && this.mazeRunning) {
        this.mazeRunning = false;
        this.opts.onMazeCancel?.();
      }
      this.opts.onRegion?.(r);
    }
  }

  private onSlime() {
    return this.slimeCells.has(cellKey(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z)));
  }

  private inCells(cells: [number, number, number][]) {
    const c = [Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z)];
    return cells.some(([x, y, z]) => x === c[0] && (y === c[1] || y === c[1] + 1) && z === c[2]);
  }

  private step(dt: number) {
    const frozen = this.duel !== null && performance.now() < this.duel.freezeUntil;
    const can = this.inputOn && !this.dead && !frozen;
    const key = (k: string) => can && this.keys.has(k);
    const mm = can ? this.mobileMove : { x: 0, y: 0 };
    const fwd = (key("KeyW") || key("ArrowUp") ? 1 : 0) - (key("KeyS") || key("ArrowDown") ? 1 : 0) + -mm.y;
    const side = (key("KeyD") || key("ArrowRight") ? 1 : 0) - (key("KeyA") || key("ArrowLeft") ? 1 : 0) + mm.x;
    const len = Math.hypot(fwd, side);
    const sneak = key("ShiftLeft") || key("ShiftRight");
    const ctrl = key("ControlLeft") || key("ControlRight");
    // 마인크래프트처럼: 앞으로 가는 동안만 달리고, 멈추거나 웅크리거나 벽에 막히면 달리기가 풀린다
    if (sneak || fwd <= 0.1) this.sprintLatch = ctrl && !sneak;
    const sprinting = !sneak && fwd > 0.1 && (this.sprintLatch || ctrl || (len > 0.95 && mm.y < -0.9));
    const speed = sneak ? SNEAK : sprinting ? SPRINT : WALK;
    this.sneaking = sneak;
    this.sneakT += ((sneak ? 1 : 0) - this.sneakT) * Math.min(1, dt * 14);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = 0;
    let wz = 0;
    if (len > 0.05) {
      const f = fwd / Math.max(1, len);
      const s = side / Math.max(1, len);
      wx = (-sin * f + cos * s) * speed;
      wz = (-cos * f - sin * s) * speed;
    }
    const accel = this.onGround ? 14 : 5;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
    const jumpHeld = key("Space") || (can && this.mobileJump);
    if (jumpHeld && this.onGround) {
      this.vel.y = this.onSlime() ? SLIME_JUMP_V : JUMP_V;
      this.onGround = false;
    }
    this.vel.y = Math.max(-40, this.vel.y - GRAVITY * dt);

    const kx = this.knock.x;
    const kz = this.knock.y;
    const decay = Math.exp(-(this.onGround ? 9 : 2.5) * dt);
    this.knock.multiplyScalar(decay);
    if (this.knock.lengthSq() < 0.01) this.knock.set(0, 0);

    const edgeGuard = this.sneaking && this.onGround;
    const nx = this.pos.x + (this.vel.x + kx) * dt;
    if (!this.collides(nx, this.pos.y, this.pos.z) && (!edgeGuard || this.supported(nx, this.pos.z))) this.pos.x = nx;
    else {
      this.vel.x = 0;
      this.knock.x = 0;
      if (!edgeGuard) this.sprintLatch = false;
    }
    const nz = this.pos.z + (this.vel.z + kz) * dt;
    if (!this.collides(this.pos.x, this.pos.y, nz) && (!edgeGuard || this.supported(this.pos.x, nz))) this.pos.z = nz;
    else {
      this.vel.z = 0;
      this.knock.y = 0;
      if (!edgeGuard) this.sprintLatch = false;
    }
    const ny = this.pos.y + this.vel.y * dt;
    const wasGround = this.onGround;
    if (!this.collides(this.pos.x, ny, this.pos.z)) {
      this.pos.y = ny;
      this.onGround = false;
    } else {
      const fall = this.vel.y;
      if (fall < 0) {
        const landed = Math.floor(ny) + 1;
        if (!this.collides(this.pos.x, landed, this.pos.z)) this.pos.y = landed;
        this.onGround = true;
        if (!wasGround && fall < -7) {
          const hard = Math.min(1, (-fall - 7) / 12);
          this.landT = Math.max(this.landT, 0.45 + hard * 0.55);
          this.dust.burst(this.pos, 6 + Math.round(hard * 8), 0.8 + hard);
        }
      }
      this.vel.y = 0;
      // 슬라임에 떨어지면 마인크래프트처럼 다시 튀어 오른다 (점프를 누르고 있으면 크게)
      if (fall < 0 && (fall < -5 || jumpHeld) && this.onSlime()) {
        this.vel.y = jumpHeld ? SLIME_JUMP_V : Math.min(SLIME_JUMP_V, -fall * 0.8);
        this.onGround = false;
      }
    }

    const moving = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && moving > WALK * 1.15) {
      this.stepDust -= dt;
      if (this.stepDust <= 0) {
        this.stepDust = 0.16;
        this.dust.burst(this.pos, 1, 0.35);
      }
    }
    if (this.firstPerson || this.locked) {
      const target = this.yaw + Math.PI;
      let diff = target - this.bodyYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.bodyYaw += diff * Math.min(1, 16 * dt);
    } else if (moving > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.bodyYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.bodyYaw += diff * Math.min(1, 12 * dt);
    }
    this.bodyYaw = Math.atan2(Math.sin(this.bodyYaw), Math.cos(this.bodyYaw));
    this.walkPhase += moving * dt * 0.9;
    this.animSpeed += (moving / WALK - this.animSpeed) * Math.min(1, dt * (moving / WALK > this.animSpeed ? 12 : 7));

    this.updateZone();

    if (this.pos.y < -30) {
      this.pos.copy(this.respawn);
      this.vel.set(0, 0, 0);
      this.knock.set(0, 0);
      this.updateZone();
      this.opts.onNotice?.(
        this.region === "maze"
          ? "떨어졌어요! 미로 출발대로 돌아왔어요"
          : this.region === "treasure"
            ? "떨어졌어요! 선착장으로 돌아왔어요"
            : this.region === "parkour"
              ? "떨어졌어요! 체크포인트에서 다시 시작해요"
              : this.zone === "plaza"
                ? "떨어졌어요! 광장으로 돌아왔어요"
                : "떨어졌어요! 섬으로 돌아왔어요",
      );
      this.opts.onFall?.();
    }

    if (this.region === "maze") {
      const cx = Math.floor(this.pos.x);
      const cz = Math.floor(this.pos.z);
      const entry = cx === MAZE.x0 + MAZE_ENTRY.gx && cz === MAZE.z0 + MAZE_ENTRY.gz;
      if (entry && !this.mazeRunning) {
        this.mazeRunning = true;
        this.opts.onMazeStart?.();
      } else if (this.mazeRunning && cz >= MAZE.z0 + MAZE_SIZE + 1) {
        this.mazeRunning = false;
        this.opts.onMazeCancel?.();
      } else if (this.mazeRunning && cz < MAZE.z0) {
        this.mazeRunning = false;
        this.opts.onMazeGoal?.();
      }
    }

    if (this.onGround && this.region === "parkour") {
      const below = cellKey(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z));
      const first = PARKOUR_STEPS[0]!;
      const onStart = below === cellKey(first.x, first.y, first.z);
      if (onStart && !this.onParkourStartBlock) {
        this.reachedGoal = false;
        this.respawn.set(PARKOUR_START.x, PARKOUR_START.y, PARKOUR_START.z);
        this.opts.onParkourStart?.();
      }
      this.onParkourStartBlock = onStart;
      const cp = PARKOUR_CP_CELLS.get(below);
      if (cp && (this.respawn.x !== cp.x || this.respawn.y !== cp.y || this.respawn.z !== cp.z)) {
        this.respawn.set(cp.x, cp.y, cp.z);
        this.opts.onNotice?.("체크포인트 저장! (R 키로 돌아오기)");
      }
      if (!this.reachedGoal && PARKOUR_GOAL_CELLS.has(below)) {
        this.reachedGoal = true;
        this.opts.onGoal?.();
      }
    }

    this.portalLock = Math.max(0, this.portalLock - dt);
    let target: PortalTarget | null = null;
    if (!this.dead && this.portalLock === 0) {
      if (this.zone === "island" && this.inCells(PORTAL_CELLS)) target = "plaza";
      else if (this.zone === "plaza" && this.inCells(HOME_PORTAL_CELLS)) target = "island";
      else if (this.zone === "plaza" && this.inCells(SHOP_PORTAL_CELLS)) target = "shop";
      else if (this.zone === "plaza" && this.inCells(MAZE_GATE_CELLS)) target = "maze";
      else if (this.zone === "plaza" && this.inCells(TREASURE_GATE_CELLS)) target = "treasure";
      else if (this.zone === "plaza" && this.inCells(PARKOUR_GATE_CELLS)) target = "parkour";
      else if (this.zone === "plaza" && this.inCells(WILD_GATE_CELLS)) target = "wild";
      else if (this.zone === "plaza" && this.inCells(MINE_GATE_CELLS)) target = "mine";
      else if (this.zone === "plaza" && (this.inCells(MAZE_BACK_CELLS) || this.inCells(TREASURE_BACK_CELLS) || this.inCells(PARKOUR_BACK_CELLS) || this.inCells(MARKET_BACK_CELLS))) target = "back";
      else if (this.zone === "plaza" && this.inCells(END_PORTAL_CELLS)) target = "accounts";
    }
    if (target && target === this.portalTarget) {
      this.portalCharge = Math.min(PORTAL_CHARGE, this.portalCharge + dt);
    } else {
      this.portalTarget = target;
      this.portalCharge = target ? dt : 0;
    }
    this.warpT = Math.max(0, this.warpT - dt * 1.25);
    this.reportPortalFx();
    if (this.portalTarget && this.portalCharge >= PORTAL_CHARGE) this.enterPortal(this.portalTarget);
  }

  private enterPortal(t: PortalTarget) {
    this.portalTarget = null;
    this.portalCharge = 0;
    if (t !== "shop") this.warpT = 1;
    this.reportPortalFx();
    if (t === "plaza") this.goPlaza();
    else if (t === "island") this.goIsland();
    else if (t === "maze") this.goTo(MAZE_START);
    else if (t === "treasure") this.goTo(TREASURE_START);
    else if (t === "parkour") this.goTo(PARKOUR_START);
    else if (t === "accounts") {
      this.goTo(MARKET_START);
      this.opts.onEndPortal?.();
    } else if (t === "wild" || t === "mine") {
      this.portalLock = 4;
      this.opts.onZonePortal?.(t);
    } else if (t === "back")
      this.goTo(this.region === "treasure" ? TREASURE_RETURN : this.region === "parkour" ? PARKOUR_RETURN : this.region === "market" ? ACCOUNTS_RETURN : MAZE_RETURN);
    else {
      this.portalLock = 4;
      this.opts.onShopPortal?.();
    }
  }

  /** 워프 정자 판정 상자 (바닥 ~ 지붕 위 간판까지) */
  private gateBoxes = [...GATE_ORDER.map((key) => [key, SPOTS[key]] as const), ["home", HOME_SPOT] as const].map(([key, s]) => ({
    key: key as WarpKey,
    box: new THREE.Box3(new THREE.Vector3(s.x - s.half, 1, s.z - s.half), new THREE.Vector3(s.x + s.half + 1, 7, s.z + s.half + 1)),
  }));

  /** 하이픽셀 로비처럼 멀리서도 정자를 클릭하면 바로 이동 */
  private pickGate(ndc?: THREE.Vector2): WarpKey | null {
    if (this.zone !== "plaza" || this.region !== null || this.duel || this.dead) return null;
    this.raycaster.setFromCamera(this.ndcFor(ndc), this.camera);
    this.raycaster.far = 60;
    const ray = this.raycaster.ray;
    const hit = new THREE.Vector3();
    let best: WarpKey | null = null;
    let bestD = 60;
    for (const g of this.gateBoxes) {
      // 정자 안에 서 있으면 발판이 알아서 보내 주니 클릭으로는 다시 보내지 않는다
      if (g.box.containsPoint(ray.origin) || g.box.containsPoint(this.pos)) continue;
      if (!ray.intersectBox(g.box, hit)) continue;
      const d = hit.distanceTo(ray.origin);
      if (d < bestD) {
        bestD = d;
        best = g.key;
      }
    }
    return best;
  }

  private clickGate(ndc?: THREE.Vector2) {
    if (this.portalLock > 0 || !this.inputOn) return false;
    const g = this.pickGate(ndc);
    if (!g) return false;
    this.enterPortal(GATE_TARGET[g]);
    return true;
  }

  /** 포털 연출 세기 = 충전 중이면 충전량, 통과 직후면 서서히 빠지는 잔상 — React 재렌더를 줄이려고 2% 단위로만 알린다 */
  private portalLevel() {
    const charge = this.portalTarget ? this.portalCharge / PORTAL_CHARGE : 0;
    const after = this.warpT * this.warpT * (3 - 2 * this.warpT);
    return Math.max(charge * charge * (3 - 2 * charge), after);
  }

  private reportPortalFx() {
    const v = Math.round(this.portalLevel() * 50) / 50;
    if (v === this.portalFx) return;
    this.portalFx = v;
    this.opts.onPortalCharge?.(v);
  }

  private goTo(p: { x: number; y: number; z: number; yaw: number }) {
    this.teleport(p.x, p.y, p.z, p.yaw);
    this.portalLock = 1.5;
  }

  /* ───────────── 카메라 · 렌더 ───────────── */

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private cameraBlocked(x: number, y: number, z: number) {
    const key = cellKey(Math.floor(x), Math.floor(y), Math.floor(z));
    return this.opaque.has(key) || this.camStop.has(key);
  }

  /** 발밑에서 가장 가까운 단단한 블록 윗면 높이 */
  private groundY(x: number, y: number, z: number) {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const top = Math.floor(y + 0.01) - 1;
    for (let cy = top; cy > top - 12; cy--) if (this.solid.has(cellKey(cx, cy, cz))) return cy + 1;
    return null;
  }

  private placeShadow(shadow: THREE.Mesh, x: number, y: number, z: number, visible: boolean) {
    const g = visible ? this.groundY(x, y, z) : null;
    shadow.visible = g !== null;
    if (g === null) return;
    const h = y - g;
    shadow.position.set(x, g + 0.02, z);
    const s = Math.max(0.35, 1 - h * 0.12);
    shadow.scale.set(s, s, s);
    (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - h * 0.15);
  }

  private updateRemotes(dt: number) {
    const showRemotes = this.zone === "plaza";
    for (const r of this.remotes.values()) {
      const before = r.root.position.clone();
      r.root.position.lerp(r.to, Math.min(1, dt * 12));
      let diff = r.yawTo - r.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.yaw += diff * Math.min(1, dt * 12);
      r.body.rotation.y = r.yaw;
      const vy = (r.root.position.y - before.y) / Math.max(dt, 1e-3);
      r.vy += (vy - r.vy) * Math.min(1, dt * 10);
      before.y = r.root.position.y;
      const speed = before.distanceTo(r.root.position) / Math.max(dt, 1e-3);
      r.walk += Math.min(speed, SPRINT) * dt * 0.9;
      r.swingT = Math.max(0, r.swingT - dt);
      poseSteve(r.limbs, {
        t: this.time + r.walk * 0.01 + (r.id.charCodeAt(0) || 0),
        walk: r.walk,
        speed: r.moving ? speed / WALK : 0,
        swing: r.swingT,
        pitch: r.pitch,
        air: Math.abs(r.vy) > 0.6 ? Math.min(1, (Math.abs(r.vy) - 0.6) / 2) : 0,
      });
      if (r.shadow) this.placeShadow(r.shadow, r.root.position.x, r.root.position.y, r.root.position.z, showRemotes && !r.dead);
      r.hurtT = Math.max(0, r.hurtT - dt);
      const red = r.hurtT > 0 ? 0x990000 : 0x000000;
      for (const m of r.tint) m.emissive.setHex(red);
      if (r.dead) {
        r.deadT = Math.min(1, r.deadT + dt * 3);
        r.body.rotation.z = (Math.PI / 2) * r.deadT;
        r.tag.visible = false;
      } else {
        r.body.rotation.z = 0;
        r.tag.visible = true;
      }
      r.root.visible = showRemotes;
    }
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (now - this.last < FRAME_MIN_MS) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.step(dt);
    this.landT = Math.max(0, this.landT - dt * 4);

    // 미로에서 카메라를 멀리 빼면 위에서 길이 다 보인다
    if (this.region === "maze" && this.zoomTarget > 2.2) this.zoomTarget = 2.2;
    if (this.region === "market" && this.zoomTarget > 4) this.zoomTarget = 4;
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, 10 * dt);
    if (Math.abs(this.zoom - this.zoomTarget) < 0.01) this.zoom = this.zoomTarget;

    let dist = this.zoom;
    let yaw = this.yaw;
    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + dt / 2.6);
      const e = 1 - Math.pow(1 - this.introT, 3);
      dist = THREE.MathUtils.lerp(30, this.zoom, e);
      yaw = this.yaw + (1 - e) * 1.4;
    }

    {
      // 포털: 빨려 들어가듯 시야가 넓어졌다가 도착하면 천천히 돌아온다 · 달리면 살짝 넓어진다
      const sprint = this.onGround ? THREE.MathUtils.clamp((Math.hypot(this.vel.x, this.vel.z) - WALK) / (SPRINT - WALK), 0, 1) : 0;
      const want = 70 + this.portalLevel() * 26 + sprint * 6;
      this.fov += (want - this.fov) * Math.min(1, dt * 7);
      if (Math.abs(this.camera.fov - this.fov) > 0.02) {
        this.camera.fov = this.fov;
        this.camera.updateProjectionMatrix();
      }
    }

    const eye = this.eye();
    if (this.dead) eye.y -= 1.2 * Math.min(1, this.deadT * 3);
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(yaw) * Math.cos(this.pitch));
    const fp = dist < FP_THRESHOLD;
    if (fp !== this.firstPerson) {
      this.firstPerson = fp;
      this.opts.onViewChange?.(fp);
    }
    if (fp) {
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().add(dir));
    } else {
      let d = dist;
      if (this.introT >= 1) {
        for (let t = 0.3; t <= dist; t += 0.1) {
          const p = eye.clone().addScaledVector(dir, -t);
          if (this.cameraBlocked(p.x, p.y, p.z)) {
            d = Math.max(0.3, t - 0.25);
            break;
          }
        }
      }
      this.camera.position.copy(eye).addScaledVector(dir, -d);
      this.camera.lookAt(eye);
    }
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hurtT > 0) this.camera.rotateZ(Math.sin(this.hurtT * 30) * 0.05 * (this.hurtT / 0.35));
    else for (const m of this.playerMats) m.emissive.setHex(0x000000);

    this.swingT = Math.max(0, this.swingT - dt);
    this.player.visible = !fp;
    this.player.position.copy(this.pos);
    this.player.rotation.y = this.bodyYaw;
    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 3);
      this.player.rotation.z = (Math.PI / 2) * this.deadT;
    }
    if (this.limbs) {
      poseSteve(this.limbs, {
        t: this.time,
        walk: this.walkPhase,
        speed: this.animSpeed,
        swing: this.swingT,
        pitch: fp ? 0 : this.pitch,
        air: this.onGround ? 0 : Math.min(1, Math.abs(this.vel.y) / 6),
        land: this.landT,
        sneak: this.sneakT,
      });
    }
    if (this.playerShadow) this.placeShadow(this.playerShadow, this.pos.x, this.pos.y, this.pos.z, !fp && !this.dead);

    this.hand.visible = fp && !this.dead;
    {
      // 시선을 돌리면 손이 살짝 늦게 따라온다
      const dyaw = Math.atan2(Math.sin(this.yaw - this.lastYaw), Math.cos(this.yaw - this.lastYaw));
      const dpitch = this.pitch - this.lastPitch;
      this.lastYaw = this.yaw;
      this.lastPitch = this.pitch;
      const decay = Math.exp(-12 * dt);
      this.handLag.x = THREE.MathUtils.clamp(this.handLag.x * decay + dyaw * 0.45, -0.09, 0.09);
      this.handLag.y = THREE.MathUtils.clamp(this.handLag.y * decay - dpitch * 0.45, -0.07, 0.07);
    }
    if (this.hand.visible) {
      const s = this.swingT > 0 ? 1 - this.swingT / 0.28 : 0;
      const k = Math.sin(s * Math.PI);
      const k2 = Math.sin(Math.sqrt(s) * Math.PI);
      const speed = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / WALK) * (this.onGround ? 1 : 0.25);
      const bobX = Math.sin(this.walkPhase * 3) * 0.028 * speed;
      const bobY = -Math.abs(Math.cos(this.walkPhase * 3)) * 0.022 * speed;
      const breath = Math.sin(this.time * 1.8) * 0.006;
      this.hand.position.set(
        0.42 + bobX + this.handLag.x - k2 * 0.17,
        -0.42 + bobY + breath + this.handLag.y + k * 0.05 - this.landT * 0.06,
        -0.3 - k * 0.12,
      );
      this.hand.rotation.set(0.12 - k2 * 0.9 + bobY * 2, 0.32 + k * 0.6, -0.08 + k2 * 0.25 + bobX);
    }

    if (this.villagerHead) {
      const dx = this.pos.x - this.villager.position.x;
      const dz = this.pos.z - this.villager.position.z;
      const look = Math.atan2(dx, dz) - this.villager.rotation.y;
      const wrapped = Math.atan2(Math.sin(look), Math.cos(look));
      const near = Math.hypot(dx, dz) < 8;
      const want = near ? THREE.MathUtils.clamp(wrapped, -1, 1) : Math.sin(this.time * 0.5) * 0.5;
      this.villagerHead.rotation.y += (want - this.villagerHead.rotation.y) * Math.min(1, dt * 5);
      this.villagerHead.rotation.x = near ? 0 : Math.sin(this.time * 0.9) * 0.08;
      this.villagerHead.position.y = 1.18 + Math.sin(this.time * 2) * 0.012;
    }

    this.updateRemotes(dt);

    for (const c of this.clouds) {
      c.position.x += dt * ((c.userData.speed as number) ?? 0.8);
      const base = c.userData.base as number;
      if (c.position.x > base + 100) c.position.x = base - 100;
    }

    const sunOff = new THREE.Vector3(30, 60, 20);
    this.sun.target.position.set(Math.round(this.pos.x), Math.round(this.pos.y), Math.round(this.pos.z));
    this.sun.position.copy(this.sun.target.position).add(sunOff);
    this.sunSprite?.position.copy(this.camera.position).addScaledVector(sunOff.normalize(), 300);
    this.updateMining(dt);
    const water = this.textures.get("water");
    if (water) water.offset.set(this.time * 0.05, -this.time * 0.35);
    for (const s of this.sparkles) s.update(this.time);
    this.motes?.update(this.time, this.pos);
    if (this.fountain) {
      const near = Math.abs(this.pos.x - PLAZA.x) < 90 && Math.abs(this.pos.z - PLAZA.z) < 90;
      this.fountain.points.visible = near;
      if (near) this.fountain.update(this.time);
    }
    this.dust.update(dt);
    [...this.beams, ...this.gameBeams].forEach((b, i) => {
      (b.material as THREE.MeshBasicMaterial).opacity = 0.26 + Math.sin(this.time * 2.4 + i) * 0.1;
      b.rotation.y = this.time * 0.6;
    });
    this.updateChests(dt);
    this.updateLanterns();
    this.boards?.update(dt, this.zone === "plaza");
    this.islandBoards?.update(dt, this.zone === "island");
    this.marketBoards?.update(dt, this.region === "market");
    this.updateMarket();

    this.updateHover();
    this.renderFrame();
  };

  /** 평소엔 그대로 그리고, 포털 연출 중에는 화면을 한 번 더 받아 마크 멀미처럼 일렁이게 왜곡한다 */
  private renderFrame() {
    const p = this.portalLevel();
    if (p < 0.01) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const fx = this.ensureWarpFx();
    this.renderer.getDrawingBufferSize(this.warpSize);
    if (fx.target.width !== this.warpSize.x || fx.target.height !== this.warpSize.y) fx.target.setSize(this.warpSize.x, this.warpSize.y);
    this.renderer.setRenderTarget(fx.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    const u = fx.mat.uniforms;
    u.uP!.value = p;
    u.uT!.value = this.time;
    u.uAspect!.value = this.warpSize.x / Math.max(1, this.warpSize.y);
    this.renderer.render(fx.scene, fx.cam);
  }

  private ensureWarpFx() {
    if (this.warpFx) return this.warpFx;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.hq ? 4 : 0 });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: target.texture }, uP: { value: 0 }, uT: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        uniform sampler2D tScene;
        uniform float uP;
        uniform float uT;
        uniform float uAspect;
        varying vec2 vUv;
        void main() {
          float p = uP;
          vec2 c = vUv - 0.5;
          c.x *= uAspect;
          float r = length(c);
          // 소용돌이 + 숨 쉬듯 줌 + 물결 — 가운데보다 가장자리가 더 휜다
          float ang = p * (0.35 + 0.55 * sin(uT * 1.3)) * (0.35 + r);
          float cs = cos(ang);
          float sn = sin(ang);
          c = mat2(cs, -sn, sn, cs) * c;
          c *= 1.0 - p * (0.1 + 0.05 * sin(uT * 2.1 + r * 6.0));
          c += p * 0.02 * vec2(sin(c.y * 11.0 + uT * 3.7), cos(c.x * 9.0 + uT * 3.1));
          c.x /= uAspect;
          vec3 col = texture2D(tScene, clamp(c + 0.5, 0.001, 0.999)).rgb;
          // 네더 포털 블록처럼 픽셀 단위로 흐르는 보랏빛 막
          vec2 g = floor(vec2(vUv.x * uAspect, vUv.y) * 22.0);
          float n = 0.5 + 0.5 * sin(g.x * 1.7 + uT * 1.6 + 2.0 * sin(g.y * 0.9 - uT * 1.1));
          float m = 0.5 + 0.5 * sin(g.y * 1.3 - uT * 1.3 + 2.0 * sin(g.x * 0.7 + uT * 0.8));
          vec3 portal = pow(mix(vec3(0.3, 0.04, 0.6), vec3(0.8, 0.42, 1.0), n * m), vec3(2.2));
          float a = p * (0.42 + 0.38 * smoothstep(0.1, 0.8, r)) * (0.75 + 0.25 * n);
          gl_FragColor = vec4(mix(col, portal, clamp(a, 0.0, 0.85)), 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    this.warpFx = { target, scene, cam: new THREE.Camera(), mat };
    return this.warpFx;
  }

  private hoverTick = 0;

  private updateHover() {
    this.hoverTick = (this.hoverTick + 1) % 3;
    if (this.hoverTick !== 0) return;
    const aiming = this.locked || this.firstPerson || this.pointerInside;
    let label: string | null = null;
    let show = false;
    if (aiming && this.inputOn && !this.dead) {
      const it = this.pickInteract();
      if (it)
        label =
          it === "crafting"
            ? "제작대 · 우클릭/E"
            : it === "attend"
              ? "출석 광산 · 클릭/E 로 캐기"
              : it === "duel"
                ? "1:1 결투 · 우클릭/E"
                : "일일 미션 · 우클릭/E";
      if (!label && this.pickChest() !== null) label = "보물 상자 · 클릭/E 로 열기";
      const gate = label ? null : this.pickGate();
      if (gate) label = `${GATE_NAME[gate]} · 클릭해서 이동`;
      const cursor = gate && !this.locked ? "pointer" : "";
      if (this.renderer.domElement.style.cursor !== cursor) this.renderer.domElement.style.cursor = cursor;
      if (!label && this.zone === "plaza" && !this.duel && this.region === null) {
        const other = this.pickRemote(undefined, 8);
        const r = other ? this.remotes.get(other) : undefined;
        if (r) label = `${r.name} · 우클릭으로 결투 신청`;
      }
      if (this.zone === "island" && this.opts.editable) {
        const hit = this.pickBlock();
        if (hit) {
          this.highlight.position.set(hit.cell[0] + 0.5, hit.cell[1] + 0.5, hit.cell[2] + 0.5);
          show = true;
        }
      } else if (it) {
        const hit = this.pickBlock();
        if (hit) {
          this.highlight.position.set(hit.cell[0] + 0.5, hit.cell[1] + 0.5, hit.cell[2] + 0.5);
          show = true;
        }
      }
    }
    this.highlight.visible = show;
    if (label !== this.hoverLabel) {
      this.hoverLabel = label;
      this.opts.onHover?.(label);
    }
  }
}
