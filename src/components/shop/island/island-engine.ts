import * as THREE from "three";
import { buildSteve, makeSkinTexture, poseSteve, type SteveLimbs } from "@/components/world/steve-model";
import { CUTOUT_TEXTURES, TEX, TRANSLUCENT_TEXTURES, texturePixels, type TextureName } from "@/lib/island/textures";
import {
  BUILD,
  ITEMS,
  PORTAL_CELLS,
  SIGNS,
  SPAWN,
  STATIC_CELLS,
  cellKey,
  inBuildArea,
  occupiedCells,
  sceneItems,
  type ItemId,
  type ModelBox,
  type PlacedBlock,
  type SignSpec,
} from "@/lib/island/world";

export type SignTexts = Record<SignSpec["key"], string[]>;

export type EngineOptions = {
  blocks: PlacedBlock[];
  editable: boolean;
  signs: SignTexts;
  onBlocksChange?: (blocks: PlacedBlock[]) => void;
  onPortal?: () => void;
  onViewChange?: (firstPerson: boolean) => void;
  onNotice?: (msg: string) => void;
};

const EYE = 1.62;
const HALF_W = 0.3;
const HEIGHT = 1.8;
const GRAVITY = 28;
const JUMP_V = 8.6;
const WALK = 4.3;
const SPRINT = 5.9;
const MAX_ZOOM = 18;
const SUN_OFFSET = new THREE.Vector3(30, 60, 20);
const FP_THRESHOLD = 0.7;
/** 120fps 상한 — rAF 간격 편차를 감안해 살짝 여유를 둔다 */
const FRAME_MIN_MS = 1000 / 120 - 0.5;

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

