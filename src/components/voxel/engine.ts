import * as THREE from "three";
import { B, BLOCKS, oreOf, type BlockDef } from "@/lib/voxel/blocks";
import { item, maxStack, type Stack } from "@/lib/voxel/items";
import { enchantCosts, enchLevel, rollEnchants } from "@/lib/voxel/enchant";
import { MINE_D, MINE_H, MINE_SPAWN, MINE_W, MineGen } from "@/lib/voxel/mine";
import { mulberry32 } from "@/lib/voxel/noise";
import { SMELT_SECONDS, SMELT_XP, SMELTING } from "@/lib/voxel/recipes";
import { tilePixels, T } from "@/lib/voxel/textures";
import { CS, H, idx, isLeaf, treeShape, WorldGen, type ChunkData, type MobKind } from "@/lib/voxel/worldgen";
import { buildFirstPersonArm, buildSteve, makeSkinTexture, poseSteve, type SteveLimbs } from "@/components/world/steve-model";
import { getAtlas, heldPixels } from "./atlas";
import { armorReduce, Inventory } from "./inventory";
import { animateMob, createMob, disposeMob, setWoolColor, type Mob } from "./mobs";
import { BlockParticles } from "./particles";
import { RemotePlayers } from "./remotes";
import { createShadowStub, markCasters, SunShadow } from "./sun-shadow";
import { sfx, soundOf } from "./sound";
import type { WildSave } from "./wild-net";
import { ckey, isOpaque, isSolid, makeMaterials, VoxelWorld, type ChunkSource } from "./world";

export type Mode = "wild" | "mine";

export type HudState = {
  hp: number;
  food: number;
  air: number;
  armor: number;
  pos: [number, number, number];
  biome: string;
  facing: string;
  time: number;
  fps: number;
  chunks: number;
  light: number;
  underwater: boolean;
  dead: boolean;
  breaking: number;
  target: string | null;
  mobs: number;
  sneaking: boolean;
  sprinting: boolean;
  xpLevel: number;
  /** 0~1 다음 레벨까지 */
  xpProgress: number;
  /** 황금 사과 노란 하트 */
  absorb: number;
  /** 나침반 · 시계를 들면 보이는 글 */
  heldInfo: string | null;
  blocking: boolean;
};

export type GuiOpen =
  | { kind: "inventory" }
  | { kind: "crafting" }
  | { kind: "furnace"; key: string }
  | { kind: "chest"; key: string }
  | { kind: "enchanting"; key: string };

export type Furnace = { input: Stack | null; fuel: Stack | null; output: Stack | null; burn: number; burnMax: number; cook: number };

export type EngineEvents = {
  hud: (h: HudState) => void;
  inv: () => void;
  gui: (g: GuiOpen) => void;
  death: (msg: string) => void;
  message: (text: string) => void;
  lock: (locked: boolean) => void;
  mined?: (cells: [number, number, number][]) => void;
};

export type MineInfo = { day: string; seed: number; ore: import("@/lib/voxel/blocks").OreKey; need: number };

/** 멀티 야생: 서버에서 받은 공유 월드 + 서버로 보내는 통로 */
export type WildMulti = {
  seed: number;
  t0: number;
  edits: number[];
  chests: Record<string, (Stack | null)[]>;
  state: WildSave | null;
  send: {
    edits: (flat: number[]) => void;
    chest: (key: string, slots: (Stack | null)[] | null) => void;
    pos: (p: number[], sneak: 0 | 1) => void;
    swing: () => void;
    save: (s: WildSave) => void;
  };
};

/** 멀티 야생 랜덤 스폰 반경 */
const WILD_SPAWN_R = 1200;
/** 120fps 상한 — rAF 간격 편차를 감안해 살짝 여유를 둔다 */
const FRAME_MIN_MS = 1000 / 120 - 0.5;

type SaveData = {
  v: 1;
  seed: number;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
  hp: number;
  food: number;
  sat: number;
  inv: ReturnType<Inventory["serialize"]>;
  spawn: [number, number, number];
  time: number;
  edits: Record<string, number[]>;
  chests: Record<string, (Stack | null)[]>;
  furnaces: Record<string, Furnace>;
  xp?: number;
};

type Drop = { pos: THREE.Vector3; vel: THREE.Vector3; stack: Stack; age: number; obj: THREE.Mesh; mats: THREE.MeshBasicMaterial[]; spin: number };
type Orb = { pos: THREE.Vector3; vel: THREE.Vector3; value: number; age: number; sprite: THREE.Sprite };
type Tnt = { pos: THREE.Vector3; vel: THREE.Vector3; fuse: number; mesh: THREE.Mesh; mats: THREE.MeshBasicMaterial[] };
type Arrow = { pos: THREE.Vector3; vel: THREE.Vector3; fromPlayer: boolean; dmg: number; mesh: THREE.Mesh; stuck: number; life: number };

const GRAVITY = 32;
/** 마인크래프트처럼 최고 높이 약 1.25칸 → 한 칸 블록 위로 올라설 수 있다 */
const JUMP_V = 9.6;
/** 넉백: 마인크래프트 0.4칸/틱 */
const KNOCK_H = 8;
const KNOCK_V = 7.2;
const BREAK_DELAY = 0.25;
const WALK = 4.317;
const SPRINT = 5.612;
const SNEAK = 1.295;
const EYE = 1.62;
const SNEAK_EYE = 1.27;
const HALF = 0.3;
const REACH = 4.5;
const DAY_SECONDS = 1200;

const SOLID_SHAPES = new Set(["cube", "farmland", "cactus"]);
const NEIGHBORS7 = [
  [0, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;
const solidAt = (id: number) => isSolid(id) && SOLID_SHAPES.has(BLOCKS[id]!.shape);
/** 광석을 캘 때 나오는 경험치 [최소, 최대] */
const ORE_XP: Record<string, [number, number]> = {
  coal_ore: [0, 2],
  diamond_ore: [3, 7],
  emerald_ore: [3, 7],
  lapis_ore: [2, 5],
  redstone_ore: [1, 5],
};
/** 마인크래프트 레벨당 필요 경험치 */
const xpNeed = (lvl: number) => (lvl >= 30 ? 9 * lvl - 158 : lvl >= 15 ? 5 * lvl - 38 : 2 * lvl + 7);
const SHIELD_SLOW = 0.3;

class MineSource implements ChunkSource {
  constructor(private gen: MineGen) {}
  generate(cx: number, cz: number): ChunkData | null {
    if (cx < 0 || cz < 0 || cx * CS >= MINE_W || cz * CS >= MINE_D) return null;
    const blocks = new Uint8Array(CS * CS * H);
    for (let y = 0; y < MINE_H; y++)
      for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) blocks[idx(x, y, z)] = this.gen.block(cx * CS + x, y, cz * CS + z);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) blocks[idx(x, MINE_H, z)] = B.bedrock;
    const meta = new Uint8Array(CS * CS * H);
    for (const [x, y, z] of this.gen.torches()) {
      if (Math.floor(x / CS) === cx && Math.floor(z / CS) === cz) blocks[idx(x & 15, y, z & 15)] = B.torch;
    }
    return {
      cx,
      cz,
      blocks,
      meta,
      biomes: new Uint8Array(256),
      grass: new Uint32Array(256).fill(0x91bd59),
      foliage: new Uint32Array(256).fill(0x77ab2f),
      animals: [],
    };
  }
}

const SAVE_PREFIX = "does-wild:v1:";

export class VoxelEngine {
  readonly inv = new Inventory();
  readonly chests = new Map<string, (Stack | null)[]>();
  readonly furnaces = new Map<string, Furnace>();
  readonly mode: Mode;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: VoxelWorld;
  private gen: WorldGen | null = null;
  private mineGen: MineGen | null = null;
  private mats: ReturnType<typeof makeMaterials>;
  private container: HTMLElement;
  private raf = 0;
  private last = performance.now();
  private disposed = false;
  private cleanup: (() => void)[] = [];

  /* 플레이어 */
  pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private onGround = false;
  private spawn = new THREE.Vector3();
  hp = 20;
  food = 20;
  private sat = 5;
  private exhaustion = 0;
  private air = 300;
  private regenT = 0;
  private starveT = 0;
  private hurtT = 0;
  private invulnT = 0;
  private fallStart = 0;
  private burnT = 0;
  private lavaT = 0;
  private drownT = 0;
  private cactusT = 0;
  dead = false;
  private sneaking = false;
  private sneakT = 0;
  private sprinting = false;
  private sprintLatch = false;
  private lastW = 0;
  private inWater = false;
  private headInWater = false;
  private inLava = false;

  /* 입력 */
  private keys = new Set<string>();
  private inputOn = true;
  private locked = false;
  private mouseL = false;
  private mouseR = false;
  private useCooldown = 0;
  private attackCharge = 0;
  private mobileMove = { x: 0, y: 0 };
  private mobileJump = false;
  private touch = false;
  /** 0 1인칭 · 1 뒤에서 · 2 앞에서 (F5) */
  private viewMode: 0 | 1 | 2 = 0;
  showDebug = false;

  /* 경험치 · 효과 */
  private xpTotal = 0;
  xpLevel = 0;
  private xpProg = 0;
  private orbs: Orb[] = [];
  private absorb = 0;
  private regenFx = 0;
  private regenTick = 0;
  /** 마법 부여대 결과를 정하는 씨앗 (부여할 때마다 바뀐다) */
  enchSeed = Math.floor(Math.random() * 2 ** 31);
  private tnts: Tnt[] = [];
  private blocking = false;
  private blockingOff = false;
  /** 먹기 · 활 당기기를 왼손으로 하는 중 */
  private useOff = false;
  private hitWall = false;
  private eggT = new WeakMap<Mob, number>();
  private noteMeta = new Map<string, number>();

  /* 블록 부수기 */
  private breakCell: [number, number, number] | null = null;
  private breakProgress = 0;
  private breakDelay = 0;
  private breakTick = 0;
  private stepDist = 0;
  private eatSoundT = 0;
  private mobVoice = new WeakMap<Mob, number>();
  private particles: BlockParticles;
  private eatT = 0;
  private bowT = 0;

  /* 세계 */
  private time = 0.05;
  private renderDist: number;
  private mobs: Mob[] = [];
  private drops: Drop[] = [];
  private arrows: Arrow[] = [];
  private liquidQueue = new Map<string, number>();
  private spawnT = 0;
  private hudT = 0;
  private saveT = 0;
  private frames = 0;
  private fpsT = 0;
  private fps = 0;
  private seed: number;
  private events: EngineEvents;
  private mineInfo: MineInfo | null;
  private minedCells = new Map<string, [number, number, number]>();
  private shopKey: string;
  private animalsDone = new Set<string>();
  private multi: WildMulti | null;
  private remotes: RemotePlayers | null = null;
  private shadow: SunShadow | null = null;
  private shadowStub: THREE.WebGLRenderTarget;
  private shadowFrame = 0;
  private outbox: number[] = [];
  private applyingRemote = false;
  private lastSwing = 0;
  private needSettle = false;

  /* 그리기 */
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh;
  private crackTex: THREE.Texture[] = [];
  private hand = new THREE.Group();
  private handL = new THREE.Group();
  private heldMesh: THREE.Object3D | null = null;
  private heldMeshL: THREE.Object3D | null = null;
  private heldKey = "";
  private heldKeyL = "";
  private tpKey = "";
  private tpKeyL = "";
  private tpHeld: THREE.Object3D | null = null;
  private tpHeldL: THREE.Object3D | null = null;
  private armMats: THREE.MeshLambertMaterial[] = [];
  private skin: THREE.Texture;
  /** poseSteve 가 root 위치를 덮어써서 월드 배치는 바깥 그룹으로 한다 */
  private steveHolder = new THREE.Group();
  private steve: { root: THREE.Group; limbs: SteveLimbs } | null = null;
  private steveMats: THREE.MeshLambertMaterial[] = [];
  private sun: THREE.Mesh;
  private moon: THREE.Mesh;
  private stars: THREE.Points;
  private clouds: THREE.Mesh;
  private skyGroup = new THREE.Group();
  private ambient = new THREE.AmbientLight(0xffffff, 1);
  private swingT = 0;

  constructor(
    container: HTMLElement,
    opts: { mode: Mode; seed?: number; shop: string; events: EngineEvents; mine?: MineInfo; skinUrl?: string; fresh?: boolean; multi?: WildMulti },
  ) {
    this.container = container;
    this.mode = opts.mode;
    this.events = opts.events;
    this.mineInfo = opts.mine ?? null;
    this.shopKey = opts.shop;
    this.multi = this.mode === "wild" ? (opts.multi ?? null) : null;
    this.touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    this.renderDist = this.mode === "mine" ? 3 : this.touch ? 4 : 6;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.touch ? 1.5 : 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.05, this.renderDist * 16 + 80);
    this.scene.add(this.camera);
    this.scene.add(this.ambient);

    this.mats = makeMaterials(getAtlas());
    this.shadowStub = createShadowStub(this.renderer);
    this.mats.uniforms.uShadowMap.value = this.shadowStub.depthTexture;
    if (this.mode !== "mine") {
      this.shadow = new SunShadow(this.touch ? 1024 : 2048, this.touch ? 30 : 46, this.shadowStub.depthTexture!);
    }
    const group = new THREE.Group();
    this.scene.add(group);

    const saved = this.mode === "wild" && !opts.fresh && !this.multi ? this.readSave() : null;
    this.seed = this.multi?.seed ?? saved?.seed ?? opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    if (this.mode === "mine") {
      this.mineGen = new MineGen(this.mineInfo!.seed);
      this.world = new VoxelWorld(new MineSource(this.mineGen), group, this.mats, B.bedrock);
    } else {
      this.gen = new WorldGen(this.seed);
      this.world = new VoxelWorld(this.gen, group, this.mats, 0);
    }

    if (saved) this.applySave(saved);
    else if (this.multi) this.joinMulti(this.multi);
    else this.newGame();
    if (this.multi) {
      this.world.onRecord = (x, y, z, v) => {
        if (!this.applyingRemote) this.outbox.push(x, y, z, v);
      };
      this.remotes = new RemotePlayers(this.scene);
    }

    /* 선택 테두리 · 금 가는 효과 */
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    for (let i = 0; i < 10; i++) this.crackTex.push(canvasTex(tilePixels(`destroy_stage_${i}`)));
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ map: this.crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    this.crack.visible = false;
    this.scene.add(this.crack);
    this.particles = new BlockParticles(getAtlas(), (x, y, z) => solidAt(this.world.get(x, y, z)));
    this.scene.add(this.particles.points);
    this.syncParticleScale();

    /* 손 · 캐릭터 */
    this.skin = makeSkinTexture({ shirt: 0x2aa7b8, hair: 0x3b2414, pants: 0x3b3f9e, seed: 42 });
    this.buildHand();
    if (opts.skinUrl) this.loadSkin(opts.skinUrl);

