/**
 * 광산존 — 날마다 바뀌는 광산과 목표 광물. 서버가 캔 좌표를 칸 하나씩 검증할 수 있도록
 * 모든 칸을 (전체 생성 없이) block(x, y, z) 하나로 계산한다.
 */

import { B, bid, ORE_INFO, ORE_KEYS, type OreKey } from "./blocks";
import { hash3, hashString, mulberry32, Simplex } from "./noise";

export const MINE_W = 64;
export const MINE_H = 48;
export const MINE_D = 64;
export const MINE_DEEP = 22;
export const MINE_SPAWN = { x: 32.5, y: 40, z: 32.5 };

/** 하루 목표 개수 (광석 블록 수) */
export const MINE_NEED: Record<OreKey, number> = {
  coal: 24,
  iron: 16,
  copper: 16,
  gold: 10,
  redstone: 12,
  lapis: 10,
  emerald: 6,
  diamond: 8,
};

export const MINE_TOKENS = 5;

export function mineOfDay(day: string) {
  const seed = hashString(`does-mine:${day}`);
  const ore = ORE_KEYS[seed % ORE_KEYS.length]!;
  return { day, seed, ore, need: MINE_NEED[ore], name: ORE_INFO[ore].name };
}

/** 광맥 수 · 높이 범위 */
const VEINS: Record<OreKey, { n: number; y0: number; y1: number; r: number }> = {
  coal: { n: 70, y0: 8, y1: 38, r: 1.7 },
  iron: { n: 52, y0: 3, y1: 38, r: 1.5 },
  copper: { n: 44, y0: 10, y1: 38, r: 1.6 },
  gold: { n: 30, y0: 2, y1: 26, r: 1.4 },
  redstone: { n: 30, y0: 2, y1: 18, r: 1.4 },
  lapis: { n: 26, y0: 2, y1: 30, r: 1.35 },
  emerald: { n: 22, y0: 4, y1: 38, r: 1.0 },
  diamond: { n: 26, y0: 2, y1: 16, r: 1.25 },
};

type Vein = { x: number; y: number; z: number; r: number; ore: OreKey };

const G = 8;

const ROOM = 4;

const RING: [number, number][] = (() => {
  const r: [number, number][] = [];
  for (let i = -3; i < 3; i++) r.push([i, -3]);
  for (let i = -3; i < 3; i++) r.push([3, i]);
  for (let i = 3; i > -3; i--) r.push([i, 3]);
  for (let i = 3; i > -3; i--) r.push([-3, i]);
  return r;
})();

