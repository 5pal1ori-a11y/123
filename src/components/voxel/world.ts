import * as THREE from "three";
import { B, BLOCKS, type BlockDef } from "@/lib/voxel/blocks";
import { CS, H, idx, type ChunkData } from "@/lib/voxel/worldgen";
import { getAtlas, type Atlas } from "./atlas";
import { SHADOW_LAYER, shadowUniforms } from "./sun-shadow";

export type ChunkSource = {
  generate(cx: number, cz: number): ChunkData | null;
};

export type Chunk = ChunkData & {
  key: string;
  solid: THREE.Mesh | null;
  water: THREE.Mesh | null;
  dirty: boolean;
  sky: Uint8Array;
  blk: Uint8Array;
};

export const ckey = (cx: number, cz: number) => `${cx},${cz}`;

const OPAQUE = new Uint8Array(256);
const SOLID = new Uint8Array(256);
const EMIT = new Uint8Array(256);
/** 빛이 지나가며 더 줄어드는 블록 (잎 · 물) */
const DIM = new Uint8Array(256);
const SHAPE: BlockDef["shape"][] = [];
for (const b of BLOCKS) {
  OPAQUE[b.id] = b.opaque && b.shape === "cube" ? 1 : 0;
  SOLID[b.id] = b.solid ? 1 : 0;
  EMIT[b.id] = b.light ?? 0;
  DIM[b.id] = b.cutout || b.liquid ? 1 : 0;
  SHAPE[b.id] = b.shape;
}
DIM[B.ice] = 1;

export const isOpaque = (id: number) => OPAQUE[id] === 1;
export const isSolid = (id: number) => SOLID[id] === 1;

/* ───────────── 셰이더 ───────────── */

const VERT = /* glsl */ `
attribute vec2 aLight;
attribute vec4 aColor;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying vec2 vLight;
varying float vFog;
varying float vWave;
varying vec3 vWorld;
void main() {
  vec3 p = position / 16.0;
  vUv = uv;
  vColor = aColor.rgb;
  vLight = aLight;
  vWave = aColor.a;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  if (aColor.a > 0.5) {
    vec4 wp = modelMatrix * vec4(p, 1.0);
    mv.y += 0.0;
    mv.x += sin(uTime * 1.6 + wp.x * 0.7 + wp.z * 0.5) * 0.03 * (aColor.a - 0.5) * 2.0;
  }
  vFog = length(mv.xyz);
  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uDaylight;
uniform float uMinLight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
uniform float uCutout;
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowStr;
uniform float uShadowBias;
uniform float uShadowTexel;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec3 vColor;
varying vec2 vLight;
varying float vFog;
varying float vWave;
varying vec3 vWorld;

// 0 = 햇빛, 1 = 그림자 (태양 반대쪽 면 + 그림자 맵)
float sunShadow() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
  float facing = smoothstep(0.0, 0.18, dot(n, uSunDir));
  vec4 sc = uShadowMatrix * vec4(vWorld + n * 0.06, 1.0);
  vec3 c = sc.xyz / sc.w;
  vec2 e = abs(c.xy - 0.5) * 2.0;
  float edge = smoothstep(0.82, 1.0, max(e.x, e.y));
  float lit = 1.0;
  if (edge < 1.0 && c.z < 1.0) {
    float z = c.z - uShadowBias;
    float t = uShadowTexel;
    float s = texture(uShadowMap, vec3(c.xy, z));
    s += texture(uShadowMap, vec3(c.xy + vec2(t, t), z));
    s += texture(uShadowMap, vec3(c.xy + vec2(-t, t), z));
    s += texture(uShadowMap, vec3(c.xy + vec2(t, -t), z));
    s += texture(uShadowMap, vec3(c.xy + vec2(-t, -t), z));
    lit = mix(s / 5.0, 1.0, edge);
  }
  return 1.0 - min(lit, facing);
}

void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  if (tex.a < uCutout) discard;
  float sky = vLight.x * uDaylight;
  float blk = vLight.y;
  float l = max(sky, blk);
  // 마인크래프트 라이트맵 곡선 + 밝기 설정 60%
  float f = l / (4.0 - 3.0 * l);
  float bright = mix(f, 1.0 - pow(1.0 - f, 4.0), 0.6);
  if (uShadowStr > 0.0 && vLight.x > 0.2) {
    float shade = sunShadow() * uShadowStr * smoothstep(0.2, 0.9, vLight.x) * (1.0 - blk);
    bright *= 1.0 - shade;
  }
  bright = max(bright, uMinLight);
  vec3 warm = vec3(1.0, 0.93, 0.82);
  vec3 lightCol = mix(vec3(1.0), warm, clamp(blk - sky, 0.0, 1.0) * 0.6);
  vec3 col = tex.rgb * vColor * bright * lightCol;
  float fog = smoothstep(uFogNear, uFogFar, vFog);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, uAlpha < 1.0 ? uAlpha : 1.0);
}
`;

