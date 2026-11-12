import * as THREE from "three";
import { getAtlas } from "@/components/voxel/atlas";
import { ckey, makeMaterials, VoxelWorld } from "@/components/voxel/world";
import { createShadowStub, SunShadow } from "@/components/voxel/sun-shadow";
import { CS, WorldGen } from "@/lib/voxel/worldgen";

/** 평원 · 숲 · 물이 고루 섞인 지점 (시드 23) */
const SEED = 23;
const VIEW_X = 64;
const VIEW_Z = -320;
const FRAME_MIN_MS = 1000 / 120 - 0.5;
const SKY_TOP = "#4f7fdc";
const SKY_HORIZON = "#a8c8ff";
const ORBIT_SPEED = 0.035;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, SKY_TOP);
  grad.addColorStop(0.55, SKY_HORIZON);
  grad.addColorStop(1, SKY_HORIZON);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 랜딩 배경 — 야생 월드 생성기로 만든 실제 지형 위를 카메라가 천천히 돈다 (조작 없음) */
export class LandingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: VoxelWorld;
  private mats: ReturnType<typeof makeMaterials>;
  private shadow: SunShadow | null;
  private shadowStub: THREE.WebGLRenderTarget;
  private sunDir = new THREE.Vector3();
  private sunAxis = new THREE.Vector3(Math.cos(0.2), 0, -Math.sin(0.2));
  private center: THREE.Vector3;
  private queue: [number, number, number][] = [];
  private radius: number;
  private raf = 0;
  private last = 0;
  private time = 0;
  private ready = false;
  private disposed = false;
  private ro: ResizeObserver;

  constructor(
    private container: HTMLElement,
    private onReady: () => void,
  ) {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    this.radius = touch ? 4 : 6;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const el = this.renderer.domElement;
    el.style.display = "block";
    el.style.width = "100%";
    el.style.height = "100%";
    container.appendChild(el);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, this.radius * 16 + 120);
    this.scene.background = skyTexture();

    this.mats = makeMaterials(getAtlas());
    const u = this.mats.uniforms;
    u.uDaylight.value = 1;
    u.uFogNear.value = this.radius * 16 * 0.6;
    u.uFogFar.value = this.radius * 16 * 1.05;
    u.uFogColor.value.set(SKY_HORIZON).convertLinearToSRGB();

    const group = new THREE.Group();
    this.scene.add(group);
    const gen = new WorldGen(SEED);
    this.world = new VoxelWorld(gen, group, this.mats, 0);
    const spawn = { x: VIEW_X + 0.5, y: gen.column(VIEW_X, VIEW_Z).h + 1, z: VIEW_Z + 0.5 };
    this.center = new THREE.Vector3(spawn.x, spawn.y, spawn.z);

    this.shadowStub = createShadowStub(this.renderer);
    u.uShadowMap.value = this.shadowStub.depthTexture;
    this.shadow = touch ? null : new SunShadow(2048, 52, this.shadowStub.depthTexture!);
    const ang = 0.085 * Math.PI * 2;
    this.sunDir.set(0, Math.sin(ang), -Math.cos(ang)).applyAxisAngle(Y_AXIS, 0.2).normalize();
    u.uSunDir.value.copy(this.sunDir);

    const pcx = Math.floor(spawn.x / CS);
    const pcz = Math.floor(spawn.z / CS);
    const R = this.radius + 1;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d = dx * dx + dz * dz;
        if (d <= (R + 0.5) * (R + 0.5)) this.queue.push([pcx + dx, pcz + dz, d]);
      }
    this.queue.sort((a, b) => a[2] - b[2]);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 한 프레임에 조금씩 청크를 만들고 메시를 굽는다 — 가까운 것부터 */
  private stream() {
    const start = performance.now();
    let made = 0;
    for (const [cx, cz] of this.queue) {
      if (made >= 3 || performance.now() - start > 8) break;
      if (!this.world.chunks.has(ckey(cx, cz))) {
        this.world.load(cx, cz);
        made++;
      }
    }
    const pcx = Math.floor(this.center.x / CS);
    const pcz = Math.floor(this.center.z / CS);
    let meshed = 0;
    let pendingNear = 0;
    for (const [cx, cz, d] of this.queue) {
      if (d > this.radius * this.radius + 1) continue;
      const c = this.world.chunks.get(ckey(cx, cz));
      const near = Math.abs(cx - pcx) <= 2 && Math.abs(cz - pcz) <= 2;
      if (!c || c.dirty) {
        if (near) pendingNear++;
        if (c?.dirty && meshed < 3 && performance.now() - start < 14 && this.world.hasNeighbors(cx, cz)) {
          this.world.rebuild(c);
          meshed++;
          if (near) pendingNear--;
        }
      }
    }
    if (!this.ready && pendingNear === 0) {
      this.ready = true;
      this.onReady();
    }
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (now - this.last < FRAME_MIN_MS) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.stream();
    if (!this.ready) return;
    this.time += dt;

    const intro = 1 - Math.pow(1 - Math.min(1, this.time / 5), 3);
    const a = 0.6 + this.time * ORBIT_SPEED;
    const dist = THREE.MathUtils.lerp(62, 40, intro);
    const lift = THREE.MathUtils.lerp(42, 25, intro) + Math.sin(this.time * 0.25) * 1.5;
    this.camera.position.set(this.center.x + Math.cos(a) * dist, this.center.y + lift, this.center.z + Math.sin(a) * dist);
    this.camera.lookAt(this.center.x, this.center.y + 4, this.center.z);

    const u = this.mats.uniforms;
    u.uTime.value = now / 1000;
    if (this.shadow) {
      u.uShadowStr.value = 0.4;
      this.shadow.update(this.renderer, this.scene, this.center, this.sunDir, this.sunAxis, u);
    } else u.uShadowStr.value = 0;
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.world.dispose();
    this.mats.solid.dispose();
    this.mats.water.dispose();
    this.shadow?.dispose();
    this.shadowStub.depthTexture?.dispose();
    this.shadowStub.dispose();
    (this.scene.background as THREE.Texture | null)?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
