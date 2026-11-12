import * as THREE from "three";
import { buildSteve, lookFromName, makeSkinTexture, poseSteve, type SteveLimbs } from "@/components/world/steve-model";

type Remote = {
  id: string;
  name: string;
  root: THREE.Group;
  limbs: SteveLimbs;
  mats: THREE.MeshLambertMaterial[];
  skin: THREE.Texture;
  tag: THREE.Sprite;
  to: THREE.Vector3;
  yaw: number;
  yawTo: number;
  pitch: number;
  sneak: number;
  sneakTo: number;
  speed: number;
  walk: number;
  swingT: number;
  seenAt: number;
  skinId?: string;
};

/** 오래 소식이 없으면 (멀리 갔거나 끊김) 숨긴다 */
const STALE_MS = 4000;

/** 야생에서 같이 노는 다른 플레이어들 — 서버가 보내 준 위치로 부드럽게 따라간다 */
export class RemotePlayers {
  readonly group = new THREE.Group();
  private list = new Map<string, Remote>();
  private names = new Map<string, { n: string; k?: string }>();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  get count() {
    let n = 0;
    for (const r of this.list.values()) if (r.root.visible) n++;
    return n;
  }

  /** 이름표 · 스킨 정보만 먼저 알고 있다가 위치가 오면 만든다 */
  know(id: string, name: string, skin?: string) {
    this.names.set(id, { n: name, k: skin });
    const r = this.list.get(id);
    if (r && r.name !== name) this.setName(r, name);
    if (r && skin && r.skinId !== skin) this.loadSkin(r, skin);
  }

  move(id: string, p: number[], sneak: 0 | 1) {
    if (p[1] === undefined || p[1] < -100) return;
    let r = this.list.get(id);
    if (!r) {
      const info = this.names.get(id);
      r = this.create(id, info?.n ?? "플레이어", info?.k);
      r.root.position.set(p[0]!, p[1]!, p[2]!);
      r.yaw = p[3]!;
    }
    r.to.set(p[0]!, p[1]!, p[2]!);
    if (r.root.position.distanceTo(r.to) > 12) r.root.position.copy(r.to);
    r.yawTo = p[3]!;
    r.pitch = p[4] ?? 0;
    r.sneakTo = sneak;
    r.seenAt = performance.now();
  }

  swing(id: string) {
    const r = this.list.get(id);
    if (r) r.swingT = 0.28;
  }

  remove(id: string) {
    this.names.delete(id);
    const r = this.list.get(id);
    if (!r) return;
    this.group.remove(r.root);
    this.group.remove(r.tag);
    this.free(r);
    this.list.delete(id);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
    this.names.clear();
  }

  update(dt: number, light: (x: number, y: number, z: number) => number) {
    const now = performance.now();
    const k = 1 - Math.exp(-dt * 12);
    for (const r of this.list.values()) {
      const visible = now - r.seenAt < STALE_MS;
      r.root.visible = visible;
      r.tag.visible = visible;
      if (!visible) continue;
      const before = r.root.position.clone();
      r.root.position.lerp(r.to, k);
      let dy = r.yawTo - r.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.yaw += dy * k;
      r.sneak += (r.sneakTo - r.sneak) * Math.min(1, dt * 10);
      const moved = Math.hypot(r.root.position.x - before.x, r.root.position.z - before.z) / Math.max(dt, 1e-3);
      r.speed += (moved - r.speed) * Math.min(1, dt * 8);
      r.walk += dt * r.speed * 0.9;
      r.swingT = Math.max(0, r.swingT - dt);
      r.root.rotation.y = r.yaw + Math.PI;
      poseSteve(r.limbs, {
        t: now / 1000,
        walk: r.walk,
        speed: r.speed / 4.3,
        swing: r.swingT,
        pitch: -r.pitch,
        sneak: r.sneak,
      });
      const br = light(r.root.position.x, r.root.position.y + 1, r.root.position.z);
      for (const m of r.mats) m.color.setScalar(br);
      r.tag.position.set(r.root.position.x, r.root.position.y + 2.25 - r.sneak * 0.3, r.root.position.z);
      (r.tag.material as THREE.SpriteMaterial).opacity = r.sneak > 0.5 ? 0.35 : 0.95;
    }
  }

  dispose() {
    this.disposed = true;
    this.clear();
    this.group.removeFromParent();
  }

  /* ───────────── 내부 ───────────── */

  private create(id: string, name: string, skin?: string): Remote {
    const mats: THREE.MeshLambertMaterial[] = [];
    const tex = makeSkinTexture(lookFromName(name, 0x3a8fd6));
    const rig = buildSteve(tex, mats);
    rig.root.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    /* poseSteve 가 rig.root 의 x · y 를 걸음 흔들림으로 덮어쓰므로 월드 위치는 바깥 그룹에 둔다 */
    const holder = new THREE.Group();
    holder.add(rig.root);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.nameTexture(name), depthTest: false, transparent: true }));
    tag.renderOrder = 40;
    const r: Remote = {
      id,
      name,
      root: holder,
      limbs: rig.limbs,
      mats,
      skin: tex,
      tag,
      to: new THREE.Vector3(),
      yaw: 0,
      yawTo: 0,
      pitch: 0,
      sneak: 0,
      sneakTo: 0,
      speed: 0,
      walk: 0,
      swingT: 0,
      seenAt: performance.now(),
    };
    this.sizeTag(r);
    this.group.add(holder, tag);
    this.list.set(id, r);
    if (skin) this.loadSkin(r, skin);
    return r;
  }

  private nameTexture(name: string) {
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    const font = `600 30px Galmuri11, Pretendard, "Apple SD Gothic Neo", sans-serif`;
    g.font = font;
    const w = Math.ceil(g.measureText(name).width) + 28;
    c.width = w;
    c.height = 44;
    g.font = font;
    g.fillStyle = "rgba(0,0,0,0.32)";
    g.beginPath();
    g.roundRect(0, 0, w, 44, 10);
    g.fill();
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(name, w / 2, 23);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.userData.w = w;
    return t;
  }

  private sizeTag(r: Remote) {
    const w = ((r.tag.material as THREE.SpriteMaterial).map?.userData.w as number) || 120;
    r.tag.scale.set((w / 44) * 0.32, 0.32, 1);
  }

  private setName(r: Remote, name: string) {
    r.name = name;
    const m = r.tag.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = this.nameTexture(name);
    m.needsUpdate = true;
    this.sizeTag(r);
  }

  private loadSkin(r: Remote, uuid: string) {
    if (!/^[0-9a-f]{32}$/.test(uuid)) return;
    r.skinId = uuid;
    new THREE.ImageLoader().load(`/api/world/skin?uuid=${uuid}`, (img) => {
      if (this.disposed || !this.list.has(r.id) || img.width !== 64 || (img.height !== 64 && img.height !== 32)) return;
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      c.getContext("2d")!.drawImage(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      r.skin.dispose();
      r.skin = tex;
      for (const m of r.mats) {
        m.map = tex;
        m.needsUpdate = true;
      }
    });
  }

  private free(r: Remote) {
    r.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
    for (const m of r.mats) m.dispose();
    r.skin.dispose();
    const tm = r.tag.material as THREE.SpriteMaterial;
    tm.map?.dispose();
    tm.dispose();
  }
}