export function makeMaterials(atlas: Atlas) {
  const uniforms = {
    uAtlas: { value: atlas.texture },
    uDaylight: { value: 1 },
    uMinLight: { value: 0.04 },
    uFogColor: { value: new THREE.Color(0x9fc7ff) },
    uFogNear: { value: 60 },
    uFogFar: { value: 90 },
    uTime: { value: 0 },
    ...shadowUniforms(),
  };
  const solid = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...uniforms, uAlpha: { value: 1 }, uCutout: { value: 0.5 } },
  });
  const water = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { ...uniforms, uAlpha: { value: 0.72 }, uCutout: { value: 0.01 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { solid, water, uniforms };
}

/* ───────────── 메시 빌더 ───────────── */

class Buf {
  pos = new Int16Array(4096 * 3);
  uv = new Uint16Array(4096 * 2);
  col = new Uint8Array(4096 * 4);
  light = new Uint8Array(4096 * 2);
  index = new Uint32Array(6144);
  n = 0;
  ni = 0;

  reset() {
    this.n = 0;
    this.ni = 0;
  }

  private grow() {
    const g = <A extends Int16Array | Uint16Array | Uint8Array | Uint32Array>(a: A, f: number) => {
      const b = new (a.constructor as new (n: number) => A)(a.length * 2);
      b.set(a);
      void f;
      return b;
    };
    this.pos = g(this.pos, 3);
    this.uv = g(this.uv, 2);
    this.col = g(this.col, 4);
    this.light = g(this.light, 2);
  }

  vert(x: number, y: number, z: number, u: number, v: number, r: number, gg: number, b: number, a: number, sky: number, blk: number) {
    if ((this.n + 1) * 3 > this.pos.length) this.grow();
    const i = this.n;
    this.pos[i * 3] = Math.round(x * 16);
    this.pos[i * 3 + 1] = Math.round(y * 16);
    this.pos[i * 3 + 2] = Math.round(z * 16);
    this.uv[i * 2] = Math.round(u * 65535);
    this.uv[i * 2 + 1] = Math.round(v * 65535);
    this.col[i * 4] = Math.min(255, r * 255);
    this.col[i * 4 + 1] = Math.min(255, gg * 255);
    this.col[i * 4 + 2] = Math.min(255, b * 255);
    this.col[i * 4 + 3] = a * 255;
    this.light[i * 2] = sky * 17;
    this.light[i * 2 + 1] = blk * 17;
    this.n++;
    return i;
  }

  quad(flip: boolean) {
    if (this.ni + 6 > this.index.length) {
      const b = new Uint32Array(this.index.length * 2);
      b.set(this.index);
      this.index = b;
    }
    const s = this.n - 4;
    const I = this.index;
    if (!flip) {
      I[this.ni++] = s;
      I[this.ni++] = s + 1;
      I[this.ni++] = s + 2;
      I[this.ni++] = s;
      I[this.ni++] = s + 2;
      I[this.ni++] = s + 3;
    } else {
      I[this.ni++] = s + 1;
      I[this.ni++] = s + 2;
      I[this.ni++] = s + 3;
      I[this.ni++] = s + 1;
      I[this.ni++] = s + 3;
      I[this.ni++] = s;
    }
  }

  geometry(minY: number, maxY: number): THREE.BufferGeometry | null {
    if (!this.ni) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos.slice(0, this.n * 3), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(this.uv.slice(0, this.n * 2), 2, true));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col.slice(0, this.n * 4), 4, true));
    g.setAttribute("aLight", new THREE.BufferAttribute(this.light.slice(0, this.n * 2), 2, true));
    g.setIndex(new THREE.BufferAttribute(this.n > 65535 ? this.index.slice(0, this.ni) : Uint16Array.from(this.index.subarray(0, this.ni)), 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, minY, 0), new THREE.Vector3(CS, maxY + 1, CS));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return g;
  }
}