export class IslandEngine {
  private container: HTMLElement;
  private opts: EngineOptions;
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
  private occupant = new Map<string, number>();
  private player = new THREE.Group();
  private sun!: THREE.DirectionalLight;
  private limbs: SteveLimbs | null = null;
  private playerMats: THREE.MeshLambertMaterial[] = [];
  private playerSkin: THREE.Texture | null = null;
  private animSpeed = 0;
  private time = 0;
  private highlight: THREE.LineSegments;
  private pos = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z);
  private vel = new THREE.Vector3();
  private onGround = false;
  private yaw = SPAWN.yaw;
  private pitch = -0.28;
  private zoom = 7;
  private zoomTarget = 7;
  private bodyYaw = Math.PI;
  private keys = new Set<string>();
  private mobileMove = { x: 0, y: 0 };
  private mobileJump = false;
  private respawn = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z);
  private portalCooldown = 0;
  private walkPhase = 0;
  private raf = 0;
  private last = 0;
  private introT = 0;
  private disposed = false;
  private buildMode = false;
  private selected: ItemId | null = null;
  private tool: "place" | "break" = "place";
  private pointer = new THREE.Vector2(0, 0);
  private pointerInside = false;
  private drag: { id: number; x: number; y: number; moved: boolean; button: number } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private firstPerson = false;
  private beams: THREE.Mesh[] = [];
  private clouds: THREE.Mesh[] = [];
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];

  constructor(container: HTMLElement, opts: EngineOptions) {
    this.container = container;
    this.opts = opts;
    this.blocks = opts.blocks.map((b) => [...b] as PlacedBlock);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    this.scene.background = makeCanvasTexture((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#4a80d6");
      g.addColorStop(0.5, "#92bef0");
      g.addColorStop(0.8, "#f4c496");
      g.addColorStop(1, "#fa9f70");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, 4, 256);
    this.scene.fog = new THREE.Fog(0xcfdcf0, 60, 170);

    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x806a58, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 180;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const sunMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff6c4, fog: false }),
    );
    sunMesh.position.set(90, 70, -120);
    sunMesh.lookAt(0, 0, 0);
    this.scene.add(sunMesh);

    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
    const rand = (i: number) => ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(8 + rand(i) * 14, 1.6, 5 + rand(i + 7) * 8), cloudMat);
      c.position.set(-90 + rand(i + 3) * 180, 28 + rand(i + 11) * 8, -90 + rand(i + 5) * 180);
      this.clouds.push(c);
      this.scene.add(c);
    }

    this.scene.add(this.worldGroup);
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.buildPlayer();
    this.rebuildWorld();
    this.addSigns();

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
    if (!on) this.setBuildMode(false);
  }

  setBuildMode(on: boolean) {
    this.buildMode = on && this.opts.editable;
    this.highlight.visible = false;
  }

  setSelected(id: ItemId | null) {
    this.selected = id;
  }

  setTool(tool: "place" | "break") {
    this.tool = tool;
  }

  setMobileMove(x: number, y: number) {
    this.mobileMove.x = x;
    this.mobileMove.y = y;
  }

  setMobileJump(on: boolean) {
    this.mobileJump = on;
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
    this.pos.copy(this.respawn);
    this.vel.set(0, 0, 0);
  }

  updateSigns(signs: SignTexts) {
    this.opts.signs = signs;
    this.addSigns();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const fn of this.cleanup) fn();
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
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
    const m = new THREE.MeshLambertMaterial({
      map,
      transparent: clear,
      opacity: name === "portal" ? 0.82 : name === "water" ? 0.8 : 1,
      depthWrite: name !== "water",
      alphaTest: cutout ? 0.5 : 0,
      side: cutout || clear ? THREE.DoubleSide : THREE.FrontSide,
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
    }
    this.pickables = [];
    for (const b of this.beams) this.scene.remove(b);
    this.beams = [];

    const items = sceneItems(this.blocks);
    this.solid.clear();
    this.opaque.clear();
    this.occupant.clear();
    for (const it of items) {
      if (it.cube) this.opaque.add(cellKey(it.x, it.y, it.z));
      if (it.kind === "user" && it.index !== undefined) {
        for (const [x, y, z] of occupiedCells(this.blocks[it.index]!)) {
          this.occupant.set(cellKey(x, y, z), it.index);
          if (!it.passable) this.solid.add(cellKey(x, y, z));
        }
      } else if (!it.passable) {
        this.solid.add(cellKey(it.x, it.y, it.z));
      }
    }

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
      if (it.id === "beacon") this.addBeam(it.x + 0.5, it.y + 1, it.z + 0.5);
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
      mesh.castShadow = !material.transparent;
      this.worldGroup.add(mesh);
      if (pick) this.pickables.push(mesh);
    }
  }

  private addBeam(x: number, y: number, z: number) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 60, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.35, depthWrite: false, fog: false }),
    );
    beam.position.set(x, y + 30, z);
    this.beams.push(beam);
    this.scene.add(beam);
  }

  private signGroup = new THREE.Group();

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
    for (const s of SIGNS) {
      const lines = this.opts.signs[s.key] ?? [];
      const tex = makeCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#2b1d0e";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        lines.slice(0, 3).forEach((line, i) => {
          ctx.font = `${i === 0 ? 700 : 600} ${i === 0 ? 34 : 28}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
          const y = h / 2 + (i - (Math.min(lines.length, 3) - 1) / 2) * 40;
          ctx.fillText(line, w / 2, y, w - 20);
        });
      }, 320, 144);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.5),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      const holder = new THREE.Group();
      holder.position.set(s.x + 0.5, s.y + 0.88, s.z + 0.5);
      holder.rotation.y = s.facing === "+x" ? Math.PI / 2 : s.facing === "-x" ? -Math.PI / 2 : 0;
      plane.position.set(0, 0, 0.065);
      holder.add(plane);
      this.signGroup.add(holder);
    }
    this.scene.add(this.signGroup);
  }

  /* ───────────── 플레이어 ───────────── */

  private buildPlayer() {
    this.playerSkin = makeSkinTexture({ shirt: 0x2aa7b8, hair: 0x3b2414, pants: 0x3b3f9e, accent: 0x5ef0e6, seed: 42 });
    const { root, limbs } = buildSteve(this.playerSkin, this.playerMats);
    this.player.add(root);
    this.limbs = limbs;
    this.scene.add(this.player);
  }

  /** 정품 스킨 PNG → 64×64 텍스처로 바꿔 끼운다. 옛 64×32 스킨은 왼팔·왼다리를 오른쪽 것으로 채운다 */
  setSkin(url: string) {
    new THREE.ImageLoader().load(url, (img) => {
      if (this.disposed || img.width !== 64 || (img.height !== 64 && img.height !== 32)) return;
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d");
      if (!g) return;
      g.drawImage(img, 0, 0);
      if (img.height === 32) {
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
      const old = this.playerSkin;
      this.playerSkin = tex;
      for (const m of this.playerMats) {
        m.map = tex;
        m.needsUpdate = true;
      }
      old?.dispose();
    });
  }

  /* ───────────── 입력 ───────────── */

  private bindInput() {
    const el = this.renderer.domElement;
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return Boolean(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));
    };
    const keyDown = (e: KeyboardEvent) => {
      if (isTyping(e) || !this.isActive()) return;
      const k = e.code;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (k === "KeyV") this.toggleView();
      if (k === "KeyR") this.respawnPlayer();
    };
    const keyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = Math.sign(e.deltaY) * Math.max(0.6, this.zoomTarget * 0.14);
      this.zoomBy(step);
    };
    el.addEventListener("wheel", wheel, { passive: false });

    const down = (e: PointerEvent) => {
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
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: e.button };
      this.updatePointer(e);
    };
    const move = (e: PointerEvent) => {
      this.updatePointer(e);
      if (document.pointerLockElement === el) {
        this.yaw -= e.movementX * 0.0026;
        this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0026, -1.5, 1.5);
        return;
      }
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
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) > 5) this.drag.moved = true;
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
      if (!d || d.id !== e.pointerId || d.moved) return;
      if (this.buildMode) {
        const opposite = this.tool === "place" ? "break" : "place";
        this.act(e.pointerType === "mouse" && d.button === 2 ? opposite : this.tool);
      } else if (this.zoom < FP_THRESHOLD && e.pointerType === "mouse") {
        el.requestPointerLock?.();
      }
    };
    const enter = () => (this.pointerInside = true);
    const leave = () => {
      this.pointerInside = false;
      this.highlight.visible = false;
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

  private isActive() {
    if (!this.container.isConnected) return false;
    const r = this.container.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  }

  private updatePointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /* ───────────── 건축 ───────────── */

  private raycaster = new THREE.Raycaster();

  private pick(): { cell: [number, number, number]; normal: [number, number, number] } | null {
    const ndc = this.firstPerson || document.pointerLockElement === this.renderer.domElement ? new THREE.Vector2(0, 0) : this.pointer;
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.far = 24;
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit || !hit.face) return null;
    const n = hit.face.normal;
    const p = hit.point;
    const cell: [number, number, number] = [
      Math.floor(p.x - n.x * 0.01),
      Math.floor(p.y - n.y * 0.01),
      Math.floor(p.z - n.z * 0.01),
    ];
    return { cell, normal: [Math.round(n.x), Math.round(n.y), Math.round(n.z)] };
  }

  private act(kind: "place" | "break") {
    const hit = this.pick();
    if (!hit) return;
    if (kind === "break") {
      const idx = this.occupant.get(cellKey(...hit.cell));
      if (idx === undefined) {
        this.opts.onNotice?.(STATIC_CELLS.has(cellKey(...hit.cell)) ? "공용 구조물은 부술 수 없어요" : "내 섬 블록만 부술 수 있어요");
        return;
      }
      const next = this.blocks.filter((_, i) => i !== idx);
      this.blocks = next;
      this.rebuildWorld();
      this.opts.onBlocksChange?.(next);
      return;
    }
    if (!this.selected) {
      this.opts.onNotice?.("아래 인벤토리에서 놓을 블록을 골라주세요");
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

  private step(dt: number) {
    const fwd = (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) - (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) + -this.mobileMove.y;
    const side = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) + this.mobileMove.x;
    const len = Math.hypot(fwd, side);
    const sneak = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const sprint = this.keys.has("ControlLeft") || this.keys.has("ControlRight") || (len > 0.95 && this.mobileMove.y < -0.9);
    const speed = sneak ? 1.3 : sprint && fwd > 0.1 ? SPRINT : WALK;
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
    if ((this.keys.has("Space") || this.mobileJump) && this.onGround) {
      this.vel.y = JUMP_V;
      this.onGround = false;
    }
    this.vel.y = Math.max(-40, this.vel.y - GRAVITY * dt);

    const guard = sneak && this.onGround;
    const nx = this.pos.x + this.vel.x * dt;
    if (!this.collides(nx, this.pos.y, this.pos.z) && (!guard || this.collides(nx, this.pos.y - 0.12, this.pos.z))) this.pos.x = nx;
    else this.vel.x = 0;
    const nz = this.pos.z + this.vel.z * dt;
    if (!this.collides(this.pos.x, this.pos.y, nz) && (!guard || this.collides(this.pos.x, this.pos.y - 0.12, nz))) this.pos.z = nz;
    else this.vel.z = 0;
    const ny = this.pos.y + this.vel.y * dt;
    if (!this.collides(this.pos.x, ny, this.pos.z)) {
      this.pos.y = ny;
      this.onGround = false;
    } else {
      if (this.vel.y < 0) {
        const landed = Math.floor(ny) + 1;
        if (!this.collides(this.pos.x, landed, this.pos.z)) this.pos.y = landed;
        this.onGround = true;
      }
      this.vel.y = 0;
    }

    const moving = Math.hypot(this.vel.x, this.vel.z);
    if (moving > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.bodyYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.bodyYaw += diff * Math.min(1, 12 * dt);
    }
    this.walkPhase += moving * dt * 0.9;
    this.animSpeed += (moving / WALK - this.animSpeed) * Math.min(1, dt * (moving / WALK > this.animSpeed ? 12 : 7));

    if (this.pos.y < -30) {
      this.respawnPlayer();
      this.opts.onNotice?.("떨어졌어요! 섬으로 돌아왔어요");
    }

    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    if (this.portalCooldown === 0) {
      const c = [Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z)];
      if (PORTAL_CELLS.some(([x, y, z]) => x === c[0] && (y === c[1] || y === c[1] + 1) && z === c[2])) {
        this.portalCooldown = 3;
        this.opts.onPortal?.();
      }
    }
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
    return this.opaque.has(cellKey(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (now - this.last < FRAME_MIN_MS) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.step(dt);

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

    const eye = new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(yaw) * Math.cos(this.pitch));
    const fp = dist < FP_THRESHOLD;
    if (fp !== this.firstPerson) {
      this.firstPerson = fp;
      this.opts.onViewChange?.(fp);
      if (!fp && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
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

    this.player.visible = !fp;
    this.player.position.copy(this.pos);
    this.sun.target.position.set(Math.round(this.pos.x), Math.round(this.pos.y), Math.round(this.pos.z));
    this.sun.position.copy(this.sun.target.position).add(SUN_OFFSET);
    this.player.rotation.y = this.bodyYaw;
    if (this.limbs) {
      poseSteve(this.limbs, {
        t: this.time,
        walk: this.walkPhase,
        speed: this.animSpeed,
        swing: 0,
        pitch: fp ? 0 : this.pitch,
        air: this.onGround ? 0 : Math.min(1, Math.abs(this.vel.y) / 6),
      });
    }

    for (const c of this.clouds) {
      c.position.x += dt * 0.8;
      if (c.position.x > 100) c.position.x = -100;
    }

    if (this.buildMode && (this.pointerInside || this.firstPerson)) {
      const hit = this.pick();
      if (hit) {
        this.highlight.visible = true;
        this.highlight.position.set(hit.cell[0] + 0.5, hit.cell[1] + 0.5, hit.cell[2] + 0.5);
      } else this.highlight.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  };
}

export function itemLabel(id: ItemId) {
  return ITEMS[id].label;
}