    /* 하늘 */
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: sunTex(false), transparent: true, depthWrite: false, fog: false }));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: sunTex(true), transparent: true, depthWrite: false, fog: false }));
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(900 * 3);
    const rr = mulberry32(7);
    for (let i = 0; i < 900; i++) {
      const u = rr() * 2 - 1;
      const a = rr() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      sp.set([Math.cos(a) * s * 380, u * 380, Math.sin(a) * s * 380], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    this.skyGroup.add(this.sun, this.moon, this.stars);
    this.sun.renderOrder = -10;
    this.moon.renderOrder = -10;
    this.stars.renderOrder = -11;
    this.scene.add(this.skyGroup);
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 120;
    this.clouds.visible = this.mode === "wild";
    this.scene.add(this.clouds);
    this.scene.fog = new THREE.Fog(0x9fc7ff, 60, 90);

    if (this.mode === "mine") {
      this.mats.uniforms.uMinLight.value = 0.3;
      this.mats.uniforms.uDaylight.value = 0;
      this.mats.uniforms.uFogColor.value.set(0x040404).convertLinearToSRGB();
      this.mats.uniforms.uFogNear.value = 26;
      this.mats.uniforms.uFogFar.value = 48;
      this.scene.background = new THREE.Color(0x040404);
      // 지형은 셰이더에서 안개를 직접 입히므로, 몹 · 아이템도 같은 거리에서 어둠에 묻히게 맞춘다
      this.scene.fog = new THREE.Fog(0x040404, 26, 48);
      this.skyGroup.visible = false;
    }

    this.bindInput();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.cleanup.push(() => ro.disconnect());

    /* 시작 위치 주변 청크를 미리 만든다 */
    const pcx = Math.floor(this.pos.x / CS);
    const pcz = Math.floor(this.pos.z / CS);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) this.loadChunk(pcx + dx, pcz + dz);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.world.chunks.get(ckey(pcx + dx, pcz + dz));
        if (c && this.world.hasNeighbors(c.cx, c.cz)) this.world.rebuild(c);
      }
    if (!saved && this.mode === "wild") this.settleSpawn();
    this.loop();
  }

  /* ───────────── 저장 ───────────── */

  private saveKey() {
    return `${SAVE_PREFIX}${this.shopKey}`;
  }

  private readSave(): SaveData | null {
    try {
      const raw = localStorage.getItem(this.saveKey());
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      return d?.v === 1 ? d : null;
    } catch {
      return null;
    }
  }

  save() {
    if (this.mode !== "wild" || this.disposed) return;
    if (this.multi) {
      this.flushOutbox();
      this.multi.send.save({ inv: this.inv.serialize(), hp: this.dead ? 20 : this.hp, food: this.dead ? 20 : this.food, sat: this.sat, xp: this.xpTotal });
      return;
    }
    const edits: Record<string, number[]> = {};
    for (const [k, m] of this.world.edits) {
      if (!m.size) continue;
      const arr: number[] = [];
      for (const [i, v] of m) arr.push(i, v);
      edits[k] = arr;
    }
    const data: SaveData = {
      v: 1,
      seed: this.seed,
      pos: [this.pos.x, this.pos.y, this.pos.z],
      yaw: this.yaw,
      pitch: this.pitch,
      hp: this.hp,
      food: this.food,
      sat: this.sat,
      inv: this.inv.serialize(),
      spawn: [this.spawn.x, this.spawn.y, this.spawn.z],
      time: this.time,
      edits,
      chests: Object.fromEntries(this.chests),
      furnaces: Object.fromEntries(this.furnaces),
      xp: this.xpTotal,
    };
    try {
      localStorage.setItem(this.saveKey(), JSON.stringify(data));
    } catch {
      this.events.message("저장 공간이 부족해서 월드를 저장하지 못했어요");
    }
  }

  static clearSave(shop: string) {
    try {
      localStorage.removeItem(`${SAVE_PREFIX}${shop}`);
    } catch {
      /* 무시 */
    }
  }

  static hasSave(shop: string) {
    try {
      return Boolean(localStorage.getItem(`${SAVE_PREFIX}${shop}`));
    } catch {
      return false;
    }
  }

  private applySave(d: SaveData) {
    this.pos.set(...d.pos);
    this.yaw = d.yaw;
    this.pitch = d.pitch;
    this.hp = d.hp > 0 ? d.hp : 20;
    this.food = d.food;
    this.sat = d.sat;
    this.inv.load(d.inv);
    this.spawn.set(...d.spawn);
    this.time = d.time;
    for (const [k, arr] of Object.entries(d.edits ?? {})) {
      const m = new Map<number, number>();
      for (let i = 0; i + 1 < arr.length; i += 2) m.set(arr[i]!, arr[i + 1]!);
      this.world.edits.set(k, m);
    }
    for (const [k, v] of Object.entries(d.chests ?? {})) this.chests.set(k, v);
    for (const [k, v] of Object.entries(d.furnaces ?? {})) this.furnaces.set(k, v);
    this.setXp(d.xp ?? 0);
    this.fallStart = this.pos.y;
  }

  /* ───────────── 멀티 야생 ───────────── */

  /** 서버 월드(편집 · 상자 · 내 가방)를 덮고 아무 육지에서 시작한다 */
  private joinMulti(m: WildMulti) {
    this.storeEdits(m.edits);
    for (const [k, v] of Object.entries(m.chests)) this.chests.set(k, v);
    if (m.state) {
      this.inv.load(m.state.inv as Parameters<Inventory["load"]>[0]);
      this.hp = m.state.hp > 0 ? Math.min(20, m.state.hp) : 20;
      this.food = Math.min(20, Math.max(0, m.state.food));
      this.sat = Math.max(0, m.state.sat);
      this.setXp(typeof m.state.xp === "number" ? m.state.xp : 0);
    }
    this.time = this.sharedTime();
    const s = this.gen!.randomSpawn(WILD_SPAWN_R);
    this.pos.set(s.x, s.y, s.z);
    this.yaw = Math.random() * Math.PI * 2;
    this.spawn.copy(this.pos);
    this.fallStart = this.pos.y;
  }

  /** 아직 안 불러온 청크의 편집은 저장해 뒀다가 청크를 만들 때 덮는다 */
  private storeEdits(flat: number[]) {
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const x = flat[i]!;
      const y = flat[i + 1]!;
      const z = flat[i + 2]!;
      const key = ckey(Math.floor(x / CS), Math.floor(z / CS));
      let m = this.world.edits.get(key);
      if (!m) this.world.edits.set(key, (m = new Map()));
      m.set(idx(x & 15, y, z & 15), flat[i + 3]!);
    }
  }

  private sharedTime() {
    const t0 = this.multi?.t0 ?? Date.now();
    return (((Date.now() - t0) / 1000 / DAY_SECONDS + 0.05) % 1 + 1) % 1;
  }

  /** 다른 사람이 바꾼 블록 */
  applyRemoteEdits(flat: number[]) {
    this.applyingRemote = true;
    try {
      const later: number[] = [];
      for (let i = 0; i + 3 < flat.length; i += 4) {
        const x = flat[i]!;
        const y = flat[i + 1]!;
        const z = flat[i + 2]!;
        const v = flat[i + 3]!;
        if (!this.world.chunkAt(x, z)) {
          later.push(x, y, z, v);
          continue;
        }
        const id = v & 0xff;
        const meta = v >> 8;
        const before = this.world.get(x, y, z);
        if (before === id && this.world.getMeta(x, y, z) === meta) continue;
        this.world.set(x, y, z, id, meta);
        const key = `${x},${y},${z}`;
        if (before === B.chest && id !== B.chest) this.chests.delete(key);
        if ((before === B.furnace || before === B.litFurnace) && id !== B.furnace && id !== B.litFurnace) this.furnaces.delete(key);
        if (id === 0 && before && !BLOCKS[before]!.liquid) this.particles.burst(before, x, y, z, this.lightBright(x, y, z));
      }
      if (later.length) this.storeEdits(later);
    } finally {
      this.applyingRemote = false;
    }
  }

  applyRemoteChest(key: string, slots: (Stack | null)[] | null) {
    if (slots) this.chests.set(key, slots);
    else this.chests.delete(key);
  }

  /** 상자 창을 닫을 때 내용을 서버에 올린다 */
  syncChest(key: string) {
    const c = this.chests.get(key);
    if (this.multi && c) this.multi.send.chest(key, c);
  }

  remoteKnow(id: string, name: string, skin?: string) {
    this.remotes?.know(id, name, skin);
  }

  remoteMove(id: string, p: number[], sneak: 0 | 1) {
    this.remotes?.move(id, p, sneak);
  }

  remoteSwing(id: string) {
    this.remotes?.swing(id);
  }

  remoteGone(id: string) {
    this.remotes?.remove(id);
  }

  get playersNearby() {
    return this.remotes?.count ?? 0;
  }

  private flushOutbox() {
    if (!this.multi || !this.outbox.length) return;
    this.multi.send.edits(this.outbox);
    this.outbox = [];
  }

  private tickMulti(dt: number) {
    const m = this.multi;
    if (!m) return;
    this.flushOutbox();
    const r = (n: number) => Math.round(n * 100) / 100;
    if (!this.dead) m.send.pos([r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.yaw), r(this.pitch)], this.sneaking ? 1 : 0);
    if (this.swingT > this.lastSwing + 0.01) m.send.swing();
    this.lastSwing = this.swingT;
    this.remotes?.update(dt, (x, y, z) => {
      const [s, b] = this.world.lightAt(Math.floor(x), Math.floor(y), Math.floor(z));
      return brightness(Math.max((s / 15) * this.daylight(), b / 15), this.mats.uniforms.uMinLight.value);
    });
  }

  private newGame() {
    if (this.mode === "mine") {
      this.pos.set(MINE_SPAWN.x, MINE_SPAWN.y, MINE_SPAWN.z);
      this.spawn.copy(this.pos);
      this.yaw = Math.PI;
      this.inv.slots[0] = { id: "diamond_pickaxe", count: 1 };
      this.inv.slots[1] = { id: "torch", count: 64 };
      this.inv.slots[2] = { id: "diamond_shovel", count: 1 };
      this.inv.changed();
      return;
    }
    const s = this.gen!.findSpawn();
    this.pos.set(s.x, s.y, s.z);
    this.spawn.copy(this.pos);
    this.fallStart = this.pos.y;
  }

  /** 스폰 기둥의 실제 지면 위로 올린다 */
  private settleSpawn() {
    const x = Math.floor(this.pos.x);
    const z = Math.floor(this.pos.z);
    let y = H - 2;
    while (y > 1 && !solidAt(this.world.get(x, y, z)) && !BLOCKS[this.world.get(x, y, z)]!.liquid) y--;
    this.pos.y = y + 1;
    this.spawn.copy(this.pos);
    this.fallStart = this.pos.y;
  }

  /* ───────────── 청크 ───────────── */

  private loadChunk(cx: number, cz: number) {
    const key = ckey(cx, cz);
    if (this.world.chunks.has(key)) return;
    const c = this.world.load(cx, cz, this.world.edits.get(key));
    if (!c || this.animalsDone.has(key)) return;
    this.animalsDone.add(key);
    if (this.mode !== "wild") return;
    for (const a of c.animals) {
      if (this.mobs.length > 80) break;
      this.addMob(a.kind, a.x, a.y, a.z, true);
    }
  }

  private updateChunks() {
    const pcx = Math.floor(this.pos.x / CS);
    const pcz = Math.floor(this.pos.z / CS);
    const R = this.renderDist;
    const start = performance.now();
    const want: [number, number, number][] = [];
    for (let dz = -R - 1; dz <= R + 1; dz++)
      for (let dx = -R - 1; dx <= R + 1; dx++) {
        const d = dx * dx + dz * dz;
        if (d > (R + 1.5) * (R + 1.5)) continue;
        want.push([pcx + dx, pcz + dz, d]);
      }
    want.sort((a, b) => a[2] - b[2]);
    // 생성(청크당 10ms 이상)이 예산을 다 써서 메시가 굶지 않도록, 매 프레임 메시·생성을 최소 1개씩 보장
    let meshed = 0;
    for (const [cx, cz, d] of want) {
      if (d > R * R + 1) continue;
      if (meshed >= 3 || (meshed > 0 && performance.now() - start > 8)) break;
      const c = this.world.chunks.get(ckey(cx, cz));
      if (c?.dirty && this.world.hasNeighbors(cx, cz)) {
        this.world.rebuild(c);
        meshed++;
      }
    }
    let made = 0;
    for (const [cx, cz] of want) {
      if (made >= 2 || (made > 0 && performance.now() - start > 10)) break;
      if (!this.world.chunks.has(ckey(cx, cz)) && !this.world.isVoid(cx, cz)) {
        this.loadChunk(cx, cz);
        made++;
      }
    }
    for (const [key, c] of this.world.chunks) {
      const dx = c.cx - pcx;
      const dz = c.cz - pcz;
      if (dx * dx + dz * dz > (R + 3) * (R + 3)) this.world.unload(key);
    }
  }

  /* ───────────── 입력 ───────────── */

  private bindInput() {
    const el = this.renderer.domElement;
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));
    };
    const keyDown = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      sfx.unlock();
      const k = e.code;
      if (k === "KeyE" && this.inputOn && !this.dead) {
        e.preventDefault();
        this.openGui({ kind: "inventory" });
        return;
      }
      if (!this.inputOn) return;
      if (["Space", "ArrowUp", "ArrowDown", "F3", "F5", "Tab"].includes(k)) e.preventDefault();
      if (e.ctrlKey && /^(Key[ASDFGHQZXC]|Space|Digit\d)$/.test(k)) e.preventDefault();
      if (k === "ControlLeft" || k === "ControlRight") this.sprintLatch = true;
      if (k === "KeyW" && !e.repeat) {
        const now = performance.now();
        if (now - this.lastW < 280) this.sprintLatch = true;
        this.lastW = now;
      }
      this.keys.add(k);
      if (/^Digit[1-9]$/.test(k)) this.select(Number(k.slice(5)) - 1);
      if (k === "F5") this.viewMode = ((this.viewMode + 1) % 3) as 0 | 1 | 2;
      if (k === "F3") this.showDebug = !this.showDebug;
      if (k === "KeyQ") this.dropHeld(e.ctrlKey);
      if (k === "KeyF" && !e.repeat && !this.dead) this.swapHands();
    };
    const keyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => {
      this.keys.clear();
      this.mouseL = false;
      this.mouseR = false;
      this.sprintLatch = false;
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      this.save();
      if (this.keys.has("ControlLeft") || this.keys.has("ControlRight")) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const pageHide = () => this.save();
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", pageHide);

    const lockChange = () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) {
        this.mouseL = false;
        this.mouseR = false;
      }
      this.events.lock(this.locked);
    };
    document.addEventListener("pointerlockchange", lockChange);
    const mouseMove = (e: MouseEvent) => {
      if (!this.locked || !this.inputOn) return;
      this.yaw -= e.movementX * 0.0024;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * 0.0024));
    };
    document.addEventListener("mousemove", mouseMove);
    const down = (e: MouseEvent) => {
      sfx.unlock();
      if (!this.inputOn || this.dead || this.touch) return;
      if (!this.locked) {
        this.lock();
        return;
      }
      if (e.button === 0) {
        this.mouseL = true;
        this.attack();
      } else if (e.button === 2) {
        this.mouseR = true;
        this.useCooldown = 0;
      } else if (e.button === 1) this.pickBlock();
    };
    const up = (e: MouseEvent) => {
      if (e.button === 0) {
        this.mouseL = false;
        this.breakCell = null;
        this.breakProgress = 0;
      } else if (e.button === 2) {
        this.mouseR = false;
        this.releaseUse();
      }
    };
    const wheel = (e: WheelEvent) => {
      if (!this.inputOn || !this.locked) return;
      e.preventDefault();
      this.select((this.inv.selected + (e.deltaY > 0 ? 1 : 8)) % 9);
    };
    const ctx = (e: Event) => e.preventDefault();
    el.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", ctx);

    /* 터치: 오른쪽 화면 드래그 = 시점 */
    let lookId: number | null = null;
    let lx = 0;
    let ly = 0;
    const tStart = (e: TouchEvent) => {
      sfx.unlock();
      for (const t of Array.from(e.changedTouches)) {
        if (lookId === null && t.clientX > window.innerWidth * 0.35) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    };
    const tMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== lookId || !this.inputOn) continue;
        this.yaw -= (t.clientX - lx) * 0.006;
        this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - (t.clientY - ly) * 0.006));
        lx = t.clientX;
        ly = t.clientY;
      }
      e.preventDefault();
    };
    const tEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === lookId) lookId = null;
    };
    el.addEventListener("touchstart", tStart, { passive: true });
    el.addEventListener("touchmove", tMove, { passive: false });
    el.addEventListener("touchend", tEnd);
    el.addEventListener("touchcancel", tEnd);

    this.cleanup.push(() => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
      document.removeEventListener("pointerlockchange", lockChange);
      document.removeEventListener("mousemove", mouseMove);
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", ctx);
      el.removeEventListener("touchstart", tStart);
      el.removeEventListener("touchmove", tMove);
      el.removeEventListener("touchend", tEnd);
      el.removeEventListener("touchcancel", tEnd);
    });
  }

  lock() {
    if (this.touch || this.dead) return;
    const el = this.renderer.domElement as HTMLCanvasElement & { requestPointerLock(o?: unknown): Promise<void> | void };
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => el.requestPointerLock());
    } catch {
      el.requestPointerLock();
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setInputEnabled(on: boolean) {
    this.inputOn = on;
    if (!on) {
      this.keys.clear();
      this.mouseL = false;
      this.mouseR = false;
      this.breakCell = null;
      this.unlock();
    }
  }

  isTouch() {
    return this.touch;
  }

  setMobileMove(x: number, y: number) {
    this.mobileMove = { x, y };
  }

  setMobileJump(on: boolean) {
    this.mobileJump = on;
  }

  setMobileSneak(on: boolean) {
    if (on) this.keys.add("ShiftLeft");
    else this.keys.delete("ShiftLeft");
  }

  mobileBreak(on: boolean) {
    this.mouseL = on;
    if (on) this.attack();
    else {
      this.breakCell = null;
      this.breakProgress = 0;
    }
  }

  mobileUse(on: boolean) {
    this.mouseR = on;
    if (on) this.useCooldown = 0;
    else this.releaseUse();
  }

  select(i: number) {
    if (this.inv.selected === i) return;
    this.inv.selected = i;
    this.eatT = 0;
    this.bowT = 0;
    this.inv.changed();
    this.events.inv();
  }

  /** F: 주 손 ↔ 왼손 */
  swapHands() {
    this.inv.swapHands();
    this.eatT = 0;
    this.bowT = 0;
    this.swingT = Math.max(this.swingT, 0.12);
    this.events.inv();
  }

  openGui(g: GuiOpen) {
    this.setInputEnabled(false);
    this.events.gui(g);
  }

  /* ───────────── 상호작용 ───────────── */

  private eyePos() {
    const eye = EYE - (EYE - SNEAK_EYE) * this.sneakT;
    return new THREE.Vector3(this.pos.x, this.pos.y + eye, this.pos.z);
  }

  private lookDir() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  private targetBlock(liquid = false) {
    const e = this.eyePos();
    const d = this.lookDir();
    return this.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, REACH, liquid);
  }

  private targetMob(maxDist: number): { mob: Mob; dist: number } | null {
    const e = this.eyePos();
    const d = this.lookDir();
    let best: { mob: Mob; dist: number } | null = null;
    for (const m of this.mobs) {
      if (m.deadT > 0) continue;
      const hw = m.spec.w / 2;
      const t = rayBox(e, d, m.pos.x - hw, m.pos.y, m.pos.z - hw, m.pos.x + hw, m.pos.y + m.spec.h, m.pos.z + hw);
      if (t !== null && t <= maxDist && (!best || t < best.dist)) best = { mob: m, dist: t };
    }
    return best;
  }

  private attack() {
    if (this.dead) return;
    this.swingT = 0.3;
    const hit = this.targetBlock();
    const mob = this.targetMob(3);
    if (mob && (!hit || mob.dist < hit.dist)) {
      const held = this.inv.held();
      const info = held ? item(held.id) : undefined;
      const base = info?.damage ?? 1;
      const cooldown = info?.tool ? ({ sword: 0.625, axe: 1.0, pickaxe: 0.83, shovel: 1, hoe: 0.5, shears: 0.25 } as const)[info.tool.kind] : 0.25;
      const charge = Math.min(1, this.attackCharge / cooldown);
      const sharp = enchLevel(held, "sharpness");
      let dmg = base * (0.2 + 0.8 * charge * charge) + (sharp ? (0.5 * sharp + 0.5) * charge : 0);
      if (!this.onGround && this.vel.y < 0 && charge > 0.9) dmg *= 1.5;
      this.attackCharge = 0;
      // 달리면서 꽉 찬 공격: 넉백이 더 세지고 달리기가 풀린다
      const sprintHit = this.sprinting && charge > 0.9;
      sfx.attack(charge > 0.9);
      const fire = enchLevel(held, "fire_aspect");
      if (fire) mob.mob.burnT = Math.max(mob.mob.burnT, fire * 4);
      this.hurtMob(mob.mob, dmg, this.lookDir(), (sprintHit ? 2.25 : 1) + enchLevel(held, "knockback") * 1.2, enchLevel(held, "looting"));
      if (sprintHit) {
        this.sprintLatch = false;
        this.vel.x *= 0.6;
        this.vel.z *= 0.6;
      }
      this.exhaust(0.1);
      if (info?.tool && this.inv.damageHeld(info.tool.kind === "sword" ? 1 : 2)) this.events.message("도구가 부서졌어요");
      this.events.inv();
    }
  }

  private hurtMob(m: Mob, dmg: number, dir: THREE.Vector3, knock = 1, looting = 0) {
    if (m.hurtT > 0 || m.deadT > 0) return;
    m.hp -= dmg;
    m.hurtT = 0.5;
    m.fleeT = m.spec.hostile ? 0 : 5;
    const flat = Math.hypot(dir.x, dir.z);
    if (flat > 1e-4) {
      m.vel.x = m.vel.x / 2 + (dir.x / flat) * KNOCK_H * knock;
      m.vel.z = m.vel.z / 2 + (dir.z / flat) * KNOCK_H * knock;
      if (m.onGround) m.vel.y = Math.min(KNOCK_V, m.vel.y / 2 + KNOCK_V);
      m.onGround = false;
    }
    if (m.kind === "spider") m.attackT = 0;
    sfx.mobHurt(m.kind, this.volAt(m.pos), m.hp <= 0);
    if (m.hp <= 0) {
      m.deadT = 0.01;
      for (const d of m.spec.drops) {
        if (m.kind === "sheep" && d.item === "white_wool" && m.sheared) continue;
        const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1 + looting));
        const id = m.kind === "sheep" && d.item === "white_wool" ? `${m.woolColor ?? "white"}_wool` : d.item;
        if (n > 0) this.spawnDrop({ id: m.burnT > 0 && item(`cooked_${id}`) ? `cooked_${id}` : id, count: n }, m.pos.x, m.pos.y + 0.5, m.pos.z);
      }
      if (this.mode === "wild") this.spawnOrbs(m.spec.hostile ? 5 : 1 + Math.floor(Math.random() * 3), m.pos.x, m.pos.y + 0.5, m.pos.z);
    }
  }

  private breakTime(def: BlockDef, held: Stack | null) {
    if (def.hardness < 0) return Infinity;
    if (def.hardness === 0) return 0;
    const tool = held ? item(held.id)?.tool : undefined;
    let speed = 1;
    const right = tool && def.tool && tool.kind === def.tool;
    if (right) speed = tool!.speed;
    if (tool?.kind === "shears" && (isLeaf(def.id) || def.key.endsWith("_wool"))) speed = isLeaf(def.id) ? 15 : 5;
    if (tool?.kind === "sword" && isLeaf(def.id)) speed = 1.5;
    const canHarvest = this.canHarvest(def, held);
    const eff = enchLevel(held, "efficiency");
    if (eff && speed > 1 && canHarvest) speed += eff * eff + 1;
    if (this.headInWater) speed /= 5;
    if (!this.onGround && !this.inWater) speed /= 5;
    const perTick = speed / def.hardness / (canHarvest ? 30 : 100);
    if (perTick >= 1) return 0;
    return Math.ceil(1 / perTick) / 20;
  }

  private canHarvest(def: BlockDef, held: Stack | null) {
    if (!def.needsTool) return true;
    const tool = held ? item(held.id)?.tool : undefined;
    if (!tool || tool.kind !== def.tool) return false;
    return tool.tier >= (def.tier ?? 0);
  }

  private updateBreaking(dt: number) {
    this.breakDelay = Math.max(0, this.breakDelay - dt);
    if (!this.mouseL || this.dead || !this.inputOn) {
      this.crack.visible = false;
      return;
    }
    const hit = this.targetBlock();
    if (!hit) {
      this.breakCell = null;
      this.crack.visible = false;
      return;
    }
    const mob = this.targetMob(3);
    if (mob && mob.dist < hit.dist) return;
    // 누르고 있는 동안 팔을 계속 휘두른다
    if (this.swingT <= 0) this.swingT = 0.3;
    // 마인크래프트처럼 블록 하나를 부순 뒤 5틱(0.25초) 쉬었다 다음 블록을 캔다
    if (this.breakDelay > 0) {
      this.crack.visible = false;
      return;
    }
    const same = this.breakCell && this.breakCell[0] === hit.x && this.breakCell[1] === hit.y && this.breakCell[2] === hit.z;
    if (!same) {
      this.breakCell = [hit.x, hit.y, hit.z];
      this.breakProgress = 0;
      this.breakTick = 0;
    }
    const def = BLOCKS[hit.id]!;
    const held = this.inv.held();
    const t = this.breakTime(def, held);
    if (t === Infinity) return;
    const bright = this.lightBright(hit.x + hit.face[0], hit.y + hit.face[1], hit.z + hit.face[2]);
    const ticksBefore = Math.floor(this.breakTick);
    this.breakTick += dt * 20;
    for (let k = ticksBefore; k < Math.floor(this.breakTick); k++) {
      if (k % 4 === 0) sfx.block(soundOf(def), "hit");
      this.particles.crack(hit.id, hit.x, hit.y, hit.z, hit.face, bright);
    }
    this.breakProgress += t === 0 ? 1 : dt / t;
    if (this.breakProgress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, true);
      this.breakCell = null;
      this.breakProgress = 0;
      this.crack.visible = false;
      if (t > 0) this.breakDelay = BREAK_DELAY;
      return;
    }
    if (this.breakProgress > 0) {
      const stage = Math.min(9, Math.floor(this.breakProgress * 10));
      (this.crack.material as THREE.MeshBasicMaterial).map = this.crackTex[stage]!;
      this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.crack.visible = true;
    }
  }

  /** 블록을 부수고 (byPlayer 면) 드롭 · 내구도 처리 */
  breakBlock(x: number, y: number, z: number, byPlayer: boolean) {
    const id = this.world.get(x, y, z);
    if (!id) return;
    const def = BLOCKS[id]!;
    const held = byPlayer ? this.inv.held() : null;
    const meta = this.world.getMeta(x, y, z);
    this.world.set(x, y, z, 0);
    if (!def.liquid) {
      this.particles.burst(id, x, y, z, this.lightBright(x, y, z));
      sfx.block(soundOf(def), "break", this.volAt(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)));
    }
    if (byPlayer && this.mode === "mine" && this.mineInfo && this.mineGen?.isTarget(this.mineInfo.ore, x, y, z)) {
      const k = `${x},${y},${z}`;
      if (!this.minedCells.has(k)) {
        this.minedCells.set(k, [x, y, z]);
        this.events.mined?.([...this.minedCells.values()]);
      }
    }
    if (!byPlayer || this.canHarvest(def, held)) {
      for (const s of this.dropsOf(def, meta, held)) this.spawnDrop(s, x + 0.5, y + 0.3, z + 0.5);
      const xp = byPlayer && this.mode === "wild" && !enchLevel(held, "silk_touch") ? ORE_XP[def.key.replace("deepslate_", "")] : undefined;
      if (xp) this.spawnOrbs(xp[0] + Math.floor(Math.random() * (xp[1] - xp[0] + 1)), x + 0.5, y + 0.5, z + 0.5);
    }
    this.noteMeta.delete(`${x},${y},${z}`);
    const key = `${x},${y},${z}`;
    const chest = this.chests.get(key);
    if (chest) {
      for (const s of chest) if (s) this.spawnDrop(s, x + 0.5, y + 0.5, z + 0.5);
      this.chests.delete(key);
      this.multi?.send.chest(key, null);
    }
    const f = this.furnaces.get(key);
    if (f) {
      for (const s of [f.input, f.fuel, f.output]) if (s) this.spawnDrop(s, x + 0.5, y + 0.5, z + 0.5);
      this.furnaces.delete(key);
    }
    if (byPlayer) {
      this.exhaust(0.005);
      const tool = held ? item(held.id)?.tool : undefined;
      if (tool && def.hardness > 0 && this.mode !== "mine") {
        if (this.inv.damageHeld(tool.kind === "sword" ? 2 : 1)) this.events.message("도구가 부서졌어요");
        this.events.inv();
      }
    }
    this.afterChange(x, y, z);
  }

  private dropsOf(def: BlockDef, meta: number, held: Stack | null): Stack[] {
    const tool = held ? item(held.id)?.tool : undefined;
    if (tool?.kind === "shears" && (isLeaf(def.id) || def.key === "short_grass" || def.key === "fern")) return [{ id: def.key, count: 1 }];
    if (enchLevel(held, "silk_touch") && item(def.key) && def.shape !== "crop") return [{ id: def.key, count: 1 }];
    const fortune = enchLevel(held, "fortune");
    if (fortune && oreOf(def.id) && def.drops?.length) {
      // 행운: 마인크래프트처럼 개수에 (0 ~ 레벨+1) 배를 곱하되 최소 1배
      const mult = Math.max(1, Math.floor(Math.random() * (fortune + 2)));
      const d = def.drops[0]!;
      const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      return [{ id: d.item, count: n * mult }];
    }
    if (def.key === "gravel") return [{ id: Math.random() < 0.1 + fortune * 0.05 ? "flint" : "gravel", count: 1 }];
    if (def.key === "wheat") {
      if ((meta & 7) >= 7) return [{ id: "wheat", count: 1 }, { id: "wheat_seeds", count: 1 + Math.floor(Math.random() * 3) }];
      return [{ id: "wheat_seeds", count: 1 }];
    }
    if (isLeaf(def.id) && meta & 1 && !def.drops) return [];
    if (!def.drops) return item(def.key) ? [{ id: def.key, count: 1 }] : [];
    const out: Stack[] = [];
    for (const d of def.drops) {
      if (d.chance !== undefined && Math.random() >= d.chance) continue;
      const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (n > 0) out.push({ id: d.item, count: n });
    }
    return out;
  }

  /** 블록이 바뀐 뒤: 받침 · 모래 떨어짐 · 물 흐름 */
  private afterChange(x: number, y: number, z: number) {
    const up = this.world.get(x, y + 1, z);
    const upDef = BLOCKS[up]!;
    const wallMounted = upDef.shape === "ladder" || (upDef.shape === "torch" && this.world.getMeta(x, y + 1, z) >= 1);
    if (up && upDef.needsSupport && !wallMounted && !this.supports(x, y, z, upDef)) this.breakBlock(x, y + 1, z, false);
    if (up && upDef.gravity && !solidAt(this.world.get(x, y, z))) this.fall(x, y + 1, z);
    const self = this.world.get(x, y, z);
    if (self && BLOCKS[self]!.gravity && !solidAt(this.world.get(x, y - 1, z)) && !BLOCKS[this.world.get(x, y - 1, z)]!.liquid) this.fall(x, y, z);
    for (const [dx, dz, m] of [
      [0, 1, 1],
      [0, -1, 2],
      [1, 0, 3],
      [-1, 0, 4],
    ] as const) {
      const id = this.world.get(x + dx, y, z + dz);
      if ((id === B.torch || id === B.ladder) && this.world.getMeta(x + dx, y, z + dz) === m && !solidAt(this.world.get(x, y, z))) this.breakBlock(x + dx, y, z + dz, false);
    }
    for (const [dx, dy, dz] of [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const)
      this.scheduleLiquid(x + dx, y + dy, z + dz);
  }

  private supports(x: number, y: number, z: number, def: BlockDef) {
    const below = this.world.get(x, y, z);
    if (def.needsSupport === "farmland") return below === B.farmland;
    if (def.needsSupport === "sand") return below === B.sand || below === B.grass || below === B.dirt || below === def.id;
    if (def.needsSupport === "ground") return below === B.grass || below === B.dirt || below === B.farmland || below === B.grassSnow || below === def.id;
    return solidAt(below);
  }

  private fall(x: number, y: number, z: number) {
    const id = this.world.get(x, y, z);
    const meta = this.world.getMeta(x, y, z);
    let ny = y;
    while (ny > 1) {
      const below = this.world.get(x, ny - 1, z);
      if (solidAt(below)) break;
      if (below && !BLOCKS[below]!.replaceable && !BLOCKS[below]!.liquid) break;
      ny--;
    }
    if (ny === y) return;
    this.world.set(x, y, z, 0);
    const replaced = this.world.get(x, ny, z);
    if (replaced && BLOCKS[replaced]!.needsSupport) this.breakBlock(x, ny, z, false);
    this.world.set(x, ny, z, id, meta);
    this.afterChange(x, y, z);
  }

  private pickBlock() {
    const hit = this.targetBlock();
    if (!hit) return;
    const key = hit.id === B.litFurnace ? "furnace" : BLOCKS[hit.id]!.key;
    const at = this.inv.slots.findIndex((s, i) => i < 9 && s?.id === key);
    if (at >= 0) this.select(at);
  }

  /** 우클릭을 누르고 있는 동안 쓰는 것 (활 · 음식 · 우유 · 방패) */
  private holdUse(s: Stack | null) {
    if (!s) return false;
    if (s.id === "bow") return this.inv.count("arrow") > 0;
    if (s.id === "shield" || s.id === "milk_bucket") return true;
    return Boolean(item(s.id)?.food) && (this.food < 20 || s.id === "golden_apple");
  }

  private handStack(off: boolean) {
    return off ? this.inv.offhand : this.inv.held();
  }

  private setHand(off: boolean, s: Stack | null) {
    if (off) this.inv.offhand = s;
    else this.inv.slots[this.inv.selected] = s;
    this.inv.changed();
  }

  private releaseUse() {
    const held = this.handStack(this.useOff);
    if (held?.id === "bow" && this.bowT > 0.1) {
      const charge = Math.min(1, this.bowT);
      if (this.inv.count("arrow") > 0) {
        if (!enchLevel(held, "infinity")) this.inv.take("arrow", 1);
        const e = this.eyePos();
        const d = this.lookDir();
        const power = enchLevel(held, "power");
        this.shootArrow(e.addScaledVector(d, 0.5), d.multiplyScalar(48 * charge), true, Math.ceil(6 * charge * (power ? 1 + 0.25 * (power + 1) : 1)));
        sfx.bow();
        if (this.inv.damageHeld(1, this.useOff)) this.events.message("활이 부서졌어요");
        this.events.inv();
      }
    }
    this.bowT = 0;
    this.eatT = 0;
    this.blocking = false;
  }

  private updateUse(dt: number) {
    this.useCooldown -= dt;
    this.blocking = false;
    if (!this.mouseR || this.dead || !this.inputOn) return;
    const main = this.inv.held();
    const off = this.inv.offhand;
    // 주 손이 먼저, 주 손으로 할 게 없으면 왼손 (마인크래프트 순서)
    if (this.eatT <= 0 && this.bowT <= 0) {
      const mainBlock = main ? item(main.id)?.block !== undefined : false;
      this.useOff = !this.holdUse(main) && this.holdUse(off) && !(mainBlock && this.targetBlock());
    }
    const hand = this.handStack(this.useOff);
    const info = hand ? item(hand.id) : undefined;
    if (hand?.id === "shield") {
      this.blocking = true;
      this.blockingOff = this.useOff;
      return;
    }
    if (hand?.id === "bow" && this.holdUse(hand)) {
      this.bowT += dt;
      return;
    }
    if (hand && this.holdUse(hand) && (info?.food || hand.id === "milk_bucket")) {
      this.eatT += dt;
      this.swingT = Math.max(this.swingT, 0.05);
      this.eatSoundT -= dt;
      if (this.eatT > 0.35 && this.eatSoundT <= 0) {
        this.eatSoundT = 0.2;
        if (hand.id === "milk_bucket") sfx.drink();
        else sfx.eat();
      }
      if (this.eatT >= 1.6) {
        this.eatT = 0;
        if (hand.id === "milk_bucket") {
          this.regenFx = 0;
          this.absorb = 0;
          this.setHand(this.useOff, { id: "bucket", count: 1 });
        } else {
          sfx.burp();
          this.food = Math.min(20, this.food + info!.food!.hunger);
          this.sat = Math.min(this.food, this.sat + info!.food!.saturation);
          this.inv.consumeHeld(1, this.useOff);
          if (hand.id === "mushroom_stew") this.inv.add({ id: "bowl", count: 1 });
          if (hand.id === "golden_apple") {
            this.regenFx = 5;
            this.absorb = Math.max(this.absorb, 4);
          }
        }
        this.events.inv();
      }
      return;
    }
    if (this.useCooldown > 0) return;
    this.useCooldown = 0.25;
    if (!this.use(false)) this.use(true);
  }

  /** 우클릭 한 번 (off 면 왼손으로). 무언가 했으면 true */
  private use(off: boolean): boolean {
    const held = this.handStack(off);
    const info = held ? item(held.id) : undefined;
    const mob = this.targetMob(3);
    const hit = this.targetBlock(held?.id === "bucket");
    const done = () => {
      this.swingT = 0.3;
      this.events.inv();
      return true;
    };
    if (mob && (!hit || mob.dist < hit.dist)) {
      const m = mob.mob;
      if (held?.id === "shears" && m.kind === "sheep" && !m.sheared) {
        m.sheared = true;
        this.spawnDrop({ id: `${m.woolColor ?? "white"}_wool`, count: 1 + Math.floor(Math.random() * 3) }, m.pos.x, m.pos.y + 1, m.pos.z);
        this.inv.damageHeld(1, off);
        return done();
      }
      if (held?.id === "bucket" && m.kind === "cow") {
        sfx.drink();
        if (held.count > 1) {
          this.inv.consumeHeld(1, off);
          const left = this.inv.add({ id: "milk_bucket", count: 1 });
          if (left) this.spawnDrop({ id: "milk_bucket", count: 1 }, this.pos.x, this.pos.y + 1, this.pos.z);
        } else this.setHand(off, { id: "milk_bucket", count: 1 });
        return done();
      }
      if (held?.id.endsWith("_dye") && m.kind === "sheep" && !m.sheared) {
        const color = held.id.slice(0, -4);
        if (m.woolColor === color) return false;
        dyeSheep(m, color);
        this.inv.consumeHeld(1, off);
        return done();
      }
      return false;
    }
    if (!hit) return false;
    const def = BLOCKS[hit.id]!;
    const key = `${hit.x},${hit.y},${hit.z}`;
    if (!off && def.gui && !this.sneaking) {
      if (def.gui === "crafting") this.openGui({ kind: "crafting" });
      else if (def.gui === "chest") {
        if (!this.chests.has(key)) this.chests.set(key, Array(27).fill(null));
        this.openGui({ kind: "chest", key });
      } else if (def.gui === "enchanting") this.openGui({ kind: "enchanting", key });
      else {
        if (!this.furnaces.has(key)) this.furnaces.set(key, { input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 });
        this.openGui({ kind: "furnace", key });
      }
      return true;
    }
    if (!off && hit.id === B.noteBlock && !this.sneaking) {
      const n = ((this.noteMeta.get(key) ?? -1) + 1) % 25;
      this.noteMeta.set(key, n);
      sfx.note(n);
      this.particles.burst(hit.id, hit.x, hit.y + 0.6, hit.z, 1);
      this.swingT = 0.3;
      return true;
    }
    if (!held) return false;
    const [fx, fy, fz] = hit.face;
    const nx = hit.x + fx;
    const ny = hit.y + fy;
    const nz = hit.z + fz;

    if (held.id === "flint_and_steel") {
      if (hit.id === B.tnt) {
        this.world.set(hit.x, hit.y, hit.z, 0);
        this.afterChange(hit.x, hit.y, hit.z);
        this.primeTnt(hit.x, hit.y, hit.z, 4);
      }
      sfx.ignite();
      if (this.inv.damageHeld(1, off)) this.events.message("부싯돌과 부시가 부서졌어요");
      return done();
    }
    if (held.id === "bucket") {
      if (def.liquid && (this.world.getMeta(hit.x, hit.y, hit.z) & 7) === 0) {
        this.world.set(hit.x, hit.y, hit.z, 0);
        this.afterChange(hit.x, hit.y, hit.z);
        sfx.splash(0.6);
        const full = def.liquid === "water" ? "water_bucket" : "lava_bucket";
        if (held.count > 1) {
          this.inv.consumeHeld(1, off);
          const left = this.inv.add({ id: full, count: 1 });
          if (left) this.spawnDrop({ id: full, count: 1 }, this.pos.x, this.pos.y + 1, this.pos.z);
        } else this.setHand(off, { id: full, count: 1 });
        return done();
      }
      return false;
    }
    if (held.id === "water_bucket" || held.id === "lava_bucket") {
      const target = def.replaceable && !def.liquid ? [hit.x, hit.y, hit.z] : [nx, ny, nz];
      const cur = this.world.get(target[0]!, target[1]!, target[2]!);
      if (cur && !BLOCKS[cur]!.replaceable) return false;
      this.world.set(target[0]!, target[1]!, target[2]!, held.id === "water_bucket" ? B.water : B.lava, 0);
      sfx.splash(0.6);
      this.afterChange(target[0]!, target[1]!, target[2]!);
      this.setHand(off, { id: "bucket", count: 1 });
      return done();
    }
    if (info?.tool?.kind === "hoe" && (hit.id === B.grass || hit.id === B.dirt) && fy === 1 && !this.world.get(hit.x, hit.y + 1, hit.z)) {
      this.world.set(hit.x, hit.y, hit.z, B.farmland);
      this.inv.damageHeld(1, off);
      return done();
    }
    if (held.id === "bone_meal") {
      if (!this.boneMeal(hit.x, hit.y, hit.z)) return false;
      this.inv.consumeHeld(1, off);
      return done();
    }
    if (info?.block === undefined) return false;

    let px = nx;
    let py = ny;
    let pz = nz;
    if (def.replaceable && !def.liquid && hit.id !== info.block) {
      px = hit.x;
      py = hit.y;
      pz = hit.z;
    }
    if (py < 1 || py >= H - 1) return false;
    const cur = this.world.get(px, py, pz);
    if (cur && !BLOCKS[cur]!.replaceable) return false;
    const place = BLOCKS[info.block]!;
    let meta = 0;
    if (place.needsSupport) {
      if (place.shape === "torch" || place.shape === "ladder") {
        if (fy === 1 && place.shape === "torch") meta = 0;
        else if (fy !== 0) return false;
        else meta = fz === 1 ? 1 : fz === -1 ? 2 : fx === 1 ? 3 : 4;
        if (!solidAt(this.world.get(px - (meta === 3 ? 1 : meta === 4 ? -1 : 0), py - (meta === 0 ? 1 : 0), pz - (meta === 1 ? 1 : meta === 2 ? -1 : 0)))) return false;
      } else if (!this.supports(px, py - 1, pz, place)) return false;
      if (place.key === "sugar_cane" && this.world.get(px, py - 1, pz) !== place.id) {
        const wet = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dz]) => BLOCKS[this.world.get(px + dx!, py - 1, pz + dz!)]!.liquid === "water");
        if (!wet) return false;
      }
    }
    if (place.facing) {
      const a = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const q = Math.round(a / (Math.PI / 2)) % 4;
      meta = [0, 2, 1, 3][q]!;
    }
    if (place.axis) meta = fx !== 0 ? 1 : fz !== 0 ? 2 : 0;
    if (isLeaf(place.id)) meta = 1;
    if (place.solid && SOLID_SHAPES.has(place.shape) && this.intersectsPlayer(px, py, pz)) return false;
    for (const m of this.mobs) {
      if (!place.solid || m.deadT > 0) continue;
      const hw = m.spec.w / 2;
      if (px + 1 > m.pos.x - hw && px < m.pos.x + hw && pz + 1 > m.pos.z - hw && pz < m.pos.z + hw && py + 1 > m.pos.y && py < m.pos.y + m.spec.h) return false;
    }
    if (cur) this.breakBlock(px, py, pz, false);
    this.world.set(px, py, pz, place.id, meta);
    sfx.block(soundOf(place), "place");
    this.afterChange(px, py, pz);
    this.inv.consumeHeld(1, off);
    return done();
  }

  private intersectsPlayer(x: number, y: number, z: number) {
    const h = this.sneaking ? 1.5 : 1.8;
    return x + 1 > this.pos.x - HALF && x < this.pos.x + HALF && z + 1 > this.pos.z - HALF && z < this.pos.z + HALF && y + 1 > this.pos.y && y < this.pos.y + h;
  }

  private boneMeal(x: number, y: number, z: number) {
    const id = this.world.get(x, y, z);
    const def = BLOCKS[id]!;
    if (id === B.wheat) {
      const age = this.world.getMeta(x, y, z) & 7;
      if (age >= 7) return false;
      this.world.set(x, y, z, id, Math.min(7, age + 2 + Math.floor(Math.random() * 4)));
      return true;
    }
    if (def.sapling) {
      if (Math.random() < 0.45) this.growTree(x, y, z, def.sapling);
      return true;
    }
    if (id === B.grass && !this.world.get(x, y + 1, z)) {
      const r = mulberry32((x * 73 + z * 31 + y) >>> 0);
      for (let i = 0; i < 24; i++) {
        const gx = x + Math.floor(r() * 7) - 3;
        const gz = z + Math.floor(r() * 7) - 3;
        if (this.world.get(gx, y, gz) === B.grass && !this.world.get(gx, y + 1, gz)) {
          const k = r();
          this.world.set(gx, y + 1, gz, k < 0.8 ? bidOf("short_grass") : k < 0.9 ? bidOf("dandelion") : bidOf("poppy"));
        }
      }
      return true;
    }
    return false;
  }

  private growTree(x: number, y: number, z: number, kind: import("@/lib/voxel/blocks").TreeKind) {
    const shape = treeShape(kind, mulberry32((x * 9283 + z * 113 + y) >>> 0));
    for (const [dx, dy, dz, raw] of shape) {
      if (dx === 0 && dz === 0 && dy > 0 && raw & 0x100) {
        const cur = this.world.get(x, y + dy, z);
        if (cur && !BLOCKS[cur]!.replaceable && !isLeaf(cur)) return;
      }
    }
    this.world.set(x, y, z, 0);
    for (const [dx, dy, dz, raw] of shape) {
      const tx = x + dx;
      const ty = y + dy;
      const tz = z + dz;
      const cur = this.world.get(tx, ty, tz);
      const isLog = raw & 0x100;
      if (isLog ? !cur || BLOCKS[cur]!.replaceable || isLeaf(cur) : !cur || BLOCKS[cur]!.replaceable) this.world.set(tx, ty, tz, raw & 0xff, 0);
    }
    if (this.world.get(x, y - 1, z) === B.grass) this.world.set(x, y - 1, z, B.dirt);
  }

  /* ───────────── 아이템 ───────────── */

  spawnDrop(stack: Stack, x: number, y: number, z: number, vel?: THREE.Vector3) {
    if (this.drops.length > 260) {
      const old = this.drops.shift()!;
      this.removeDrop(old);
    }
    const { obj, mats } = dropMesh(stack.id);
    markCasters(obj);
    this.scene.add(obj);
    this.drops.push({
      pos: new THREE.Vector3(x, y, z),
      vel: vel ?? new THREE.Vector3((Math.random() - 0.5) * 2.4, 3.5, (Math.random() - 0.5) * 2.4),
      stack: { ...stack },
      age: 0,
      obj,
      mats,
      spin: Math.random() * Math.PI * 2,
    });
  }

  private removeDrop(d: Drop) {
    this.scene.remove(d.obj);
    for (const m of d.mats) m.dispose();
  }

  private dropHeld(all: boolean) {
    const held = this.inv.held();
    if (!held) return;
    const n = all ? held.count : 1;
    const e = this.eyePos();
    const d = this.lookDir();
    this.spawnDrop({ ...held, count: n }, e.x + d.x * 0.4, e.y - 0.3, e.z + d.z * 0.4, d.clone().multiplyScalar(6).add(new THREE.Vector3(0, 1.5, 0)));
    const age = this.drops[this.drops.length - 1]!;
    age.age = -1.5;
    this.inv.consumeHeld(n);
    this.events.inv();
  }

  /** GUI 에서 밖으로 버린 아이템 */
  throwStack(s: Stack) {
    const e = this.eyePos();
    const d = this.lookDir();
    this.spawnDrop(s, e.x + d.x * 0.4, e.y - 0.3, e.z + d.z * 0.4, d.clone().multiplyScalar(5).add(new THREE.Vector3(0, 1.5, 0)));
    this.drops[this.drops.length - 1]!.age = -1.5;
  }

  private updateDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]!;
      d.age += dt;
      d.vel.y -= 16 * dt;
      d.vel.x *= Math.pow(0.1, dt);
      d.vel.z *= Math.pow(0.1, dt);
      const np = d.pos.clone().addScaledVector(d.vel, dt);
      if (solidAt(this.world.get(Math.floor(np.x), Math.floor(np.y - 0.12), Math.floor(np.z)))) {
        np.y = Math.floor(np.y - 0.12) + 1.12;
        d.vel.y = 0;
        d.vel.x *= 0.6;
        d.vel.z *= 0.6;
      }
      if (solidAt(this.world.get(Math.floor(np.x), Math.floor(np.y), Math.floor(d.pos.z)))) {
        np.x = d.pos.x;
        d.vel.x = 0;
      }
      if (solidAt(this.world.get(Math.floor(d.pos.x), Math.floor(np.y), Math.floor(np.z)))) {
        np.z = d.pos.z;
        d.vel.z = 0;
      }
      if (BLOCKS[this.world.get(Math.floor(np.x), Math.floor(np.y), Math.floor(np.z))]!.liquid) d.vel.y = Math.max(d.vel.y, 1);
      d.pos.copy(np);
      // 마인크래프트처럼 천천히 돌면서 위아래로 둥실
      d.obj.position.set(d.pos.x, d.pos.y + 0.13 + Math.sin(d.age * 2 + d.spin) * 0.1, d.pos.z);
      d.obj.rotation.y = d.age + d.spin;
      const [s, b] = this.world.lightAt(Math.floor(d.pos.x), Math.floor(d.pos.y + 0.3), Math.floor(d.pos.z));
      const br = brightness(Math.max((s / 15) * this.daylight(), b / 15), this.mats.uniforms.uMinLight.value);
      for (const m of d.mats) {
        const base = m.userData.base as THREE.Color;
        m.color.setRGB(base.r * br, base.g * br, base.b * br);
      }
      if (d.age > 300 || d.pos.y < -10) {
        this.removeDrop(d);
        this.drops.splice(i, 1);
        continue;
      }
      if (d.age > 0.5 && !this.dead) {
        const dx = d.pos.x - this.pos.x;
        const dy = d.pos.y - (this.pos.y + 0.6);
        const dz = d.pos.z - this.pos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1.6) {
          const left = this.inv.add(d.stack);
          if (left < d.stack.count) {
            sfx.pop();
            this.events.inv();
            if (left === 0) {
              this.removeDrop(d);
              this.drops.splice(i, 1);
              continue;
            }
            d.stack.count = left;
          }
        }
      }
    }
  }

  /* ───────────── 경험치 ───────────── */

  private setXp(total: number) {
    this.xpTotal = Math.max(0, Math.floor(total));
    let lvl = 0;
    let left = this.xpTotal;
    while (left >= xpNeed(lvl)) {
      left -= xpNeed(lvl);
      lvl++;
    }
    this.xpLevel = lvl;
    this.xpProg = left / xpNeed(lvl);
  }

  addXp(n: number) {
    if (n <= 0) return;
    const before = this.xpLevel;
    this.setXp(this.xpTotal + n);
    sfx.orb();
    if (this.xpLevel > before && this.xpLevel % 5 === 0) sfx.levelUp();
  }

  /** 레벨을 n 만큼 쓴다 (마법 부여) */
  spendLevels(n: number) {
    const target = Math.max(0, this.xpLevel - n);
    let total = 0;
    for (let l = 0; l < target; l++) total += xpNeed(l);
    this.setXp(total + Math.floor(this.xpProg * xpNeed(target)));
    this.events.inv();
  }

  /** 화로에서 꺼낸 결과물만큼 경험치 */
  smeltXp(id: string, count: number) {
    const per = SMELT_XP[id] ?? 0;
    const raw = per * count;
    const n = Math.floor(raw) + (Math.random() < raw - Math.floor(raw) ? 1 : 0);
    if (n > 0 && this.mode === "wild") this.spawnOrbs(n, this.pos.x, this.pos.y + 1, this.pos.z);
  }

  /** 마법 부여대 주변 책장 (마인크래프트: 한 칸 띄운 5×5 고리, 2층) */
  enchantShelves(key: string) {
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    let n = 0;
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
        const gx = x + Math.sign(dx) * (Math.abs(dx) > 1 ? 1 : 0);
        const gz = z + Math.sign(dz) * (Math.abs(dz) > 1 ? 1 : 0);
        if (this.world.get(gx, y, gz) || this.world.get(gx, y + 1, gz)) continue;
        for (const dy of [0, 1]) if (this.world.get(x + dx, y + dy, z + dz) === B.bookshelf) n++;
      }
    return Math.min(15, n);
  }

  /** 마법 부여대: slot(0~2) 칸으로 부여. 성공하면 결과 아이템 */
  enchantWith(key: string, target: Stack, slot: number): Stack | null {
    const costs = enchantCosts(this.enchantShelves(key), this.enchSeed);
    const cost = costs[slot]!;
    if (this.xpLevel < cost) return null;
    const ench = rollEnchants(target.id, cost, this.enchSeed, slot);
    if (!Object.keys(ench).length) return null;
    this.spendLevels(slot + 1);
    this.enchSeed = Math.floor(Math.random() * 2 ** 31);
    sfx.enchant();
    return { ...target, ench };
  }

  private spawnOrbs(total: number, x: number, y: number, z: number) {
    // 마인크래프트처럼 큰 구슬부터 나눠 떨어뜨린다
    const sizes = [37, 17, 7, 3, 1];
    let left = Math.floor(total);
    while (left > 0 && this.orbs.length < 120) {
      const v = sizes.find((s) => s <= left) ?? 1;
      left -= v;
      const sprite = new THREE.Sprite(orbMaterial());
      const s = v >= 17 ? 0.32 : v >= 7 ? 0.26 : v >= 3 ? 0.2 : 0.16;
      sprite.scale.set(s, s, s);
      this.scene.add(sprite);
      this.orbs.push({
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3),
        value: v,
        age: 0,
        sprite,
      });
    }
  }

  private updateOrbs(dt: number) {
    const target = this.pos.clone().setY(this.pos.y + 0.9);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i]!;
      o.age += dt;
      const to = target.clone().sub(o.pos);
      const d = to.length();
      if (!this.dead && d < 7.5 && o.age > 0.4) {
        const pull = (1 - d / 7.5) ** 2 * 60;
        o.vel.addScaledVector(to.normalize(), pull * dt);
      }
      o.vel.y -= 9 * dt;
      o.vel.multiplyScalar(Math.pow(0.4, dt));
      const np = o.pos.clone().addScaledVector(o.vel, dt);
      if (solidAt(this.world.get(Math.floor(np.x), Math.floor(np.y - 0.1), Math.floor(np.z)))) {
        np.y = Math.floor(np.y - 0.1) + 1.1;
        o.vel.y = Math.abs(o.vel.y) * 0.3;
      }
      o.pos.copy(np);
      o.sprite.position.set(o.pos.x, o.pos.y + Math.sin(o.age * 6) * 0.04, o.pos.z);
      (o.sprite.material as THREE.SpriteMaterial).rotation = Math.sin(o.age * 3) * 0.2;
      const pick = !this.dead && d < 1.1 && o.age > 0.4;
      if (pick) this.addXp(o.value);
      if (pick || o.age > 300) {
        this.scene.remove(o.sprite);
        o.sprite.material.dispose();
        this.orbs.splice(i, 1);
      }
    }
  }

  /* ───────────── TNT ───────────── */

  private primeTnt(x: number, y: number, z: number, fuse: number) {
    const mats = BLOCKS[B.tnt]!.faces.map((f, i) => {
      const m = new THREE.MeshBasicMaterial({ map: tileTexture(f) });
      m.userData.base = new THREE.Color().setScalar(FACE_SHADE[i]!);
      return m;
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.98, 0.98), mats);
    markCasters(mesh);
    this.scene.add(mesh);
    this.tnts.push({ pos: new THREE.Vector3(x + 0.5, y, z + 0.5), vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 2, (Math.random() - 0.5) * 0.4), fuse, mesh, mats });
    sfx.fuse(this.volAt(new THREE.Vector3(x, y, z)));
  }

  private updateTnts(dt: number) {
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const t = this.tnts[i]!;
      t.fuse -= dt;
      t.vel.y -= GRAVITY * dt;
      const ny = t.pos.y + t.vel.y * dt;
      if (solidAt(this.world.get(Math.floor(t.pos.x), Math.floor(ny), Math.floor(t.pos.z)))) {
        t.pos.y = Math.floor(ny) + 1;
        t.vel.set(t.vel.x * 0.7, 0, t.vel.z * 0.7);
      } else t.pos.y = ny;
      t.pos.x += t.vel.x * dt;
      t.pos.z += t.vel.z * dt;
      // 깜빡임 + 터지기 직전 살짝 부푼다
      const flash = Math.floor(t.fuse * 4) % 2 === 0;
      const swell = t.fuse < 0.3 ? 1 + (0.3 - t.fuse) * 0.5 : 1;
      t.mesh.scale.setScalar(swell);
      t.mesh.position.set(t.pos.x, t.pos.y + 0.49, t.pos.z);
      for (const m of t.mats) m.color.copy(m.userData.base as THREE.Color).lerp(new THREE.Color(1, 1, 1), flash ? 0.75 : 0);
      if (t.fuse <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        for (const m of t.mats) m.dispose();
        this.tnts.splice(i, 1);
        this.explode(t.pos.x, t.pos.y + 0.5, t.pos.z, 4);
      }
    }
  }

  /** 황금 사과 재생 효과 (0.6초마다 1) */
  private tickEffects(dt: number) {
    if (this.regenFx <= 0 || this.dead) return;
    this.regenFx -= dt;
    this.regenTick += dt;
    if (this.regenTick >= 0.6) {
      this.regenTick = 0;
      if (this.hp < 20) {
        this.hp = Math.min(20, this.hp + 1);
        this.events.inv();
      }
    }
  }

  /** 닭이 5~10분마다 달걀을 낳는다 */
  private layEggs(dt: number) {
    for (const m of this.mobs) {
      if (m.kind !== "chicken" || m.deadT > 0) continue;
      const t = (this.eggT.get(m) ?? 300 + Math.random() * 300) - dt;
      if (t <= 0) {
        this.spawnDrop({ id: "egg", count: 1 }, m.pos.x, m.pos.y + 0.3, m.pos.z);
        this.eggT.set(m, 300 + Math.random() * 300);
      } else this.eggT.set(m, t);
    }
  }

  /* ───────────── 화살 ───────────── */

  private shootArrow(from: THREE.Vector3, vel: THREE.Vector3, fromPlayer: boolean, dmg: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), new THREE.MeshBasicMaterial({ color: 0x8a6a3a }));
    this.scene.add(mesh);
    this.arrows.push({ pos: from.clone(), vel, fromPlayer, dmg, mesh, stuck: 0, life: 0 });
  }

  private updateArrows(dt: number) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]!;
      a.life += dt;
      let remove = a.life > 30;
      if (!a.stuck) {
        a.vel.y -= 20 * dt;
        const step = a.vel.clone().multiplyScalar(dt);
        const len = step.length();
        const dir = step.clone().normalize();
        const hit = this.world.raycast(a.pos.x, a.pos.y, a.pos.z, dir.x, dir.y, dir.z, len);
        if (a.fromPlayer) {
          for (const m of this.mobs) {
            if (m.deadT > 0) continue;
            const hw = m.spec.w / 2;
            const t = rayBox(a.pos, dir, m.pos.x - hw, m.pos.y, m.pos.z - hw, m.pos.x + hw, m.pos.y + m.spec.h, m.pos.z + hw);
            if (t !== null && t <= len) {
              this.hurtMob(m, a.dmg, dir);
              remove = true;
              break;
            }
          }
        } else if (!this.dead) {
          const t = rayBox(a.pos, dir, this.pos.x - HALF, this.pos.y, this.pos.z - HALF, this.pos.x + HALF, this.pos.y + 1.8, this.pos.z + HALF);
          if (t !== null && t <= len) {
            this.damage(a.dmg, "화살에 맞았습니다", dir);
            remove = true;
          }
        }
        if (!remove && hit) {
          a.pos.set(a.pos.x + dir.x * hit.dist, a.pos.y + dir.y * hit.dist, a.pos.z + dir.z * hit.dist);
          a.stuck = 1;
        } else if (!remove) a.pos.add(step);
        a.mesh.position.copy(a.pos);
        a.mesh.lookAt(a.pos.clone().add(a.vel));
      } else if (a.fromPlayer && a.pos.distanceTo(this.pos.clone().setY(this.pos.y + 0.8)) < 1.4) {
        if (this.inv.add({ id: "arrow", count: 1 }) === 0) {
          sfx.pop();
          this.events.inv();
          remove = true;
        }
      }
      if (remove) {
        this.scene.remove(a.mesh);
        a.mesh.geometry.dispose();
        (a.mesh.material as THREE.Material).dispose();
        this.arrows.splice(i, 1);
      }
    }
  }

  /* ───────────── 몹 ───────────── */

  private addMob(kind: MobKind, x: number, y: number, z: number, persistent: boolean) {
    const m = createMob(kind, x, y, z, persistent);
    this.mobs.push(m);
    markCasters(m.model.root);
    this.scene.add(m.model.root);
    return m;
  }

  private removeMob(i: number) {
    const m = this.mobs[i]!;
    this.scene.remove(m.model.root);
    disposeMob(m);
    this.mobs.splice(i, 1);
  }

  private mobCollides(m: Mob, x: number, y: number, z: number) {
    const hw = m.spec.w / 2 - 0.01;
    const x0 = Math.floor(x - hw);
    const x1 = Math.floor(x + hw);
    const y0 = Math.floor(y + 0.01);
    const y1 = Math.floor(y + m.spec.h - 0.01);
    const z0 = Math.floor(z - hw);
    const z1 = Math.floor(z + hw);
    for (let bx = x0; bx <= x1; bx++)
      for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) if (solidAt(this.world.get(bx, by, bz))) return true;
    return false;
  }

  private canSee(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from);
    const len = d.length();
    if (len > 40) return false;
    d.divideScalar(len);
    const hit = this.world.raycast(from.x, from.y, from.z, d.x, d.y, d.z, len);
    return !hit || !isOpaque(hit.id);
  }

  private updateMobs(dt: number) {
    const daylight = this.daylight();
    const player = this.pos;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i]!;
      const chunk = this.world.chunkAt(m.pos.x, m.pos.z);
      if (!chunk) {
        this.removeMob(i);
        continue;
      }
      const dist = m.pos.distanceTo(player);
      if (m.spec.hostile && dist > 80) {
        this.removeMob(i);
        continue;
      }
      if (m.deadT > 0) {
        m.deadT += dt;
        animateMob(m, dt, 1, this.time * DAY_SECONDS);
        if (m.deadT > 0.9) this.removeMob(i);
        continue;
      }
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.fleeT = Math.max(0, m.fleeT - dt);
      m.attackT = Math.max(0, m.attackT - dt);
      m.thinkT -= dt;
      const say = (this.mobVoice.get(m) ?? 3 + Math.random() * 10) - dt;
      if (say <= 0) {
        this.mobVoice.set(m, 8 + Math.random() * 14);
        if (dist < 16 && m.kind !== "creeper") sfx.mobSay(m.kind, this.volAt(m.pos));
      } else this.mobVoice.set(m, say);

      const cell = [Math.floor(m.pos.x), Math.floor(m.pos.y + m.spec.h * 0.8), Math.floor(m.pos.z)] as const;
      const [sky, blk] = this.world.lightAt(cell[0], cell[1], cell[2]);
      const feet = this.world.get(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.2), Math.floor(m.pos.z));
      const inWater = BLOCKS[feet]!.liquid === "water";
      const inLava = BLOCKS[feet]!.liquid === "lava";

      if (m.spec.burns && daylight > 0.7 && sky >= 15 && !inWater) {
        m.burnT = 2;
      }
      if (inLava) m.burnT = 6;
      if (m.burnT > 0) {
        m.burnT -= dt;
        if (Math.floor((m.burnT + dt) * 1) !== Math.floor(m.burnT * 1)) {
          m.hp -= 1;
          m.hurtT = 0.3;
          if (m.hp <= 0) {
            this.hurtMob(m, 0.01, new THREE.Vector3());
            m.deadT = 0.01;
            continue;
          }
        }
      }

      let wantX = 0;
      let wantZ = 0;
      let speed = m.spec.speed;
      const toPlayer = new THREE.Vector3(player.x - m.pos.x, 0, player.z - m.pos.z);
      const flat = toPlayer.length();
      const angry =
        m.spec.hostile && !this.dead && this.mode === "wild" && dist < 18 && (m.kind !== "spider" || daylight < 0.5 || sky * daylight < 9 || m.hp < m.spec.hp);
      const eye = m.pos.clone().setY(m.pos.y + m.spec.h * 0.85);
      const sees = angry && this.canSee(eye, this.eyePos());

      if (angry && sees) {
        m.target = null;
        toPlayer.normalize();
        if (m.kind === "skeleton") {
          if (flat < 5) {
            wantX = -toPlayer.x;
            wantZ = -toPlayer.z;
          } else if (flat > 10) {
            wantX = toPlayer.x;
            wantZ = toPlayer.z;
          } else {
            wantX = -toPlayer.z * 0.6;
            wantZ = toPlayer.x * 0.6;
          }
          if (m.attackT <= 0 && flat < 15) {
            m.attackT = 1.6 + Math.random() * 0.8;
            const target = this.eyePos().add(new THREE.Vector3(0, -0.3 + flat * 0.025, 0));
            const dir = target.sub(eye).normalize();
            this.shootArrow(eye.clone().addScaledVector(dir, 0.6), dir.multiplyScalar(26), false, 2 + Math.floor(Math.random() * 3));
          }
          m.yaw = Math.atan2(toPlayer.x, toPlayer.z);
        } else if (m.kind === "creeper") {
          if (dist < 3) {
            if (m.fuse === 0) sfx.fuse(this.volAt(m.pos));
            m.fuse += dt;
            speed = 0;
            if (m.fuse >= 1.5) {
              this.explode(m.pos.x, m.pos.y + 0.8, m.pos.z, 3);
              m.hp = 0;
              m.deadT = 0.85;
              m.model.root.visible = false;
              continue;
            }
          } else {
            m.fuse = Math.max(0, m.fuse - dt);
            wantX = toPlayer.x;
            wantZ = toPlayer.z;
          }
          m.yaw = Math.atan2(toPlayer.x, toPlayer.z);
        } else {
          wantX = toPlayer.x;
          wantZ = toPlayer.z;
          m.yaw = Math.atan2(toPlayer.x, toPlayer.z);
          const reach = 0.8 + m.spec.w / 2;
          if (flat < reach && Math.abs(player.y - m.pos.y) < 1.6 && m.attackT <= 0) {
            m.attackT = 1;
            this.damage(m.spec.damage, `${m.spec.name}에게 죽었습니다`, toPlayer);
          }
          if (m.kind === "spider" && flat < 4 && flat > 2 && m.onGround && Math.random() < dt * 2) {
            m.vel.y = 6;
            m.vel.x += toPlayer.x * 4;
            m.vel.z += toPlayer.z * 4;
          }
        }
      } else {
        m.fuse = Math.max(0, m.fuse - dt);
        if (m.fleeT > 0) {
          if (!m.target || m.thinkT <= 0) {
            const away = new THREE.Vector3(m.pos.x - player.x, 0, m.pos.z - player.z).normalize();
            m.target = m.pos.clone().addScaledVector(away, 8).add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
            m.thinkT = 1;
          }
          speed *= 2;
        } else if (m.thinkT <= 0) {
          m.thinkT = 3 + Math.random() * 6;
          m.target =
            Math.random() < 0.55
              ? m.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16))
              : null;
        }
        if (m.target) {
          const d = new THREE.Vector3(m.target.x - m.pos.x, 0, m.target.z - m.pos.z);
          if (d.length() < 0.6) m.target = null;
          else {
            d.normalize();
            wantX = d.x;
            wantZ = d.z;
            speed *= m.spec.hostile ? 0.5 : 0.7;
          }
        }
        if (wantX || wantZ) m.yaw = lerpAngle(m.yaw, Math.atan2(wantX, wantZ), Math.min(1, dt * 6));
      }

      /* 물리 */
      const accel = m.onGround ? 10 : 2;
      m.vel.x += (wantX * speed - m.vel.x) * Math.min(1, accel * dt);
      m.vel.z += (wantZ * speed - m.vel.z) * Math.min(1, accel * dt);
      if (inWater || inLava) {
        m.vel.y = Math.min(m.vel.y + 18 * dt, 2.2);
        m.fallStart = m.pos.y;
      } else m.vel.y -= GRAVITY * dt * (m.kind === "chicken" && m.vel.y < 0 ? 0.25 : 1);
      m.vel.y = Math.max(-60, m.vel.y);
      const nx = m.pos.x + m.vel.x * dt;
      let blocked = false;
      if (!this.mobCollides(m, nx, m.pos.y, m.pos.z)) m.pos.x = nx;
      else {
        blocked = true;
        m.vel.x = 0;
      }
      const nz = m.pos.z + m.vel.z * dt;
      if (!this.mobCollides(m, m.pos.x, m.pos.y, nz)) m.pos.z = nz;
      else {
        blocked = true;
        m.vel.z = 0;
      }
      const ny = m.pos.y + m.vel.y * dt;
      if (!this.mobCollides(m, m.pos.x, ny, m.pos.z)) {
        if (m.onGround) m.fallStart = m.pos.y;
        m.pos.y = ny;
        m.onGround = false;
      } else {
        if (m.vel.y < 0) {
          m.pos.y = Math.floor(ny) + 1;
          if (!m.onGround) {
            const fall = m.fallStart - m.pos.y;
            if (fall > 3 && m.kind !== "chicken") {
              m.hp -= Math.floor(fall - 3);
              m.hurtT = 0.3;
              if (m.hp <= 0) this.hurtMob(m, 0.01, new THREE.Vector3());
            }
          }
          m.onGround = true;
          m.fallStart = m.pos.y;
        }
        m.vel.y = 0;
      }
      if (blocked && m.onGround && (wantX || wantZ)) m.vel.y = JUMP_V;
      if (m.pos.y < -20) {
        this.removeMob(i);
        continue;
      }
      const br = brightness(Math.max((sky / 15) * daylight, blk / 15), this.mats.uniforms.uMinLight.value);
      animateMob(m, dt, br, this.time * DAY_SECONDS);
      if (m.model.head && m.kind !== "spider") {
        const look = Math.atan2(player.x - m.pos.x, player.z - m.pos.z) - m.yaw;
        const w = Math.atan2(Math.sin(look), Math.cos(look));
        m.model.head.rotation.y = dist < 8 ? Math.max(-0.9, Math.min(0.9, w)) : 0;
      }
    }
  }

  private spawnHostiles(dt: number) {
    this.spawnT -= dt;
    if (this.spawnT > 0 || this.mode !== "wild") return;
    this.spawnT = 1;
    const hostile = this.mobs.filter((m) => m.spec.hostile).length;
    if (hostile >= 16) return;
    const daylight = this.daylight();
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = 24 + Math.random() * 24;
      const x = Math.floor(this.pos.x + Math.cos(a) * r);
      const z = Math.floor(this.pos.z + Math.sin(a) * r);
      if (!this.world.chunkAt(x, z)) continue;
      for (let y = Math.min(H - 3, Math.floor(this.pos.y) + 20); y > Math.max(2, Math.floor(this.pos.y) - 30); y--) {
        if (this.world.get(x, y, z) || this.world.get(x, y + 1, z)) continue;
        const below = this.world.get(x, y - 1, z);
        if (!solidAt(below) || below === B.bedrock) continue;
        const [sky, blk] = this.world.lightAt(x, y, z);
        if (blk > 0 || sky * daylight > 7 * (15 / 15) * (daylight > 0.5 ? 0.5 : 1)) break;
        if (sky * daylight > 7) break;
        const roll = Math.random();
        const kind: MobKind = roll < 0.3 ? "zombie" : roll < 0.55 ? "skeleton" : roll < 0.8 ? "creeper" : "spider";
        if (kind === "spider" && (this.world.get(x + 1, y, z) || this.world.get(x - 1, y, z))) break;
        this.addMob(kind, x + 0.5, y, z + 0.5, false);
        return;
      }
    }
  }

  private explode(x: number, y: number, z: number, power: number) {
    sfx.explode(Math.max(0.15, 1 - this.pos.distanceTo(new THREE.Vector3(x, y, z)) / 40));
    const r = power;
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > r + 0.3 - Math.random() * 0.8) continue;
          const bx = Math.floor(x + dx);
          const by = Math.floor(y + dy);
          const bz = Math.floor(z + dz);
          const id = this.world.get(bx, by, bz);
          if (!id) continue;
          const def = BLOCKS[id]!;
          if (def.hardness < 0 || def.hardness >= 50 || def.liquid) continue;
          if (id === B.tnt) {
            this.world.set(bx, by, bz, 0);
            this.primeTnt(bx, by, bz, 0.5 + Math.random());
            continue;
          }
          if (Math.random() < 1 / power) for (const s of this.dropsOf(def, 0, null)) this.spawnDrop(s, bx + 0.5, by + 0.5, bz + 0.5);
          this.world.set(bx, by, bz, 0);
          this.afterChange(bx, by, bz);
        }
    const pd = this.pos.distanceTo(new THREE.Vector3(x, y, z));
    if (pd < power * 2) {
      const impact = 1 - pd / (power * 2);
      const dmg = Math.floor((impact * impact + impact) / 2 * 7 * power * 2 + 1);
      this.damage(dmg, "폭발했습니다", new THREE.Vector3(this.pos.x - x, 0, this.pos.z - z).normalize());
      this.vel.y += impact * 10;
    }
    for (const m of this.mobs) {
      const md = m.pos.distanceTo(new THREE.Vector3(x, y, z));
      if (md < power * 2 && m.deadT === 0) this.hurtMob(m, (1 - md / (power * 2)) * 20, new THREE.Vector3(m.pos.x - x, 0, m.pos.z - z).normalize());
    }
  }

  /* ───────────── 플레이어 ───────────── */

  private exhaust(n: number) {
    if (this.mode === "mine") return;
    this.exhaustion += n;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.sat > 0) this.sat = Math.max(0, this.sat - 1);
      else this.food = Math.max(0, this.food - 1);
    }
  }

  damage(amount: number, cause: string, dir?: THREE.Vector3) {
    if (this.dead || this.invulnT > 0 || this.mode === "mine") return;
    // 방패: 앞에서 오는 공격은 막는다 (dir 은 맞은 쪽으로 밀리는 방향)
    if (this.blocking && dir && !cause.includes("떨어") && !cause.includes("익사") && !cause.includes("굶")) {
      const look = this.lookDir().setY(0).normalize();
      const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      if (look.dot(flat) < -0.2) {
        sfx.shield();
        if (this.inv.damageHeld(Math.max(1, Math.floor(amount)), this.blockingOff)) this.events.message("방패가 부서졌어요");
        this.vel.x += flat.x * 2;
        this.vel.z += flat.z * 2;
        this.invulnT = 0.5;
        this.events.inv();
        return;
      }
    }
    const fall = cause.includes("떨어");
    const { def, tough } = this.inv.armorPoints();
    let real = fall || cause.includes("익사") || cause.includes("굶") ? amount : armorReduce(amount, def, tough);
    const epf = cause.includes("굶") ? 0 : this.inv.protection(fall);
    if (epf) real *= 1 - epf / 25;
    if (def > 0 && !fall) this.inv.damageArmor(amount);
    if (this.absorb > 0) {
      const soak = Math.min(this.absorb, real);
      this.absorb -= soak;
      real -= soak;
    }
    this.hp -= real;
    this.hurtT = 0.4;
    this.invulnT = 0.5;
    this.exhaust(0.1);
    sfx.hurt();
    const flat = dir ? Math.hypot(dir.x, dir.z) : 0;
    if (dir && flat > 1e-4) {
      this.vel.x = this.vel.x / 2 + (dir.x / flat) * KNOCK_H;
      this.vel.z = this.vel.z / 2 + (dir.z / flat) * KNOCK_H;
      if (this.onGround) {
        this.vel.y = Math.min(KNOCK_V, this.vel.y / 2 + KNOCK_V);
        this.onGround = false;
      }
      this.sprintLatch = false;
    }
    if (this.hp <= 0) this.die(cause);
    this.events.inv();
  }

  private die(cause: string) {
    this.hp = 0;
    this.dead = true;
    this.unlock();
    for (const s of this.inv.clear()) this.spawnDrop(s, this.pos.x, this.pos.y + 1, this.pos.z, new THREE.Vector3((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6));
    // 마인크래프트: 레벨×7 (최대 100) 만큼 구슬로 떨어지고 나머지는 사라진다
    this.spawnOrbs(Math.min(100, this.xpLevel * 7), this.pos.x, this.pos.y + 1, this.pos.z);
    this.setXp(0);
    this.regenFx = 0;
    this.absorb = 0;
    this.events.inv();
    this.events.death(cause);
    this.save();
  }

  respawn() {
    this.dead = false;
    this.hp = 20;
    this.food = 20;
    this.sat = 5;
    this.air = 300;
    this.burnT = 0;
    if (this.multi) {
      const s = this.gen!.randomSpawn(WILD_SPAWN_R);
      this.spawn.set(s.x, s.y, s.z);
      this.needSettle = true;
    }
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.fallStart = this.pos.y;
    this.invulnT = 3;
    this.events.inv();
    this.lock();
  }

  private stepSound(vol: number) {
    const x = Math.floor(this.pos.x);
    const z = Math.floor(this.pos.z);
    const at = this.world.get(x, Math.floor(this.pos.y + 0.01), z);
    const id = at === B.snow ? at : this.world.get(x, Math.floor(this.pos.y - 0.2), z);
    if (!id || BLOCKS[id]!.liquid) return;
    sfx.block(soundOf(BLOCKS[id]!), "step", vol);
  }

  /** 블록과 그 이웃 중 가장 밝은 빛 (방금 부순 칸은 아직 빛 계산 전이라) */
  private lightBright(x: number, y: number, z: number) {
    let s = 0;
    let b = 0;
    for (const [dx, dy, dz] of NEIGHBORS7) {
      const [ls, lb] = this.world.lightAt(x + dx, y + dy, z + dz);
      s = Math.max(s, ls);
      b = Math.max(b, lb);
    }
    return brightness(Math.max((s / 15) * this.daylight(), b / 15), this.mats.uniforms.uMinLight.value);
  }

  /** 거리에 따른 소리 크기 (16칸 밖은 안 들림) */
  private volAt(p: THREE.Vector3) {
    return Math.max(0, 1 - p.distanceTo(this.pos) / 16);
  }

  private syncParticleScale() {
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.particles.setViewport(v.y, this.camera.fov);
  }

  /** 인벤토리 미리보기용 현재 스킨 이미지 */
  skinImage(): CanvasImageSource | null {
    return (this.skin.image as CanvasImageSource | undefined) ?? null;
  }

  private collides(x: number, y: number, z: number, h: number) {
    const x0 = Math.floor(x - HALF + 1e-4);
    const x1 = Math.floor(x + HALF - 1e-4);
    const y0 = Math.floor(y + 1e-4);
    const y1 = Math.floor(y + h - 1e-4);
    const z0 = Math.floor(z - HALF + 1e-4);
    const z1 = Math.floor(z + HALF - 1e-4);
    for (let bx = x0; bx <= x1; bx++)
      for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) if (solidAt(this.world.get(bx, by, bz))) return true;
    return false;
  }

  private stepPlayer(dt: number) {
    if (this.dead) return;
    const can = this.inputOn;
    const key = (k: string) => can && this.keys.has(k);
    const mm = can ? this.mobileMove : { x: 0, y: 0 };
    const fwd = (key("KeyW") || key("ArrowUp") ? 1 : 0) - (key("KeyS") || key("ArrowDown") ? 1 : 0) - mm.y;
    const side = (key("KeyD") || key("ArrowRight") ? 1 : 0) - (key("KeyA") || key("ArrowLeft") ? 1 : 0) + mm.x;
    const len = Math.hypot(fwd, side);
    const ctrl = key("ControlLeft") || key("ControlRight");
    this.sneaking = key("ShiftLeft") || key("ShiftRight");
    if (this.sneaking || fwd <= 0.1) this.sprintLatch = ctrl && !this.sneaking;
    const canSprint = this.food > 6 || this.mode === "mine";
    this.sprinting = canSprint && !this.sneaking && fwd > 0.1 && (this.sprintLatch || ctrl || (this.touch && len > 0.95 && mm.y < -0.9));
    this.sneakT += ((this.sneaking ? 1 : 0) - this.sneakT) * Math.min(1, dt * 14);

    const feetId = this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
    const bodyId = this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.9), Math.floor(this.pos.z));
    const eye = this.eyePos();
    const headId = this.world.get(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
    const wasWater = this.inWater;
    this.inWater = BLOCKS[feetId]!.liquid === "water" || BLOCKS[bodyId]!.liquid === "water";
    if (!wasWater && this.inWater && this.vel.y < -3) sfx.splash(Math.min(1, -this.vel.y / 12));
    this.inLava = BLOCKS[feetId]!.liquid === "lava" || BLOCKS[bodyId]!.liquid === "lava";
    this.headInWater = BLOCKS[headId]!.liquid === "water";

    let speed = this.sneaking ? SNEAK : this.sprinting ? SPRINT : WALK;
    if (this.inWater) speed *= 0.5;
    if (this.inLava) speed *= 0.35;
    if (this.eatT > 0 || this.bowT > 0) speed *= 0.3;
    if (this.blocking) speed *= SHIELD_SLOW;
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
    const accel = this.onGround ? 16 : this.inWater ? 6 : 3.2;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
    const jump = key("Space") || (can && this.mobileJump);
    if (this.inWater || this.inLava) {
      if (jump) this.vel.y = Math.min(this.vel.y + 22 * dt, this.inLava ? 1.6 : 2.6);
      else if (this.sneaking) this.vel.y = Math.max(this.vel.y - 18 * dt, -3);
      else this.vel.y = Math.max(this.vel.y - 9 * dt, -1.8);
      this.fallStart = this.pos.y;
    } else {
      if (jump && this.onGround) {
        this.vel.y = JUMP_V;
        this.onGround = false;
        this.exhaust(this.sprinting ? 0.2 : 0.05);
        if (this.sprinting) {
          this.vel.x += -sin * 2;
          this.vel.z += -cos * 2;
        }
      }
      this.vel.y -= GRAVITY * dt;
      this.vel.y *= Math.pow(0.98, dt * 20);
    }
    this.vel.y = Math.max(-78, this.vel.y);
    // 사다리: 앞으로 밀거나 점프하면 오르고, 웅크리면 멈춘다 (마인크래프트 초당 약 2.35칸)
    if ((feetId === B.ladder || bodyId === B.ladder) && !this.inWater) {
      this.fallStart = this.pos.y;
      this.vel.y = Math.max(this.vel.y, -2.35);
      if (this.sneaking && this.vel.y < 0) this.vel.y = 0;
      if (jump || this.hitWall) this.vel.y = 2.35;
    }

    const h = this.sneaking ? 1.5 : 1.8;
    const guard = this.sneaking && this.onGround;
    const supported = (x: number, z: number) => this.collides(x, this.pos.y - 0.12, z, h);
    this.hitWall = false;
    const nx = this.pos.x + this.vel.x * dt;
    const wallX = this.collides(nx, this.pos.y, this.pos.z, h);
    if (!wallX && (!guard || supported(nx, this.pos.z))) this.pos.x = nx;
    else {
      if (wallX && Math.abs(this.vel.x) > 0.05) this.hitWall = true;
      this.vel.x = 0;
      if (!guard) this.sprintLatch = false;
    }
    const nz = this.pos.z + this.vel.z * dt;
    const wallZ = this.collides(this.pos.x, this.pos.y, nz, h);
    if (!wallZ && (!guard || supported(this.pos.x, nz))) this.pos.z = nz;
    else {
      if (wallZ && Math.abs(this.vel.z) > 0.05) this.hitWall = true;
      this.vel.z = 0;
      if (!guard) this.sprintLatch = false;
    }
    const ny = this.pos.y + this.vel.y * dt;
    const wasGround = this.onGround;
    if (!this.collides(this.pos.x, ny, this.pos.z, h)) {
      this.pos.y = ny;
      // 프레임당 중력 이동이 충돌 오차(1e-4)보다 작으면 바닥 판정이 깜빡여 웅크리기 가드가 풀린다
      this.onGround = wasGround && this.vel.y <= 0 && this.collides(this.pos.x, ny - 0.002, this.pos.z, h);
      if (wasGround) this.fallStart = this.pos.y;
      this.fallStart = Math.max(this.fallStart, this.pos.y);
    } else {
      if (this.vel.y < 0) {
        const landed = Math.floor(ny) + 1;
        if (!this.collides(this.pos.x, landed, this.pos.z, h)) this.pos.y = landed;
        if (!wasGround) {
          const fall = this.fallStart - this.pos.y;
          if (fall > 1 && !this.inWater) this.stepSound(Math.min(1.4, 0.6 + fall * 0.15));
          if (fall > 3 && !this.inWater && this.mode === "wild") this.damage(Math.ceil(fall - 3), "높은 곳에서 떨어졌습니다");
          if (fall > 0.6 && this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z)) === B.farmland && Math.random() < 0.5)
            this.world.set(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z), B.dirt);
        }
        this.onGround = true;
        this.fallStart = this.pos.y;
      } else if (this.vel.y > 0) {
        const ceil = Math.floor(ny + h) - h - 0.001;
        if (!this.collides(this.pos.x, ceil, this.pos.z, h)) this.pos.y = ceil;
      }
      this.vel.y = 0;
    }

    const moved = Math.hypot(this.vel.x, this.vel.z) * dt;
    // 마인크래프트: 약 1.67칸마다 발소리, 웅크리면 조용히
    if (this.onGround && !this.sneaking && !this.inWater) {
      this.stepDist += moved;
      if (this.stepDist > 1.67) {
        this.stepDist = 0;
        this.stepSound(1);
      }
    }
    if (this.sprinting && this.onGround) this.exhaust(0.1 * moved);
    if (this.inWater) this.exhaust(0.01 * moved);

    /* 환경 피해 */
    if (this.mode !== "wild") return;
    if (this.headInWater) {
      this.air -= (dt * 20) / (1 + enchLevel(this.inv.armor[0], "respiration"));
      if (this.air <= -20) {
        this.air = 0;
        this.damage(2, "익사했습니다");
      }
    } else this.air = Math.min(300, this.air + dt * 100);
    if (this.inLava) {
      this.burnT = 8;
      this.lavaT -= dt;
      if (this.lavaT <= 0) {
        this.lavaT = 0.5;
        this.damage(4, "용암에서 수영하려고 했습니다");
      }
    }
    if (this.inWater) this.burnT = 0;
    if (this.burnT > 0) {
      const before = Math.floor(this.burnT);
      this.burnT -= dt;
      if (Math.floor(this.burnT) !== before && !this.inLava) this.damage(1, "불에 타 죽었습니다");
    }
    this.cactusT -= dt;
    if (this.cactusT <= 0) {
      for (const [dx, dz] of [
        [0.35, 0],
        [-0.35, 0],
        [0, 0.35],
        [0, -0.35],
      ] as const) {
        if (this.world.get(Math.floor(this.pos.x + dx), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z + dz)) === B.cactus) {
          this.damage(1, "선인장에 찔려 죽었습니다");
          this.cactusT = 0.5;
          break;
        }
      }
    }
    if (this.pos.y < -64) this.damage(4, "세상 밖으로 떨어졌습니다");

    /* 배고픔 · 회복 */
    this.regenT += dt;
    if (this.food >= 20 && this.sat > 0 && this.hp < 20) {
      if (this.regenT >= 0.5) {
        this.regenT = 0;
        this.hp = Math.min(20, this.hp + 1);
        this.exhaust(6);
        this.events.inv();
      }
    } else if (this.food >= 18 && this.hp < 20) {
      if (this.regenT >= 4) {
        this.regenT = 0;
        this.hp = Math.min(20, this.hp + 1);
        this.exhaust(6);
        this.events.inv();
      }
    } else if (this.food <= 0) {
      this.starveT += dt;
      if (this.starveT >= 4) {
        this.starveT = 0;
        if (this.hp > 1) this.damage(1, "굶어 죽었습니다");
      }
    } else this.regenT = Math.min(this.regenT, 4);
  }

  /* ───────────── 물 · 용암 ───────────── */

  private scheduleLiquid(x: number, y: number, z: number) {
    const id = this.world.get(x, y, z);
    const def = BLOCKS[id]!;
    if (!def.liquid && id !== 0 && !def.replaceable) return;
    const k = `${x},${y},${z}`;
    if (this.liquidQueue.has(k)) return;
    const near = def.liquid ?? this.liquidNear(x, y, z);
    if (!near) return;
    this.liquidQueue.set(k, performance.now() + (near === "lava" ? 1500 : 250));
  }

  private liquidNear(x: number, y: number, z: number): "water" | "lava" | undefined {
    for (const [dx, dy, dz] of [
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const) {
      const l = BLOCKS[this.world.get(x + dx, y + dy, z + dz)]!.liquid;
      if (l) return l;
    }
    return undefined;
  }

  private updateLiquids() {
    const now = performance.now();
    let n = 0;
    for (const [k, at] of this.liquidQueue) {
      if (at > now) continue;
      this.liquidQueue.delete(k);
      const [x, y, z] = k.split(",").map(Number) as [number, number, number];
      this.flow(x, y, z);
      if (++n > 120) break;
    }
  }

  private flow(x: number, y: number, z: number) {
    const id = this.world.get(x, y, z);
    const def = BLOCKS[id]!;
    const H4: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    if (!def.liquid) {
      /* 빈 칸: 옆이나 위에서 흘러 들어오는지 */
      let best: { kind: "water" | "lava"; level: number } | null = null;
      const up = this.world.get(x, y + 1, z);
      if (BLOCKS[up]!.liquid) best = { kind: BLOCKS[up]!.liquid!, level: 1 };
      let sources = 0;
      for (const [dx, dz] of H4) {
        const nid = this.world.get(x + dx, y, z + dz);
        const nd = BLOCKS[nid]!;
        if (!nd.liquid) continue;
        const nl = this.world.getMeta(x + dx, y, z + dz) & 7;
        if (nl === 0 && nd.liquid === "water") sources++;
        const below = this.world.get(x + dx, y - 1, z + dz);
        const canSpread = nl === 0 || solidAt(below) || (BLOCKS[below]!.liquid !== undefined && BLOCKS[below]!.liquid === nd.liquid && (this.world.getMeta(x + dx, y - 1, z + dz) & 7) === 0);
        if (!canSpread) continue;
        const max = nd.liquid === "water" ? 7 : 3;
        if (nl + 1 > max) continue;
        if (!best || nl + 1 < best.level) best = { kind: nd.liquid, level: nl + 1 };
      }
      if (sources >= 2 && (solidAt(this.world.get(x, y - 1, z)) || this.world.get(x, y - 1, z) === B.water)) best = { kind: "water", level: 0 };
      if (!best) return;
      if (id) this.breakBlock(x, y, z, false);
      this.world.set(x, y, z, best.kind === "water" ? B.water : B.lava, best.level);
      this.react(x, y, z);
      this.scheduleAround(x, y, z);
      return;
    }
    const level = this.world.getMeta(x, y, z) & 7;
    if (this.react(x, y, z)) return;
    if (level > 0) {
      /* 흐르는 물: 근원이 사라졌으면 줄어든다 */
      let want = 99;
      const up = this.world.get(x, y + 1, z);
      if (BLOCKS[up]!.liquid === def.liquid) want = 1;
      for (const [dx, dz] of H4) {
        const nid = this.world.get(x + dx, y, z + dz);
        if (BLOCKS[nid]!.liquid !== def.liquid) continue;
        const nl = this.world.getMeta(x + dx, y, z + dz) & 7;
        const below = this.world.get(x + dx, y - 1, z + dz);
        if (nl !== 0 && !solidAt(below) && BLOCKS[below]!.liquid !== def.liquid) continue;
        want = Math.min(want, nl + 1);
      }
      const max = def.liquid === "water" ? 7 : 3;
      if (want > max) {
        this.world.set(x, y, z, 0, 0);
        this.scheduleAround(x, y, z);
        return;
      }
      if (want !== level) {
        this.world.set(x, y, z, id, want);
        this.scheduleAround(x, y, z);
      }
    }
    const below = this.world.get(x, y - 1, z);
    if (!solidAt(below) && (BLOCKS[below]!.replaceable || !below) && BLOCKS[below]!.liquid !== def.liquid) this.scheduleLiquid(x, y - 1, z);
    for (const [dx, dz] of H4) this.scheduleLiquid(x + dx, y, z + dz);
  }

  /** 물 + 용암 → 흑요석 / 조약돌 */
  private react(x: number, y: number, z: number) {
    const id = this.world.get(x, y, z);
    if (id !== B.lava) return false;
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
    ] as const) {
      if (this.world.get(x + dx, y + dy, z + dz) === B.water) {
        const src = (this.world.getMeta(x, y, z) & 7) === 0;
        this.world.set(x, y, z, src ? B.obsidian : B.cobble, 0);
        return true;
      }
    }
    return false;
  }

  private scheduleAround(x: number, y: number, z: number) {
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, -1, 0],
      [0, 1, 0],
    ] as const)
      this.scheduleLiquid(x + dx, y + dy, z + dz);
  }

  /* ───────────── 무작위 틱 · 화로 ───────────── */

  private randomTicks() {
    if (this.mode !== "wild") return;
    const pcx = Math.floor(this.pos.x / CS);
    const pcz = Math.floor(this.pos.z / CS);
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const c = this.world.chunks.get(ckey(pcx + dx, pcz + dz));
        if (!c) continue;
        for (let k = 0; k < 10; k++) {
          const lx = Math.floor(Math.random() * CS);
          const lz = Math.floor(Math.random() * CS);
          const y = Math.floor(Math.random() * (H - 1)) + 1;
          const id = c.blocks[idx(lx, y, lz)]!;
          if (!id) continue;
          const x = c.cx * CS + lx;
          const z = c.cz * CS + lz;
          const def = BLOCKS[id]!;
          const [sky, blk] = this.world.lightAt(x, y + 1, z);
          const light = Math.max(sky, blk);
          if (id === B.wheat) {
            const age = c.meta[idx(lx, y, lz)]! & 7;
            if (age < 7 && light >= 9) this.world.set(x, y, z, id, age + 1);
          } else if (def.sapling) {
            if (light >= 9 && Math.random() < 0.15) this.growTree(x, y, z, def.sapling);
          } else if (id === B.dirt) {
            if (light >= 9 && !isOpaque(this.world.get(x, y + 1, z))) {
              for (let t = 0; t < 4; t++) {
                const gx = x + Math.floor(Math.random() * 3) - 1;
                const gy = y + Math.floor(Math.random() * 5) - 3;
                const gz = z + Math.floor(Math.random() * 3) - 1;
                if (this.world.get(gx, gy, gz) === B.grass) {
                  this.world.set(x, y, z, B.grass);
                  break;
                }
              }
            }
          } else if (id === B.grass && isOpaque(this.world.get(x, y + 1, z))) {
            this.world.set(x, y, z, B.dirt);
          } else if ((id === B.sugarCane || id === B.cactus) && !this.world.get(x, y + 1, z) && Math.random() < 0.3) {
            let hgt = 1;
            while (this.world.get(x, y - hgt, z) === id) hgt++;
            if (hgt < 3) this.world.set(x, y + 1, z, id);
          } else if (isLeaf(id) && !(c.meta[idx(lx, y, lz)]! & 1)) {
            if (!this.logNear(x, y, z)) {
              this.breakBlock(x, y, z, false);
            }
          }
        }
      }
  }

  private logNear(x: number, y: number, z: number) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dz = -4; dz <= 4; dz++)
        for (let dx = -4; dx <= 4; dx++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 6) continue;
          if (BLOCKS[this.world.get(x + dx, y + dy, z + dz)]!.key.endsWith("_log")) return true;
        }
    return false;
  }

  private tickFurnaces(dt: number) {
    for (const [key, f] of this.furnaces) {
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      if (!this.world.chunkAt(x, z)) continue;
      const result = f.input ? SMELTING[f.input.id] : undefined;
      const canSmelt = Boolean(result && (!f.output || (f.output.id === result && f.output.count < maxStack(result))));
      if (f.burn <= 0 && canSmelt && f.fuel) {
        const fuel = item(f.fuel.id)?.fuel ?? 0;
        if (fuel > 0) {
          f.burn = f.burnMax = fuel;
          if (f.fuel.id === "lava_bucket") f.fuel = { id: "bucket", count: 1 };
          else {
            f.fuel.count--;
            if (f.fuel.count <= 0) f.fuel = null;
          }
        }
      }
      const was = this.world.get(x, y, z);
      if (f.burn > 0) {
        f.burn -= dt;
        if (canSmelt) {
          f.cook += dt;
          if (f.cook >= SMELT_SECONDS) {
            f.cook = 0;
            f.output = f.output ? { ...f.output, count: f.output.count + 1 } : { id: result!, count: 1 };
            f.input!.count--;
            if (f.input!.count <= 0) f.input = null;
          }
        } else f.cook = 0;
      } else f.cook = Math.max(0, f.cook - dt * 2);
      const lit = f.burn > 0;
      if (lit && was === B.furnace) this.world.set(x, y, z, B.litFurnace, this.world.getMeta(x, y, z));
      if (!lit && was === B.litFurnace) this.world.set(x, y, z, B.furnace, this.world.getMeta(x, y, z));
    }
  }

  /* ───────────── 그리기 ───────────── */

  private buildHand() {
    const arm = buildFirstPersonArm(this.skin, this.armMats as unknown as THREE.MeshLambertMaterial[]);
    arm.scale.setScalar(0.8);
    arm.name = "arm";
    this.hand.add(arm);
    this.hand.position.set(0.42, -0.42, -0.3);
    this.hand.rotation.set(0.12, 0.32, -0.08);
    this.camera.add(this.hand);
    this.handL.position.set(-0.42, -0.42, -0.3);
    this.camera.add(this.handL);
    const rig = buildSteve(this.skin, this.steveMats);
    this.steve = { root: rig.root, limbs: rig.limbs };
    this.steveHolder.add(rig.root);
    this.steveHolder.visible = false;
    this.scene.add(this.steveHolder);
  }

  private loadSkin(url: string) {
    new THREE.ImageLoader().load(url, (img) => {
      if (this.disposed || img.width !== 64 || (img.height !== 64 && img.height !== 32)) return;
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.skin = tex;
      for (const m of [...this.armMats, ...this.steveMats]) {
        m.map = tex;
        m.needsUpdate = true;
      }
    });
  }

  private updateHeld() {
    const stackKey = (s: Stack | null) => (s ? `${s.id}${s.ench ? "*" : ""}` : "");
    const isCube = (id: string) => {
      const b = heldPixels(id).block;
      return b !== null && CUBE_SHAPES.has(BLOCKS[b]!.shape);
    };
    /* 1인칭: 오른손 (빈손이면 팔), 왼손은 아이템만 */
    for (const off of [false, true]) {
      const s = off ? this.inv.offhand : this.inv.held();
      const key = stackKey(s);
      if (key === (off ? this.heldKeyL : this.heldKey)) continue;
      const group = off ? this.handL : this.hand;
      const old = off ? this.heldMeshL : this.heldMesh;
      if (old) {
        group.remove(old);
        disposeObj(old);
      }
      let mesh: THREE.Object3D | null = null;
      if (s) {
        const m = (off ? -1 : 1) as 1 | -1;
        mesh = itemMesh(s.id, true, Boolean(s.ench));
        if (s.id === "shield") {
          mesh.position.set(0.02 * m, -0.02, -0.42);
          mesh.rotation.set(0, 0.25 * -m, 0);
        } else if (isCube(s.id)) {
          mesh.position.set(0.05 * m, 0.02, -0.38);
          mesh.rotation.set(0.1, 0.75 * m, 0);
        } else {
          mesh.position.set(0.02 * m, 0.15, -0.42);
          mesh.rotation.set(0, -1.2 * m, 0.2 * m);
          if (off) mesh.scale.x = -1;
        }
        group.add(mesh);
      }
      if (off) {
        this.heldKeyL = key;
        this.heldMeshL = mesh;
      } else {
        this.heldKey = key;
        this.heldMesh = mesh;
        const arm = this.hand.getObjectByName("arm");
        if (arm) arm.visible = !s;
      }
    }
    /* 3인칭: 캐릭터 손에 쥐여 준다 */
    if (!this.steve) return;
    for (const off of [false, true]) {
      const s = off ? this.inv.offhand : this.inv.held();
      const key = stackKey(s);
      if (key === (off ? this.tpKeyL : this.tpKey)) continue;
      const arm = off ? this.steve.limbs.armL : this.steve.limbs.armR;
      const old = off ? this.tpHeldL : this.tpHeld;
      if (old) {
        arm.remove(old);
        disposeObj(old);
      }
      let mesh: THREE.Object3D | null = null;
      if (s) {
        mesh = itemMesh(s.id, false, Boolean(s.ench));
        if (s.id === "shield") {
          mesh.position.set(off ? 0.12 : -0.12, -0.5, 0.12);
          mesh.scale.setScalar(0.75);
        } else if (isCube(s.id)) {
          mesh.position.set(0, -0.72, 0.12);
          mesh.scale.setScalar(0.6);
          mesh.rotation.set(0.2, 0.75, 0);
        } else {
          mesh.position.set(0, -0.66, 0.16);
          mesh.rotation.set(Math.PI / 4, -Math.PI / 2, 0, "XYZ");
          mesh.scale.setScalar(0.8);
        }
        arm.add(mesh);
      }
      if (off) {
        this.tpKeyL = key;
        this.tpHeldL = mesh;
      } else {
        this.tpKey = key;
        this.tpHeld = mesh;
      }
    }
  }

  daylight() {
    if (this.mode === "mine") return 0;
    const sun = Math.sin(this.time * Math.PI * 2);
    return Math.max(0.27, Math.min(1, sun * 2.2 + 0.55));
  }

  private updateSky() {
    if (this.mode === "mine") return;
    const t = this.time;
    const sun = Math.sin(t * Math.PI * 2);
    const day = this.daylight();
    const dayCol = new THREE.Color(0x7ba4ff);
    const nightCol = new THREE.Color(0x0a0e1c);
    const sunset = new THREE.Color(0xf08a4a);
    const sky = nightCol.clone().lerp(dayCol, (day - 0.27) / 0.73);
    const dusk = Math.max(0, 1 - Math.abs(sun) * 5);
    const fog = sky.clone().lerp(new THREE.Color(0xc8dcff), 0.35 * day).lerp(sunset, dusk * 0.45);
    if (this.headInWater) {
      fog.set(0x1a3a8a).multiplyScalar(Math.max(0.3, day));
      this.mats.uniforms.uFogNear.value = 2;
      this.mats.uniforms.uFogFar.value = 18;
    } else {
      this.mats.uniforms.uFogNear.value = this.renderDist * 16 * 0.62;
      this.mats.uniforms.uFogFar.value = this.renderDist * 16 * 0.95;
    }
    this.scene.background = sky.lerp(sunset, dusk * 0.25);
    // 지형 셰이더와 같은 안개를 몹 · 아이템에도 — 안 그러면 지형이 안개에 묻힌 먼 곳에서 몹만 떠 보인다
    const sceneFog = this.scene.fog as THREE.Fog;
    sceneFog.color.copy(fog);
    sceneFog.near = this.mats.uniforms.uFogNear.value;
    sceneFog.far = this.mats.uniforms.uFogFar.value;
    // 셰이더는 sRGB 값 그대로 쓰므로 선형 색을 되돌려 넘긴다
    this.mats.uniforms.uFogColor.value.copy(fog).convertLinearToSRGB();
    this.mats.uniforms.uDaylight.value = day;
    this.skyGroup.position.copy(this.camera.position);
    const ang = t * Math.PI * 2;
    this.sun.position.set(0, Math.sin(ang) * 300, Math.cos(ang) * -300).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.2);
    this.sun.lookAt(this.camera.position);
    this.moon.position.copy(this.sun.position).multiplyScalar(-1);
    this.moon.lookAt(this.camera.position);
    this.sun.position.add(this.camera.position).sub(this.skyGroup.position);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - (day - 0.27) * 3);
    this.clouds.position.set(this.camera.position.x, 120, this.camera.position.z);
    const cm = this.clouds.material as THREE.MeshBasicMaterial;
    cm.map!.offset.set((this.camera.position.x / 1600 + this.time * 2) % 1, -this.camera.position.z / 1600);
    cm.color.setScalar(Math.max(0.25, day));
  }

  private render(dt: number) {
    const eye = this.eyePos();
    const dir = this.lookDir();
    const third = this.viewMode !== 0;
    if (third) {
      // 1: 뒤에서 · 2: 앞에서 나를 본다 (벽에 막히면 당겨 온다)
      const sgn = this.viewMode === 1 ? -1 : 1;
      let d = 4;
      for (let t = 0.3; t <= 4; t += 0.1) {
        const p = eye.clone().addScaledVector(dir, sgn * t);
        if (isOpaque(this.world.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))) {
          d = Math.max(0.3, t - 0.3);
          break;
        }
      }
      this.camera.position.copy(eye).addScaledVector(dir, sgn * d);
      this.camera.lookAt(eye);
    } else {
      this.camera.position.copy(eye);
      if (this.hurtT > 0) this.camera.position.y -= Math.sin(this.hurtT * 20) * 0.03;
      this.camera.lookAt(eye.clone().add(dir));
    }
    const fovWant = 70 + (this.sprinting ? 8 : 0) - (this.bowT > 0 ? Math.min(1, this.bowT) * 12 : 0);
    if (Math.abs(this.camera.fov - fovWant) > 0.05) {
      this.camera.fov += (fovWant - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
      this.syncParticleScale();
    }
    if (this.hurtT > 0) this.camera.rotateZ(Math.sin(this.hurtT * 25) * 0.04);

    /* 손 */
    this.hand.visible = !third && !this.dead;
    this.handL.visible = !third && !this.dead;
    this.updateHeld();
    const [s, b] = this.world.lightAt(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
    const br = brightness(Math.max((s / 15) * this.daylight(), b / 15), this.mats.uniforms.uMinLight.value);
    for (const m of this.armMats) m.color.setScalar(br);
    this.ambient.intensity = br * 2.4;
    const glint = 0.15 + 0.08 * Math.sin(performance.now() / 260);
    const shade = (root: THREE.Object3D | null, light: number) =>
      root?.traverse((o) => {
        const mm = (o as THREE.Mesh).material;
        if (!mm || o.name === "arm") return;
        for (const mt of Array.isArray(mm) ? mm : [mm]) {
          if (!(mt as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
          if (o.name === "glint") {
            mt.opacity = glint;
            continue;
          }
          const base = mt.userData.base as THREE.Color | undefined;
          if (base) (mt as THREE.MeshBasicMaterial).color.setRGB(base.r * light, base.g * light, base.b * light);
          else (mt as THREE.MeshBasicMaterial).color.setScalar(light);
        }
      });
    shade(this.hand, br);
    shade(this.handL, br);
    this.swingT = Math.max(0, this.swingT - dt);
    // 마인크래프트 손 휘두르기 곡선 (ItemInHandRenderer)
    const p = this.swingT > 0 ? 1 - this.swingT / 0.3 : 0;
    const sq = Math.sqrt(p);
    const swH = Math.sin(sq * Math.PI);
    const swG = Math.sin(p * p * Math.PI);
    const speed = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / WALK) * (this.onGround ? 1 : 0.2);
    const bob = Math.sin(performance.now() / 120) * 0.02 * speed;
    const eat = this.eatT > 0 ? Math.sin(this.eatT * 18) * 0.04 : 0;
    const usingL = this.useOff && (this.eatT > 0 || this.bowT > 0);
    const eatR = this.eatT > 0 && !usingL;
    this.hand.position.set(
      0.42 + bob - 0.24 * swH - (eatR ? 0.2 : 0),
      -0.42 - Math.abs(bob) + (eatR ? eat + 0.12 : 0) + 0.12 * Math.sin(sq * Math.PI * 2),
      -0.3 - 0.12 * Math.sin(p * Math.PI),
    );
    this.hand.rotation.set(0.12 - swH * 1.1, 0.32 - swG * 0.35 + (eatR ? 0.6 : 0), -0.08 - swH * 0.35);
    // 방패를 들면 화면 가운데로 올린다
    const blockR = this.blocking && !this.blockingOff;
    const blockL = this.blocking && this.blockingOff;
    if (blockR) this.hand.position.set(0.22, -0.28, -0.3);
    this.handL.position.set(-0.42 - bob + (usingL && this.eatT > 0 ? 0.2 : 0) + (blockL ? 0.2 : 0), -0.42 - Math.abs(bob) + (usingL ? eat + 0.12 : 0) + (blockL ? 0.14 : 0), -0.3);
    this.handL.rotation.set(0.12, -0.32 - (usingL && this.eatT > 0 ? 0.6 : 0), 0.08);

    /* 3인칭 캐릭터 (F5) */
    if (this.steve) {
      this.steveHolder.visible = third && !this.dead;
      if (third) {
        this.steveHolder.position.copy(this.pos);
        this.steveHolder.rotation.y = this.yaw + Math.PI;
        const l = this.steve.limbs;
        poseSteve(l, {
          t: performance.now() / 1000,
          walk: (performance.now() / 1000) * Math.hypot(this.vel.x, this.vel.z) * 0.9,
          speed: Math.hypot(this.vel.x, this.vel.z) / 4.3,
          swing: this.swingT > 0 ? this.swingT * 0.9 : 0,
          pitch: -this.pitch,
          air: this.onGround ? 0 : 0.5,
          sneak: this.sneakT,
        });
        // 무언가 들고 있으면 팔을 살짝 앞으로 (마인크래프트 자세)
        if (this.inv.held() && this.swingT <= 0) l.armR.rotation.x = l.armR.rotation.x * 0.5 - 0.31;
        if (this.inv.offhand) l.armL.rotation.x = l.armL.rotation.x * 0.5 - 0.31;
        if (this.bowT > 0) {
          l.armR.rotation.set(-Math.PI / 2 + this.pitch, -0.1, 0);
          l.armL.rotation.set(-Math.PI / 2 + this.pitch, 0.5, 0);
        }
        if (this.eatT > 0) (usingL ? l.armL : l.armR).rotation.set(-1.2 + Math.sin(this.eatT * 18) * 0.1, usingL ? 0.4 : -0.4, 0);
        if (blockR) l.armR.rotation.set(-0.95, -0.5, 0);
        if (blockL) l.armL.rotation.set(-0.95, 0.5, 0);
        for (const m of this.steveMats) m.color.setScalar(br);
        shade(this.tpHeld, br);
        shade(this.tpHeldL, br);
      }
    }

    /* 선택 테두리 */
    const hit = this.inputOn && !this.dead ? this.targetBlock() : null;
    if (hit) {
      this.outline.visible = true;
      this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else this.outline.visible = false;

    this.mats.uniforms.uTime.value = performance.now() / 1000;
    this.updateShadow();
    this.renderer.render(this.scene, this.camera);
  }

  private updateShadow() {
    const u = this.mats.uniforms;
    if (!this.shadow) {
      u.uShadowStr.value = 0;
      return;
    }
    const ang = this.time * Math.PI * 2;
    const el = Math.sin(ang);
    const str = THREE.MathUtils.smoothstep(el, 0.03, 0.22) * (this.headInWater ? 0.2 : 0.4);
    u.uShadowStr.value = str;
    if (str <= 0) return;
    // 모바일은 그림자 맵을 두 프레임에 한 번 갱신 (맵이 월드 좌표라 지형 그림자는 그대로 맞는다)
    if (this.touch && this.shadowFrame++ % 2 === 1) return;
    SUN_DIR.set(0, el, -Math.cos(ang)).applyAxisAngle(Y_AXIS, 0.2).normalize();
    u.uSunDir.value.copy(SUN_DIR);
    if (this.steveHolder.visible) markCasters(this.steveHolder);
    if (this.remotes) markCasters(this.remotes.group);
    this.shadow.update(this.renderer, this.scene, this.pos, SUN_DIR, SUN_AXIS, u);
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.syncParticleScale();
  }

  /* ───────────── 루프 ───────────── */

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.last < FRAME_MIN_MS) return;
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 1) {
      this.fps = this.frames;
      this.frames = 0;
      this.fpsT = 0;
    }

    this.updateChunks();
    const pc = this.world.chunkAt(this.pos.x, this.pos.z);
    const ready = pc && !pc.dirty;
    if (this.mode === "wild") this.time = this.multi ? this.sharedTime() : (this.time + dt / DAY_SECONDS) % 1;
    if (pc && !pc.dirty && this.needSettle && this.world.hasNeighbors(pc.cx, pc.cz)) {
      this.needSettle = false;
      this.settleSpawn();
    }
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.attackCharge += dt;

    if (ready) {
      while (dt > 0) {
        const step = Math.min(dt, 1 / 60);
        this.stepPlayer(step);
        dt -= step;
      }
    }
    const fdt = Math.min(0.05, (now - (this.lastWorld || now)) / 1000) || 0.016;
    this.lastWorld = now;
    this.updateBreaking(fdt);
    this.updateUse(fdt);
    this.updateMobs(fdt);
    this.spawnHostiles(fdt);
    this.updateDrops(fdt);
    this.particles.update(fdt);
    this.updateArrows(fdt);
    this.updateOrbs(fdt);
    this.updateTnts(fdt);
    if (this.mode === "wild") this.layEggs(fdt);
    this.tickEffects(fdt);
    this.updateLiquids();
    this.randomTicks();
    this.tickFurnaces(fdt);
    this.tickMulti(fdt);
    this.updateSky();
    this.render(fdt);

    this.hudT -= fdt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.events.hud(this.hud());
    }
    this.saveT += fdt;
    if (this.saveT > 15) {
      this.saveT = 0;
      this.save();
    }
  };
  private lastWorld = 0;

  private hud(): HudState {
    const hit = this.targetBlock();
    const deg = ((((-this.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const facing = deg < 45 || deg >= 315 ? "북쪽 (−Z)" : deg < 135 ? "동쪽 (+X)" : deg < 225 ? "남쪽 (+Z)" : "서쪽 (−X)";
    const [s, b] = this.world.lightAt(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z));
    return {
      hp: this.hp,
      food: this.food,
      air: this.air,
      armor: this.inv.armorPoints().def,
      pos: [this.pos.x, this.pos.y, this.pos.z],
      biome: this.gen ? this.gen.biomeAt(Math.floor(this.pos.x), Math.floor(this.pos.z)).name : "광산",
      facing,
      time: this.time,
      fps: this.fps,
      chunks: this.world.chunks.size,
      light: Math.max(Math.round(s * this.daylight()), b),
      underwater: this.headInWater,
      dead: this.dead,
      breaking: this.breakCell ? Math.max(0, this.breakProgress) : 0,
      target: hit ? BLOCKS[hit.id]!.name : null,
      mobs: this.mobs.length,
      sneaking: this.sneaking,
      sprinting: this.sprinting,
      xpLevel: this.xpLevel,
      xpProgress: this.xpProg,
      absorb: this.absorb,
      heldInfo: this.heldInfo(),
      blocking: this.blocking,
    };
  }

  /** 나침반·시계를 들면 액션바에 정보를 보여 준다 */
  private heldInfo(): string | null {
    const ids = [this.inv.held()?.id, this.inv.offhand?.id];
    if (ids.includes("compass")) {
      const dx = this.spawn.x - this.pos.x;
      const dz = this.spawn.z - this.pos.z;
      const dist = Math.round(Math.hypot(dx, dz));
      if (dist < 2) return "🧭 스폰 지점이에요";
      const look = this.lookDir();
      const rel = Math.atan2(look.x * dz - look.z * dx, look.x * dx + look.z * dz);
      const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
      const i = (Math.round((rel / (Math.PI * 2)) * 8) + 8) % 8;
      return `🧭 스폰까지 ${arrows[i]} ${dist}칸`;
    }
    if (ids.includes("clock")) {
      const mins = Math.floor((((this.time * 24 + 6) % 24) * 60));
      const hh = Math.floor(mins / 60);
      const mm = mins % 60;
      const night = hh < 6 || hh >= 19;
      return `${night ? "🌙" : "☀️"} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return null;
  }

  dispose() {
    this.save();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.cleanup) f();
    for (let i = this.mobs.length - 1; i >= 0; i--) this.removeMob(i);
    for (const d of this.drops) this.removeDrop(d);
    for (const o of this.orbs) this.scene.remove(o.sprite);
    for (const t of this.tnts) disposeObj(t.mesh);
    if (this.heldMesh) disposeObj(this.heldMesh);
    if (this.heldMeshL) disposeObj(this.heldMeshL);
    this.remotes?.dispose();
    this.particles.dispose();
    this.world.dispose();
    this.shadow?.dispose();
    this.shadowStub.depthTexture?.dispose();
    this.shadowStub.dispose();
    this.mats.solid.dispose();
    this.mats.water.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/* ───────────── 도우미 ───────────── */

function bidOf(key: string) {
  return BLOCKS.find((b) => b.key === key)!.id;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SUN_DIR = new THREE.Vector3();
/** 태양 궤도(YZ 평면을 Y 축으로 0.2 돌린 면)의 회전축 */
const SUN_AXIS = new THREE.Vector3(Math.cos(0.2), 0, -Math.sin(0.2));

function brightness(l: number, min: number) {
  const f = l / (4 - 3 * l);
  return Math.max(min, f + (1 - Math.pow(1 - f, 4) - f) * 0.6);
}

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

function rayBox(o: THREE.Vector3, d: THREE.Vector3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const os = [o.x, o.y, o.z];
  const ds = [d.x, d.y, d.z];
  const lo = [x0, y0, z0];
  const hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(ds[a]!) < 1e-9) {
      if (os[a]! < lo[a]! || os[a]! > hi[a]!) return null;
      continue;
    }
    let t0 = (lo[a]! - os[a]!) / ds[a]!;
    let t1 = (hi[a]! - os[a]!) / ds[a]!;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) return null;
  }
  return tmin;
}

function canvasTex(px: Uint8ClampedArray) {
  const c = document.createElement("canvas");
  c.width = T;
  c.height = T;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(px), T, T), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const tileTexCache = new Map<string, THREE.Texture>();
function tileTexture(name: string) {
  let t = tileTexCache.get(name);
  if (!t) {
    t = canvasTex(tilePixels(name));
    tileTexCache.set(name, t);
  }
  return t;
}
const DROP_CUBE = new THREE.BoxGeometry(0.25, 0.25, 0.25);
const FACE_SHADE = [0.6, 0.6, 1, 0.5, 0.8, 0.8];
const CUBE_SHAPES = new Set(["cube", "cactus", "farmland"]);

/** 떨어진 아이템: 블록은 작은 정육면체, 나머지는 납작한 그림 */
function dropMesh(id: string): { obj: THREE.Mesh; mats: THREE.MeshBasicMaterial[] } {
  const { px, block } = heldPixels(id);
  const def = block !== null ? BLOCKS[block]! : null;
  if (def && CUBE_SHAPES.has(def.shape)) {
    const tint = def.tint ? new THREE.Color(def.tint === "grass" ? 0x91bd59 : 0x77ab2f).convertSRGBToLinear() : null;
    const mats = def.faces.map((f, i) => {
      const m = new THREE.MeshBasicMaterial({ map: tileTexture(f), transparent: Boolean(def.cutout), alphaTest: 0.3 });
      const base = new THREE.Color().setScalar(FACE_SHADE[i]!);
      if (tint && (!def.tintTop || i === 2)) base.multiply(tint);
      m.userData.base = base;
      return m;
    });
    return { obj: new THREE.Mesh(DROP_CUBE, mats), mats };
  }
  let geo = dropGeoCache.get(id);
  if (!geo) {
    geo = extrudeSprite(px, 0.5);
    dropGeoCache.set(id, geo);
  }
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.userData.base = new THREE.Color(1, 1, 1);
  return { obj: new THREE.Mesh(geo, m), mats: [m] };
}
const dropGeoCache = new Map<string, THREE.BufferGeometry>();

let orbTex: THREE.Texture | null = null;
/** 경험치 구슬: 마크처럼 연두 · 노랑으로 반짝이는 작은 픽셀 구슬 */
function orbMaterial() {
  if (!orbTex) {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const g = c.getContext("2d")!;
    const rows = ["..1111..", ".1aabb1.", "1aaaabb1", "1aaccab1", "1abccaa1", "1bbaaaa1", ".1bbaa1.", "..1111.."];
    const pal: Record<string, string> = { "1": "#3d6b00", a: "#c4f53d", b: "#7cc61d", c: "#fbff9e" };
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!pal[ch]) return;
        g.fillStyle = pal[ch]!;
        g.fillRect(x, y, 1, 1);
      }),
    );
    orbTex = new THREE.CanvasTexture(c);
    orbTex.magFilter = THREE.NearestFilter;
    orbTex.minFilter = THREE.NearestFilter;
    orbTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.SpriteMaterial({ map: orbTex, transparent: true, alphaTest: 0.3, fog: false });
}

/**
 * 마인크래프트 손 아이템: 16×16 그림을 1픽셀 두께로 뽑아 올린 입체.
 * 정점 색으로 그려서 밝기는 material.color 로 곱한다.
 */
function extrudeSprite(px: Uint8ClampedArray, size: number) {
  const pos: number[] = [];
  const col: number[] = [];
  const idxs: number[] = [];
  const s = size / T;
  const th = s;
  const alpha = (x: number, y: number) => x >= 0 && y >= 0 && x < T && y < T && px[(y * T + x) * 4 + 3]! > 76;
  const quad = (pts: number[][], r: number, g: number, b: number) => {
    const base = pos.length / 3;
    for (const p of pts) {
      pos.push(p[0]!, p[1]!, p[2]!);
      col.push(r, g, b);
    }
    idxs.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (!alpha(x, y)) continue;
      const i = (y * T + x) * 4;
      const lin = (v: number) => Math.pow(v / 255, 2.2);
      const r = lin(px[i]!);
      const g = lin(px[i + 1]!);
      const b = lin(px[i + 2]!);
      const x0 = (x - T / 2) * s;
      const x1 = x0 + s;
      const y1 = (T / 2 - y) * s;
      const y0 = y1 - s;
      const zf = th / 2;
      const zb = -th / 2;
      quad([[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf]], r, g, b);
      quad([[x1, y0, zb], [x0, y0, zb], [x0, y1, zb], [x1, y1, zb]], r * 0.8, g * 0.8, b * 0.8);
      if (!alpha(x - 1, y)) quad([[x0, y0, zb], [x0, y0, zf], [x0, y1, zf], [x0, y1, zb]], r * 0.7, g * 0.7, b * 0.7);
      if (!alpha(x + 1, y)) quad([[x1, y0, zf], [x1, y0, zb], [x1, y1, zb], [x1, y1, zf]], r * 0.7, g * 0.7, b * 0.7);
      if (!alpha(x, y - 1)) quad([[x0, y1, zf], [x1, y1, zf], [x1, y1, zb], [x0, y1, zb]], r * 0.9, g * 0.9, b * 0.9);
      if (!alpha(x, y + 1)) quad([[x0, y0, zb], [x1, y0, zb], [x1, y0, zf], [x0, y0, zf]], r * 0.6, g * 0.6, b * 0.6);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idxs);
  return geo;
}

/** 방패: 나무 판에 철 테두리 (12×22 픽셀 판) */
function shieldMesh(fp: boolean) {
  const front = canvasTex(spriteOr("shield"));
  const wood = new THREE.MeshBasicMaterial({ color: 0x8a6436, depthTest: !fp });
  const face = new THREE.MeshBasicMaterial({ map: front, depthTest: !fp, transparent: true, alphaTest: 0.3 });
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.05), [wood, wood, wood, wood, face, wood]);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.1), wood);
  handle.position.z = -0.07;
  g.add(board, handle);
  for (const m of [board, handle]) {
    m.renderOrder = fp ? 60 : 0;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) mt.userData.base = new THREE.Color(mt === wood ? 0x8a6436 : 0xffffff).convertSRGBToLinear();
  }
  return g;
}

function spriteOr(key: string) {
  return heldPixels(key).px;
}

/** 손 · 3인칭 · 떨어진 아이템 공통: 블록은 작은 정육면체, 나머지는 입체 그림 */
function itemMesh(key: string, fp: boolean, glint: boolean): THREE.Object3D {
  if (key === "shield") return shieldMesh(fp);
  const { px, block } = heldPixels(key);
  const def = block !== null ? BLOCKS[block]! : null;
  if (def && CUBE_SHAPES.has(def.shape)) {
    const tint = def.tint ? new THREE.Color(def.tint === "grass" ? 0x91bd59 : 0x77ab2f).convertSRGBToLinear() : null;
    const mats = def.faces.map((f, i) => {
      const m = new THREE.MeshBasicMaterial({ map: tileTexture(f), depthTest: !fp, transparent: Boolean(def.cutout), alphaTest: 0.3 });
      const base = new THREE.Color().setScalar(FACE_SHADE[i]!);
      if (tint && (!def.tintTop || i === 2)) base.multiply(tint);
      m.color.copy(base);
      m.userData.base = base;
      return m;
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mats);
    mesh.renderOrder = fp ? 60 : 0;
    return mesh;
  }
  const geo = extrudeSprite(px, 0.62);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: !fp });
  m.userData.base = new THREE.Color(1, 1, 1);
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = fp ? 60 : 0;
  if (!glint) return mesh;
  const g = new THREE.Group();
  g.add(mesh);
  const shine = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0x8040ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthTest: !fp, depthWrite: false }),
  );
  shine.name = "glint";
  shine.scale.setScalar(1.02);
  shine.renderOrder = fp ? 61 : 1;
  g.add(shine);
  return g;
}

function disposeObj(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (n.name !== "glint") m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) mt.dispose();
  });
}

/** 양 털 색 바꾸기 (염료 우클릭) */
function dyeSheep(m: Mob, color: string) {
  setWoolColor(m, color);
}

function sunTex(moon: boolean) {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d")!;
  if (moon) {
    g.fillStyle = "#dfe4ee";
    g.fillRect(8, 8, 16, 16);
    g.fillStyle = "#b9c0cc";
    g.fillRect(11, 11, 3, 3);
    g.fillRect(18, 15, 4, 3);
    g.fillRect(13, 19, 3, 2);
  } else {
    g.fillStyle = "rgba(255,240,170,0.35)";
    g.fillRect(4, 4, 24, 24);
    g.fillStyle = "#fff7c8";
    g.fillRect(8, 8, 16, 16);
    g.fillStyle = "#ffe066";
    g.fillRect(10, 10, 12, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cloudTex() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  const r = mulberry32(99);
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * S);
    const y = Math.floor(r() * S);
    const w = 2 + Math.floor(r() * 9);
    const h = 2 + Math.floor(r() * 6);
    for (const [ox, oy] of [
      [0, 0],
      [-S, 0],
      [0, -S],
      [-S, -S],
    ])
      g.fillRect(x + ox!, y + oy!, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