/** 면 방향: +x −x +y −y +z −z */
const DIRS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
/** 면의 네 꼭짓점 (왼아래 → 오른아래 → 오른위 → 왼위, 바깥에서 볼 때 반시계) */
const CORNERS: [number, number, number][][] = [
  [
    [1, 0, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 1],
    [1, 1, 1],
    [1, 1, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
  ],
];
const FACE_SHADE = [0.6, 0.6, 1, 0.5, 0.8, 0.8];
const AO_CURVE = [1, 0.82, 0.68, 0.52];
const FACING_FACE = [4, 5, 0, 1];

export class VoxelWorld {
  readonly chunks = new Map<string, Chunk>();
  readonly atlas: Atlas;
  /** 플레이어가 바꾼 블록 (저장용) — 청크 키 → (칸 → id | meta<<8) */
  readonly edits = new Map<string, Map<number, number>>();
  /** 기록되는 편집마다 불린다 (멀티 야생에서 서버로 보낸다) — 값은 id | meta<<8 */
  onRecord: ((x: number, y: number, z: number, v: number) => void) | null = null;
  private buf = new Buf();
  private wbuf = new Buf();
  private tileUv: Float32Array;
  private faceTile: Int16Array;

  constructor(
    private source: ChunkSource,
    readonly group: THREE.Group,
    readonly mats: ReturnType<typeof makeMaterials>,
    /** 범위 밖은 공기 대신 이 블록 (광산 벽) */
    private outside: number = 0,
  ) {
    this.atlas = getAtlas();
    const { tiles, cols, rows, size } = this.atlas;
    this.tileUv = new Float32Array(tiles.size * 4);
    for (const [, i] of tiles) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const e = 0.02;
      this.tileUv[i * 4] = (c * 16 + e) / size[0];
      this.tileUv[i * 4 + 1] = (r * 16 + e) / size[1];
      this.tileUv[i * 4 + 2] = ((c + 1) * 16 - e) / size[0];
      this.tileUv[i * 4 + 3] = ((r + 1) * 16 - e) / size[1];
    }
    void rows;
    this.faceTile = new Int16Array(BLOCKS.length * 6);
    for (const b of BLOCKS) for (let f = 0; f < 6; f++) this.faceTile[b.id * 6 + f] = tiles.get(b.faces[f]) ?? 0;
  }

  tile(name: string) {
    return this.atlas.tiles.get(name) ?? 0;
  }

  chunkAt(x: number, z: number) {
    return this.chunks.get(ckey(Math.floor(x / CS), Math.floor(z / CS)));
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= H) return y < 0 ? B.bedrock : 0;
    const c = this.chunks.get(ckey(Math.floor(x / CS), Math.floor(z / CS)));
    if (!c) return this.outside;
    return c.blocks[idx(x & 15, y, z & 15)]!;
  }

  getMeta(x: number, y: number, z: number): number {
    if (y < 0 || y >= H) return 0;
    const c = this.chunks.get(ckey(Math.floor(x / CS), Math.floor(z / CS)));
    return c ? c.meta[idx(x & 15, y, z & 15)]! : 0;
  }

  lightAt(x: number, y: number, z: number): [number, number] {
    if (y >= H) return [15, 0];
    if (y < 0) return [0, 0];
    const c = this.chunks.get(ckey(Math.floor(x / CS), Math.floor(z / CS)));
    if (!c) return [15, 0];
    const i = idx(x & 15, y, z & 15);
    return [c.sky[i]!, c.blk[i]!];
  }

  /** 블록을 바꾸고 다시 그릴 청크를 표시한다. record=false 면 저장 기록에 남기지 않음 */
  set(x: number, y: number, z: number, id: number, meta = 0, record = true) {
    if (y < 0 || y >= H) return false;
    const cx = Math.floor(x / CS);
    const cz = Math.floor(z / CS);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c) return false;
    const lx = x & 15;
    const lz = z & 15;
    const i = idx(lx, y, lz);
    const before = c.blocks[i]!;
    c.blocks[i] = id;
    c.meta[i] = meta;
    if (record) {
      let m = this.edits.get(c.key);
      if (!m) this.edits.set(c.key, (m = new Map()));
      m.set(i, id | (meta << 8));
      this.onRecord?.(x, y, z, id | (meta << 8));
    }
    const lightChanged = OPAQUE[before] !== OPAQUE[id] || EMIT[before] !== EMIT[id] || DIM[before] !== DIM[id];
    c.dirty = true;
    const r = lightChanged ? 1 : 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const near = (dx === -1 ? lx === 0 : dx === 1 ? lx === 15 : true) && (dz === -1 ? lz === 0 : dz === 1 ? lz === 15 : true);
        if (!near && !r) continue;
        const n = this.chunks.get(ckey(cx + dx, cz + dz));
        if (n) n.dirty = true;
      }
    return true;
  }

  /** 청크를 만들어 (저장된 편집을 덮어) 넣는다 */
  load(cx: number, cz: number, saved?: Map<number, number>) {
    const key = ckey(cx, cz);
    if (this.chunks.has(key)) return this.chunks.get(key)!;
    const data = this.source.generate(cx, cz);
    if (!data) {
      this.voids.add(key);
      return null;
    }
    const c: Chunk = {
      ...data,
      key,
      solid: null,
      water: null,
      dirty: true,
      sky: new Uint8Array(CS * CS * H),
      blk: new Uint8Array(CS * CS * H),
    };
    if (saved) {
      this.edits.set(key, saved);
      for (const [i, v] of saved) {
        c.blocks[i] = v & 0xff;
        c.meta[i] = v >> 8;
      }
    }
    this.chunks.set(key, c);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.chunks.get(ckey(cx + dx, cz + dz));
        if (n) n.dirty = true;
      }
    return c;
  }

  unload(key: string) {
    const c = this.chunks.get(key);
    if (!c) return;
    this.disposeMeshes(c);
    this.chunks.delete(key);
  }

  private disposeMeshes(c: Chunk) {
    for (const m of [c.solid, c.water]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    c.solid = null;
    c.water = null;
  }

  /** 소스가 만들지 않는 청크 (광산 바깥) — 이웃 검사에서는 outside 블록으로 꽉 찬 청크로 본다 */
  private voids = new Set<string>();

  isVoid(cx: number, cz: number) {
    return this.voids.has(ckey(cx, cz));
  }

  hasNeighbors(cx: number, cz: number) {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = ckey(cx + dx, cz + dz);
        if (!this.chunks.has(k) && !this.voids.has(k)) return false;
      }
    return true;
  }

  /* ───────────── 빛 + 메시 ───────────── */

  rebuild(c: Chunk) {
    const P = 7;
    const W = CS + P * 2;
    const N = W * W * H;
    const ids = new Uint8Array(N);
    const metas = new Uint8Array(N);
    const sky = new Uint8Array(N);
    const blk = new Uint8Array(N);
    const tops = new Int16Array(W * W);
    const L = (x: number, y: number, z: number) => (y * W + (z + P)) * W + (x + P);
    const bx = c.cx * CS;
    const bz = c.cz * CS;

    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.chunks.get(ckey(c.cx + dx, c.cz + dz));
        const x0 = Math.max(-P, dx * CS);
        const x1 = Math.min(CS + P, dx * CS + CS);
        const z0 = Math.max(-P, dz * CS);
        const z1 = Math.min(CS + P, dz * CS + CS);
        for (let z = z0; z < z1; z++)
          for (let x = x0; x < x1; x++) {
            const lx = x - dx * CS;
            const lz = z - dz * CS;
            for (let y = 0; y < H; y++) {
              const t = L(x, y, z);
              if (n) {
                const s = idx(lx, y, lz);
                ids[t] = n.blocks[s]!;
                metas[t] = n.meta[s]!;
              } else ids[t] = this.outside;
            }
          }
      }

    /* 하늘빛: 가장 높은 막힌 칸 위는 15, 나머지는 퍼뜨린다 */
    let minTop = H;
    let maxTop = 0;
    for (let z = -P; z < CS + P; z++)
      for (let x = -P; x < CS + P; x++) {
        let y = H - 1;
        let level = 15;
        for (; y >= 0; y--) {
          const id = ids[L(x, y, z)]!;
          if (OPAQUE[id]) break;
          if (DIM[id]) level--;
          if (level <= 0) break;
          sky[L(x, y, z)] = level;
        }
        const top = y;
        tops[(z + P) * W + (x + P)] = top;
        minTop = Math.min(minTop, top);
        maxTop = Math.max(maxTop, top);
      }
    const QN = N;
    const queue = new Int32Array(QN);
    let qh = 0;
    let qt = 0;
    let qn = 0;
    const push = (t: number) => {
      if (qn >= QN) return;
      queue[qt] = t;
      qt = qt + 1 === QN ? 0 : qt + 1;
      qn++;
    };
    for (let z = -P; z < CS + P; z++)
      for (let x = -P; x < CS + P; x++)
        for (let y = Math.max(0, minTop - 1); y <= Math.min(H - 1, maxTop + 1); y++) {
          const t = L(x, y, z);
          if (sky[t]! > 1) push(t);
        }
    const WW = W * W;
    const visit = (light: Uint8Array, n: number, nl: number) => {
      if (OPAQUE[ids[n]!] || nl <= light[n]!) return;
      light[n] = nl;
      push(n);
    };
    const spread = (light: Uint8Array) => {
      while (qn > 0) {
        const t = queue[qh]!;
        qh = qh + 1 === QN ? 0 : qh + 1;
        qn--;
        const lv = light[t]!;
        if (lv <= 1) continue;
        const nl = lv - 1;
        const y = (t / WW) | 0;
        const rem = t - y * WW;
        const z = (rem / W) | 0;
        const x = rem - z * W;
        if (x > 0) visit(light, t - 1, nl);
        if (x < W - 1) visit(light, t + 1, nl);
        if (z > 0) visit(light, t - W, nl);
        if (z < W - 1) visit(light, t + W, nl);
        if (y > 0) visit(light, t - WW, nl);
        if (y < H - 1) visit(light, t + WW, nl);
      }
    };
    spread(sky);

    qh = 0;
    qt = 0;
    qn = 0;
    for (let t = 0; t < N; t++) {
      const e = EMIT[ids[t]!]!;
      if (e) {
        blk[t] = e;
        push(t);
      }
    }
    spread(blk);

    for (let y = 0; y < H; y++)
      for (let z = 0; z < CS; z++)
        for (let x = 0; x < CS; x++) {
          const t = L(x, y, z);
          const i = idx(x, y, z);
          c.sky[i] = sky[t]!;
          c.blk[i] = blk[t]!;
        }

    /* 메시 */
    const buf = this.buf;
    const wbuf = this.wbuf;
    buf.reset();
    wbuf.reset();
    let minY = H;
    let maxY = 0;
    const tu = this.tileUv;
    const ft = this.faceTile;

    const lightOf = (x: number, y: number, z: number): [number, number] => {
      if (y >= H) return [15, 0];
      if (y < 0) return [0, 0];
      const t = L(x, y, z);
      return [sky[t]!, blk[t]!];
    };
    const opaqueAt = (x: number, y: number, z: number) => (y < 0 ? true : y >= H ? false : OPAQUE[ids[L(x, y, z)]!] === 1);

    const tintOf = (def: BlockDef, x: number, z: number, face: number): [number, number, number] => {
      if (!def.tint || (def.tintTop && face !== 2)) return [1, 1, 1];
      const col = def.tint === "grass" ? c.grass[(z << 4) | x]! : c.foliage[(z << 4) | x]!;
      return [((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255];
    };

    const cubeFace = (b: Buf, x: number, y: number, z: number, f: number, tile: number, tint: [number, number, number], y0 = 0, y1 = 1, inset = 0, rot = 0, wave = 0) => {
      const [nx, ny, nz] = DIRS[f]!;
      const corners = CORNERS[f]!;
      const u0 = tu[tile * 4]!;
      const v0 = tu[tile * 4 + 1]!;
      const u1 = tu[tile * 4 + 2]!;
      const v1 = tu[tile * 4 + 3]!;
      const vh = v1 - v0;
      const shade = FACE_SHADE[f]!;
      const ao: number[] = [];
      for (let k = 0; k < 4; k++) {
        const [cx, cy, cz] = corners[k]!;
        // 이 꼭짓점에 닿는 면 앞쪽 세 칸으로 그늘 (AO) 과 부드러운 빛을 낸다
        const fx = x + nx;
        const fy = y + ny;
        const fz = z + nz;
        const s1: [number, number, number] = nx !== 0 ? [0, cy ? 1 : -1, 0] : [cx ? 1 : -1, 0, 0];
        const s2: [number, number, number] = nz !== 0 ? [0, cy ? 1 : -1, 0] : nx !== 0 ? [0, 0, cz ? 1 : -1] : [0, 0, cz ? 1 : -1];
        const a = opaqueAt(fx + s1[0], fy + s1[1], fz + s1[2]);
        const bb = opaqueAt(fx + s2[0], fy + s2[1], fz + s2[2]);
        const cc = a && bb ? true : opaqueAt(fx + s1[0] + s2[0], fy + s1[1] + s2[1], fz + s1[2] + s2[2]);
        const occ = a && bb ? 3 : (a ? 1 : 0) + (bb ? 1 : 0) + (cc ? 1 : 0);
        ao.push(occ);
        let ss = 0;
        let sb = 0;
        let cnt = 0;
        const addL = (px: number, py: number, pz: number) => {
          const [l1, l2] = lightOf(px, py, pz);
          ss += l1;
          sb += l2;
          cnt++;
        };
        addL(fx, fy, fz);
        if (!a) addL(fx + s1[0], fy + s1[1], fz + s1[2]);
        if (!bb) addL(fx + s2[0], fy + s2[1], fz + s2[2]);
        if (!cc && !(a && bb)) addL(fx + s1[0] + s2[0], fy + s1[1] + s2[1], fz + s1[2] + s2[2]);
        const sk = ss / cnt;
        const bl = sb / cnt;
        let px = x + cx;
        const py = y + (cy ? y1 : y0);
        let pz = z + cz;
        if (inset) {
          if (f === 0) px -= inset;
          if (f === 1) px += inset;
          if (f === 4) pz -= inset;
          if (f === 5) pz += inset;
        }
        let u = k === 0 || k === 3 ? u0 : u1;
        let v = k === 0 || k === 1 ? v1 : v1 - vh * (f === 2 || f === 3 ? 1 : y1 - y0);
        if (f !== 2 && f !== 3 && y0 > 0) v = k === 0 || k === 1 ? v1 - vh * y0 : v1 - vh * y1;
        if (rot) {
          const uu = k === 0 || k === 1 ? u0 : u1;
          const vv = k === 0 || k === 3 ? v1 : v0;
          u = uu;
          v = vv;
        }
        const s = shade * AO_CURVE[occ]!;
        b.vert(px, py, pz, u, v, tint[0] * s, tint[1] * s, tint[2] * s, wave, sk, bl);
      }
      b.quad(ao[0]! + ao[2]! > ao[1]! + ao[3]!);
    };

    const crossQuads = (b: Buf, x: number, y: number, z: number, tile: number, tint: [number, number, number], lt: [number, number], wave: number, pairs: [number, number, number, number][]) => {
      const u0 = tu[tile * 4]!;
      const v0 = tu[tile * 4 + 1]!;
      const u1 = tu[tile * 4 + 2]!;
      const v1 = tu[tile * 4 + 3]!;
      for (const [ax, az, bx2, bz2] of pairs) {
        for (const back of [false, true]) {
          const p = back ? [bx2, bz2, ax, az] : [ax, az, bx2, bz2];
          b.vert(x + p[0]!, y, z + p[1]!, u0, v1, tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9, 0, lt[0], lt[1]);
          b.vert(x + p[2]!, y, z + p[3]!, u1, v1, tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9, 0, lt[0], lt[1]);
          b.vert(x + p[2]!, y + 1, z + p[3]!, u1, v0, tint[0], tint[1], tint[2], wave, lt[0], lt[1]);
          b.vert(x + p[0]!, y + 1, z + p[1]!, u0, v0, tint[0], tint[1], tint[2], wave, lt[0], lt[1]);
          b.quad(false);
        }
      }
    };

    const torch = (b: Buf, x: number, y: number, z: number, meta: number, lt: [number, number]) => {
      const tile = this.tile("torch");
      const u0 = tu[tile * 4]!;
      const v0 = tu[tile * 4 + 1]!;
      const du = (tu[tile * 4 + 2]! - u0) / 16;
      const dv = (tu[tile * 4 + 3]! - v0) / 16;
      const w = 1 / 16;
      let ox = 0.5;
      let oz = 0.5;
      let tx = 0;
      let tz = 0;
      let oy = 0;
      if (meta >= 1 && meta <= 4) {
        const [ddx, ddz] = [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ][meta - 1]!;
        ox -= ddx * 0.32;
        oz -= ddz * 0.32;
        tx = ddx * 0.25;
        tz = ddz * 0.25;
        oy = 0.2;
      }
      const at = (px: number, py: number, pz: number): [number, number, number] => [x + ox + px + tx * py, y + oy + py, z + oz + pz + tz * py];
      const face = (pts: [number, number, number][], us: [number, number, number, number], sh: number) => {
        const [a0, a1, b0, b1] = us;
        const uvs = [
          [a0, b1],
          [a1, b1],
          [a1, b0],
          [a0, b0],
        ];
        pts.forEach((p, k) => b.vert(p[0], p[1], p[2], u0 + uvs[k]![0]! * du, v0 + uvs[k]![1]! * dv, sh, sh, sh, 0, lt[0], Math.max(lt[1], 14)));
        b.quad(false);
      };
      const hgt = 10 / 16;
      const side: [number, number, number, number] = [7, 9, 6, 16];
      face([at(w, 0, w), at(w, 0, -w), at(w, hgt, -w), at(w, hgt, w)], side, 0.8);
      face([at(-w, 0, -w), at(-w, 0, w), at(-w, hgt, w), at(-w, hgt, -w)], side, 0.8);
      face([at(-w, 0, w), at(w, 0, w), at(w, hgt, w), at(-w, hgt, w)], side, 0.9);
      face([at(w, 0, -w), at(-w, 0, -w), at(-w, hgt, -w), at(w, hgt, -w)], side, 0.9);
      face([at(-w, hgt, w), at(w, hgt, w), at(w, hgt, -w), at(-w, hgt, -w)], [7, 9, 4, 6], 1);
    };

    for (let y = 0; y < H; y++)
      for (let z = 0; z < CS; z++)
        for (let x = 0; x < CS; x++) {
          const t = L(x, y, z);
          const id = ids[t]!;
          if (!id) continue;
          const def = BLOCKS[id]!;
          const shape = def.shape;
          const meta = metas[t]!;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (shape === "cube" || shape === "farmland" || shape === "cactus") {
            for (let f = 0; f < 6; f++) {
              const [nx, ny, nz] = DIRS[f]!;
              const ny2 = y + ny;
              const nid = ny2 < 0 || ny2 >= H ? 0 : ids[L(x + nx, ny2, z + nz)]!;
              if (shape === "cube") {
                if (OPAQUE[nid]) continue;
                if (nid === id && (def.cutout || !def.opaque)) continue;
              } else if (shape === "farmland" && f === 3 && OPAQUE[nid]) continue;
              if (shape === "cactus" && (f === 2 || f === 3) && nid === id) continue;
              let tile: number;
              let rot = 0;
              if (def.axis && meta) {
                const axisFaces = meta === 1 ? [0, 1] : [4, 5];
                if (axisFaces.includes(f)) tile = ft[id * 6 + 2]!;
                else tile = ft[id * 6]!;
                rot = f === 2 || f === 3 ? (meta === 1 ? 1 : 0) : 1;
                if (meta === 2 && (f === 2 || f === 3)) rot = 0;
              } else if (def.facing && f !== 2 && f !== 3) {
                tile = f === FACING_FACE[meta & 3] ? ft[id * 6 + 4]! : ft[id * 6]!;
              } else tile = ft[id * 6 + f]!;
              const y1 = shape === "farmland" ? 15 / 16 : 1;
              const inset = shape === "cactus" ? 1 / 16 : 0;
              cubeFace(buf, x, y, z, f, tile, tintOf(def, x, z, f), 0, y1, inset, rot);
            }
          } else if (shape === "cross") {
            const lt = lightOf(x, y, z);
            crossQuads(buf, x, y, z, ft[id * 6]!, tintOf(def, x, z, 0), lt, def.tint ? 0.75 : 0.6, [
              [0.15, 0.15, 0.85, 0.85],
              [0.15, 0.85, 0.85, 0.15],
            ]);
          } else if (shape === "crop") {
            const lt = lightOf(x, y, z);
            const tile = this.tile(`wheat_stage${Math.min(7, meta)}`);
            crossQuads(buf, x, y - 1 / 16, z, tile, [1, 1, 1], lt, 0.6, [
              [0.25, 0, 0.25, 1],
              [0.75, 1, 0.75, 0],
              [0, 0.75, 1, 0.75],
              [1, 0.25, 0, 0.25],
            ]);
          } else if (shape === "torch") {
            torch(buf, x, y, z, meta, lightOf(x, y, z));
          } else if (shape === "ladder") {
            const w = 1 / 16;
            const pair: [number, number, number, number] = [
              [0, w, 1, w],
              [0, 1 - w, 1, 1 - w],
              [w, 0, w, 1],
              [1 - w, 0, 1 - w, 1],
            ][Math.max(0, Math.min(3, (meta & 7) - 1))] as [number, number, number, number];
            crossQuads(buf, x, y, z, ft[id * 6]!, [1, 1, 1], lightOf(x, y, z), 0, [pair]);
          } else if (shape === "layer") {
            const h = ((meta & 7) + 1) * (2 / 16);
            for (let f = 0; f < 6; f++) {
              const [nx, ny, nz] = DIRS[f]!;
              if (f !== 2) {
                const nid = ids[L(x + nx, y + ny, z + nz)] ?? 0;
                if (OPAQUE[nid]) continue;
              }
              cubeFace(buf, x, y, z, f, ft[id * 6 + f]!, [1, 1, 1], 0, h);
            }
          } else if (shape === "liquid") {
            const isLava = def.liquid === "lava";
            const above = y + 1 < H ? ids[L(x, y + 1, z)]! : 0;
            const level = meta & 7;
            const top = above === id ? 1 : Math.max(0.12, (8 - level) / 9) * (15 / 16) + (level === 0 ? 0.05 : 0);
            const target = isLava ? buf : wbuf;
            const tile = ft[id * 6]!;
            const col = c.biomes[(z << 4) | x];
            void col;
            const tint: [number, number, number] = isLava ? [1, 1, 1] : [0.25, 0.45, 0.95];
            for (let f = 0; f < 6; f++) {
              const [nx, ny, nz] = DIRS[f]!;
              const ny2 = y + ny;
              const nid = ny2 < 0 || ny2 >= H ? 0 : ids[L(x + nx, ny2, z + nz)]!;
              if (nid === id || (BLOCKS[nid]?.liquid && f !== 2)) continue;
              if (OPAQUE[nid]) continue;
              if (f === 2 && nid === B.ice) continue;
              cubeFace(target, x, y, z, f, tile, tint, 0, top, 0, 0, 0);
            }
          }
        }

    this.disposeMeshes(c);
    if (minY > maxY) {
      minY = 0;
      maxY = 0;
    }
    const sg = buf.geometry(minY, maxY);
    if (sg) {
      c.solid = new THREE.Mesh(sg, this.mats.solid);
      c.solid.position.set(bx, 0, bz);
      c.solid.matrixAutoUpdate = false;
      c.solid.updateMatrix();
      c.solid.layers.enable(SHADOW_LAYER);
      this.group.add(c.solid);
    }
    const wg = wbuf.geometry(minY, maxY);
    if (wg) {
      c.water = new THREE.Mesh(wg, this.mats.water);
      c.water.position.set(bx, 0, bz);
      c.water.matrixAutoUpdate = false;
      c.water.updateMatrix();
      c.water.renderOrder = 2;
      this.group.add(c.water);
    }
    c.dirty = false;
  }

  /** 시선 → 처음 닿는 블록 (DDA) */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, hitLiquid = false) {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / dx);
    const tdy = Math.abs(1 / dy);
    const tdz = Math.abs(1 / dz);
    let tmx = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tdx;
    let tmy = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tdy;
    let tmz = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tdz;
    let face: [number, number, number] = [0, 0, 0];
    let t = 0;
    while (t <= max) {
      const id = this.get(x, y, z);
      if (id && (BLOCKS[id]!.shape !== "liquid" || hitLiquid)) {
        if (this.hitShape(id, this.getMeta(x, y, z), ox + dx * t - x, oy + dy * t - y, oz + dz * t - z, dx, dy, dz))
          return { x, y, z, id, face, dist: t };
      }
      if (tmx < tmy && tmx < tmz) {
        x += sx;
        t = tmx;
        tmx += tdx;
        face = [-sx, 0, 0];
      } else if (tmy < tmz) {
        y += sy;
        t = tmy;
        tmy += tdy;
        face = [0, -sy, 0];
      } else {
        z += sz;
        t = tmz;
        tmz += tdz;
        face = [0, 0, -sz];
      }
    }
    return null;
  }

  /** 꽉 차지 않은 블록(횃불 · 풀 · 눈)은 실제 모양 안을 지날 때만 맞은 것으로 친다 */
  private hitShape(id: number, meta: number, lx: number, ly: number, lz: number, dx: number, dy: number, dz: number) {
    const s = SHAPE[id];
    if (s === "cube" || s === "liquid" || s === "farmland" || s === "cactus" || s === "ladder") return true;
    const box = s === "layer" ? [0, 0, 0, 1, ((meta & 7) + 1) / 8, 1] : s === "torch" ? [0.35, 0, 0.35, 0.65, 0.7, 0.65] : [0.15, 0, 0.15, 0.85, 0.85, 0.85];
    if (s === "torch" && meta >= 1) return true;
    let t0 = 0;
    let t1 = 2;
    const o = [lx, ly, lz];
    const d = [dx, dy, dz];
    for (let a = 0; a < 3; a++) {
      const lo = box[a]!;
      const hi = box[a + 3]!;
      if (Math.abs(d[a]!) < 1e-9) {
        if (o[a]! < lo || o[a]! > hi) return false;
      } else {
        let ta = (lo - o[a]!) / d[a]!;
        let tb = (hi - o[a]!) / d[a]!;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) return false;
      }
    }
    return true;
  }

  dispose() {
    for (const k of [...this.chunks.keys()]) this.unload(k);
  }
}
