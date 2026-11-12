import * as THREE from "three";
import { BLOCKS, type BlockDef } from "@/lib/voxel/blocks";
import { T } from "@/lib/voxel/textures";
import type { Atlas } from "./atlas";

/** 블록을 캘 때 튀는 조각 (텍스처의 4×4 픽셀 조각) */

const MAX = 1500;

const VERT = /* glsl */ `
attribute vec4 aUv;
attribute vec3 aTint;
attribute float aSize;
uniform float uScale;
varying vec4 vUv;
varying vec3 vTint;
void main() {
  vUv = aUv;
  vTint = aTint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec4 vUv;
varying vec3 vTint;
void main() {
  vec4 tex = texture2D(uAtlas, vUv.xy + gl_PointCoord * vUv.zw);
  if (tex.a < 0.5) discard;
  gl_FragColor = vec4(tex.rgb * vTint, 1.0);
}
`;

type P = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; ground: boolean };

const GRASS = new THREE.Color(0x91bd59);
const FOLIAGE = new THREE.Color(0x77ab2f);

export class BlockParticles {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private pos = new Float32Array(MAX * 3);
  private uv = new Float32Array(MAX * 4);
  private tint = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;

  constructor(
    private atlas: Atlas,
    private solid: (x: number, y: number, z: number) => boolean,
  ) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aUv", new THREE.BufferAttribute(this.uv, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aTint", new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uAtlas: { value: atlas.texture }, uScale: { value: 500 } } });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  /** 화면 높이(px)와 세로 시야각으로 점 크기 배율을 맞춘다 */
  setViewport(heightPx: number, fovDeg: number) {
    this.mat.uniforms.uScale!.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  private tile(def: BlockDef) {
    if (def.key === "grass_block" || def.key === "grass_block_snow") return "dirt";
    return def.faces[0];
  }

  private add(def: BlockDef, x: number, y: number, z: number, vx: number, vy: number, vz: number, scale: number, bright: number) {
    if (this.ps.length >= MAX) return;
    const name = this.tile(def);
    const ti = this.atlas.tiles.get(name);
    if (ti === undefined) return;
    const i = this.ps.length;
    const [W, H] = this.atlas.size;
    const col = ti % this.atlas.cols;
    const row = Math.floor(ti / this.atlas.cols);
    const ox = Math.floor(Math.random() * (T - 4));
    const oy = Math.floor(Math.random() * (T - 4));
    this.uv.set([(col * T + ox) / W, (row * T + oy) / H, 4 / W, 4 / H], i * 4);
    const c = def.tint && !def.tintTop ? (def.tint === "grass" ? GRASS : FOLIAGE) : null;
    this.tint.set(c ? [c.r * bright, c.g * bright, c.b * bright] : [bright, bright, bright], i * 3);
    this.size[i] = (0.1 + Math.random() * 0.1) * scale;
    this.ps.push({ x, y, z, vx, vy, vz, life: Math.min(1.2, 4 / (Math.random() * 0.9 + 0.1) / 20), ground: false });
  }

  /** 부서질 때: 4×4×4 조각이 사방으로 */
  burst(id: number, bx: number, by: number, bz: number, bright: number) {
    const def = BLOCKS[id];
    if (!def || def.shape === "none" || def.liquid) return;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        for (let k = 0; k < 4; k++) {
          const dx = (i + 0.5) / 4;
          const dy = (j + 0.5) / 4;
          const dz = (k + 0.5) / 4;
          let vx = dx - 0.5 + (Math.random() * 2 - 1) * 0.4;
          let vy = dy - 0.5 + (Math.random() * 2 - 1) * 0.4;
          let vz = dz - 0.5 + (Math.random() * 2 - 1) * 0.4;
          const sp = ((Math.random() + Math.random() + 1) * 0.15 * 0.4 * 20) / Math.max(0.01, Math.hypot(vx, vy, vz));
          vx *= sp;
          vy = vy * sp + 2;
          vz *= sp;
          this.add(def, bx + dx, by + dy, bz + dz, vx, vy, vz, 1, bright);
        }
  }

  /** 캐는 중: 맞은 면에서 조각 하나 */
  crack(id: number, bx: number, by: number, bz: number, face: readonly [number, number, number], bright: number) {
    const def = BLOCKS[id];
    if (!def || def.shape === "none" || def.liquid) return;
    const e = 0.1;
    let x = bx + e + Math.random() * (1 - 2 * e);
    let y = by + e + Math.random() * (1 - 2 * e);
    let z = bz + e + Math.random() * (1 - 2 * e);
    if (face[0]) x = bx + (face[0] > 0 ? 1 + e : -e);
    if (face[1]) y = by + (face[1] > 0 ? 1 + e : -e);
    if (face[2]) z = bz + (face[2] > 0 ? 1 + e : -e);
    const r = () => (Math.random() * 2 - 1) * 0.4 * 4;
    this.add(def, x, y, z, r() * 0.2, (r() * 0.2 + 2) * 0.2 + 0.4, r() * 0.2, 0.6, bright);
  }

  update(dt: number) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        const last = ps.length - 1;
        if (i !== last) {
          ps[i] = ps[last]!;
          this.uv.copyWithin(i * 4, last * 4, last * 4 + 4);
          this.tint.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.size[i] = this.size[last]!;
        }
        ps.pop();
        continue;
      }
      p.vy -= 16 * dt;
      const drag = Math.pow(0.98, dt * 20);
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      const ny = p.y + p.vy * dt;
      if (p.vy < 0 && this.solid(Math.floor(p.x), Math.floor(ny - 0.02), Math.floor(p.z))) {
        p.y = Math.floor(ny - 0.02) + 1.02;
        p.vy = 0;
        p.ground = true;
      } else p.y = ny;
      if (p.ground) {
        const f = Math.pow(0.7, dt * 20);
        p.vx *= f;
        p.vz *= f;
      }
      const nx = p.x + p.vx * dt;
      if (!this.solid(Math.floor(nx), Math.floor(p.y), Math.floor(p.z))) p.x = nx;
      else p.vx = 0;
      const nz = p.z + p.vz * dt;
      if (!this.solid(Math.floor(p.x), Math.floor(p.y), Math.floor(nz))) p.z = nz;
      else p.vz = 0;
    }
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
    }
    this.geo.setDrawRange(0, ps.length);
    for (const k of ["position", "aUv", "aTint", "aSize"]) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