export class MineGen {
  readonly seed: number;
  private grid = new Map<number, Vein[]>();
  private nA: Simplex;
  private nB: Simplex;
  private nC: Simplex;
  private nP: Simplex;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.nA = new Simplex(this.seed ^ 0x1111);
    this.nB = new Simplex(this.seed ^ 0x2222);
    this.nC = new Simplex(this.seed ^ 0x3333);
    this.nP = new Simplex(this.seed ^ 0x4444);
    const rnd = mulberry32(this.seed ^ 0x0e0e);
    for (const ore of ORE_KEYS) {
      const v = VEINS[ore];
      for (let i = 0; i < v.n; i++) {
        const vein: Vein = {
          x: 2 + rnd() * (MINE_W - 4),
          y: v.y0 + rnd() * (v.y1 - v.y0),
          z: 2 + rnd() * (MINE_D - 4),
          r: v.r * (0.75 + rnd() * 0.5),
          ore,
        };
        const key = this.gkey(Math.floor(vein.x / G), Math.floor(vein.y / G), Math.floor(vein.z / G));
        const list = this.grid.get(key);
        if (list) list.push(vein);
        else this.grid.set(key, [vein]);
      }
    }
  }

  private gkey(gx: number, gy: number, gz: number) {
    return (gx + 4) * 4096 + (gy + 4) * 64 + (gz + 4);
  }

  /** 계단 · 시작 방 */
  private carvedStatic(x: number, y: number, z: number) {
    const cx = 32;
    const cz = 32;
    if (Math.abs(x - cx) <= ROOM && Math.abs(z - cz) <= ROOM && y >= 40 && y <= 44) return true;
    // 시작 방에서 아래로 도는 나선 계단: s 번째 계단은 바닥이 y=39−s, 머리 위 두 칸까지 비운다
    if (y < 40 && y >= 4) {
      for (let k = 0; k < 3; k++) {
        const s = 39 - y + k;
        if (s < 1 || 39 - s < 4) continue;
        const [dx, dz] = RING[s % RING.length]!;
        if (x === cx + dx && z === cz + dz) return true;
      }
    }
    return false;
  }

  private veinAt(x: number, y: number, z: number): OreKey | null {
    const gx = Math.floor(x / G);
    const gy = Math.floor(y / G);
    const gz = Math.floor(z / G);
    let best: OreKey | null = null;
    let bestD = 1e9;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = this.grid.get(this.gkey(gx + dx, gy + dy, gz + dz));
          if (!list) continue;
          for (const v of list) {
            const ddx = x + 0.5 - v.x;
            const ddy = y + 0.5 - v.y;
            const ddz = z + 0.5 - v.z;
            const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
            const jitter = hash3(this.seed, x, y, z) * 0.9;
            if (d + jitter < v.r + 0.35 && d < bestD) {
              bestD = d;
              best = v.ore;
            }
          }
        }
    return best;
  }

  private cave(x: number, y: number, z: number) {
    if (y >= 37) return false;
    const a = this.nA.noise3(x / 15, y / 11, z / 15);
    const b = this.nB.noise3(x / 15, y / 11, z / 15);
    if (a * a + b * b < 0.011) return true;
    return this.nC.noise3(x / 22, y / 16, z / 22) > 0.58;
  }

  block(x: number, y: number, z: number): number {
    if (x <= 0 || z <= 0 || y <= 0 || x >= MINE_W - 1 || z >= MINE_D - 1 || y >= MINE_H - 1) return B.bedrock;
    if (y > 44) return y === 45 ? STONE_BRICKS : B.bedrock;
    if (this.carvedStatic(x, y, z)) return 0;
    if (y === 39 && Math.abs(x - 32) <= ROOM && Math.abs(z - 32) <= ROOM) return STONE_BRICKS;
    if (y >= 38) return Math.abs(x - 32) <= ROOM + 1 && Math.abs(z - 32) <= ROOM + 1 ? STONE_BRICKS : B.stone;
    if (this.cave(x, y, z)) return 0;
    const deep = y < MINE_DEEP + Math.floor(hash3(this.seed, x, 0, z) * 3) - 1;
    const ore = this.veinAt(x, y, z);
    if (ore) return deep ? ORE_INFO[ore].deep : ORE_INFO[ore].stone;
    const p = this.nP.noise3(x / 12, y / 10, z / 12);
    if (deep) return p > 0.55 ? B.tuff : B.deepslate;
    if (p > 0.6) return B.granite;
    if (p < -0.6) return B.diorite;
    if (p > 0.45 && p < 0.5) return B.andesite;
    if (p < -0.45 && p > -0.5) return B.gravel;
    return B.stone;
  }

  isTarget(ore: OreKey, x: number, y: number, z: number) {
    const id = this.block(x, y, z);
    return id === ORE_INFO[ore].stone || id === ORE_INFO[ore].deep;
  }

  /** 시작 방 바닥 네 모서리 + 나선 계단 5칸마다 횃불 */
  torches(): [number, number, number][] {
    const out: [number, number, number][] = [
      [32 - ROOM, 40, 32 - ROOM],
      [32 + ROOM, 40, 32 - ROOM],
      [32 - ROOM, 40, 32 + ROOM],
      [32 + ROOM, 40, 32 + ROOM],
    ];
    for (let s = 3; 39 - s >= 4; s += 5) {
      const [dx, dz] = RING[s % RING.length]!;
      out.push([32 + dx, 39 - s, 32 + dz]);
    }
    return out;
  }
}

const STONE_BRICKS = bid("stone_bricks");
