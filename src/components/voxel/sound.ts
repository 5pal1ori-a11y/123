import type { BlockDef } from "@/lib/voxel/blocks";
import type { MobKind } from "@/lib/voxel/worldgen";

/** 마인크래프트 원본 음원 없이 Web Audio 로 합성하는 효과음 */

export type SoundMat = "stone" | "wood" | "gravel" | "grass" | "sand" | "snow" | "wool" | "glass" | "metal";
export type BlockAction = "break" | "place" | "hit" | "step";

const STORE_KEY = "vx:sound";

export function soundOf(def: BlockDef): SoundMat {
  const k = def.key;
  if (k.includes("glass") || k === "ice" || k === "glowstone") return "glass";
  if (def.shape === "cross" || def.shape === "crop" || k.includes("leaves") || k === "grass_block" || k === "cactus") return "grass";
  if (k.includes("wool") || k.includes("carpet") || k === "hay_block" || k === "tnt") return "wool";
  if (k === "packed_ice") return "glass";
  if (k === "snow" || k === "snow_block" || k === "grass_block_snow") return "snow";
  if (k === "sand" || k === "clay") return "sand";
  if (k === "gravel" || k === "dirt" || k === "farmland") return "gravel";
  if (k.endsWith("_block") && /iron|gold|diamond|emerald|copper|lapis|redstone/.test(k)) return "metal";
  if (def.tool === "axe" || k === "torch") return "wood";
  if (def.tool === "shovel") return "gravel";
  return "stone";
}

const ACTION = {
  break: { g: 1, len: 1.5 },
  place: { g: 0.8, len: 1 },
  hit: { g: 0.32, len: 0.7 },
  step: { g: 0.22, len: 0.8 },
} as const;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  enabled = true;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.enabled = localStorage.getItem(STORE_KEY) !== "off";
      } catch {
        /* 저장소를 못 쓰면 켜 둔다 */
      }
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(STORE_KEY, on ? "on" : "off");
    } catch {
      /* noop */
    }
  }

  /** 사용자 입력 안에서 불러야 소리가 난다 */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private ready() {
    return this.enabled && this.ctx && this.master && this.noise && this.ctx.state === "running";
  }

  /** 같은 소리가 한 프레임에 겹쳐 터지지 않게 */
  private throttle(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.last.get(key) ?? 0) < ms) return false;
    this.last.set(key, now);
    return true;
  }

  private burst(o: { t?: number; dur: number; type: BiquadFilterType; f: number; f2?: number; q?: number; g: number; a?: number }) {
    const c = this.ctx!;
    const t = c.currentTime + (o.t ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const flt = c.createBiquadFilter();
    flt.type = o.type;
    flt.frequency.setValueAtTime(o.f, t);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    flt.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), t + (o.a ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(flt).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5, o.dur + 0.05);
  }

  private tone(o: { t?: number; dur: number; type: OscillatorType; f: number; f2?: number; g: number; a?: number; lp?: number }) {
    const c = this.ctx!;
    const t = c.currentTime + (o.t ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), t + (o.a ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node: AudioNode = osc;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lp;
      node = osc.connect(f);
    }
    node.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  block(mat: SoundMat, action: BlockAction, vol = 1) {
    if (!this.ready() || vol <= 0.02) return;
    if (!this.throttle(`${mat}:${action}`, action === "step" ? 60 : 25)) return;
    const { g: ag, len } = ACTION[action];
    const g = ag * vol;
    const p = 0.85 + Math.random() * 0.3;
    if (mat === "glass" && action === "break") {
      this.burst({ dur: 0.28, type: "highpass", f: 2800, g: 0.5 * g });
      for (let i = 0; i < 6; i++) this.tone({ t: i * 0.025 + Math.random() * 0.02, dur: 0.18, type: "sine", f: 2400 + Math.random() * 3800, g: 0.12 * g });
      return;
    }
    switch (mat) {
      case "stone":
      case "glass":
        this.burst({ dur: 0.09 * len, type: "bandpass", f: 1700 * p, q: 0.9, g: 0.9 * g });
        this.burst({ dur: 0.06 * len, type: "lowpass", f: 320 * p, g: 0.6 * g });
        if (action === "break") this.burst({ t: 0.035, dur: 0.1, type: "bandpass", f: 1200 * p, q: 1, g: 0.5 * g });
        break;
      case "metal":
        this.burst({ dur: 0.1 * len, type: "bandpass", f: 2600 * p, q: 5, g: 0.9 * g });
        this.tone({ dur: 0.14 * len, type: "triangle", f: 1300 * p, g: 0.12 * g });
        break;
      case "wood":
        this.burst({ dur: 0.07 * len, type: "bandpass", f: 640 * p, q: 3, g: 1.1 * g });
        this.tone({ dur: 0.07 * len, type: "triangle", f: 190 * p, f2: 120 * p, g: 0.35 * g });
        if (action === "break") this.burst({ t: 0.04, dur: 0.09, type: "bandpass", f: 480 * p, q: 2.5, g: 0.8 * g });
        break;
      case "gravel": {
        const n = action === "break" ? 7 : action === "step" ? 3 : 4;
        for (let i = 0; i < n; i++) this.burst({ t: i * 0.016 + Math.random() * 0.01, dur: 0.03, type: "lowpass", f: 900 + Math.random() * 700, g: 0.8 * g });
        break;
      }
      case "grass": {
        this.burst({ dur: 0.12 * len, type: "highpass", f: 2200 * p, q: 0.6, g: 0.45 * g, a: 0.01 });
        const n = action === "break" ? 5 : 3;
        for (let i = 0; i < n; i++) this.burst({ t: i * 0.02 + Math.random() * 0.01, dur: 0.025, type: "bandpass", f: 3200 + Math.random() * 1500, q: 1.5, g: 0.5 * g });
        break;
      }
      case "sand":
        this.burst({ dur: 0.15 * len, type: "lowpass", f: 2400 * p, g: 0.5 * g, a: 0.02 });
        break;
      case "snow":
        this.burst({ dur: 0.13 * len, type: "lowpass", f: 1300 * p, g: 0.55 * g, a: 0.015 });
        break;
      case "wool":
        this.burst({ dur: 0.12 * len, type: "lowpass", f: 700 * p, g: 0.6 * g, a: 0.02 });
        break;
    }
  }

  hurt() {
    if (!this.ready() || !this.throttle("hurt", 120)) return;
    this.tone({ dur: 0.2, type: "square", f: 330, f2: 170, g: 0.25, lp: 1400 });
    this.burst({ dur: 0.08, type: "bandpass", f: 900, g: 0.3 });
  }

  mobHurt(kind: MobKind, vol = 1, death = false) {
    if (!this.ready() || vol <= 0.02 || !this.throttle(`mob:${kind}`, 90)) return;
    const g = vol * (death ? 1.1 : 0.9);
    const p = (death ? 0.8 : 1) * (0.9 + Math.random() * 0.2);
    switch (kind) {
      case "zombie":
        this.tone({ dur: 0.35, type: "sawtooth", f: 150 * p, f2: 90 * p, g: 0.25 * g, lp: 900 });
        break;
      case "skeleton":
        for (let i = 0; i < 4; i++) this.burst({ t: i * 0.035, dur: 0.03, type: "bandpass", f: 2600 * p, q: 4, g: 0.6 * g });
        break;
      case "creeper":
        this.burst({ dur: 0.25, type: "bandpass", f: 1400 * p, q: 2, g: 0.4 * g });
        break;
      case "spider":
        this.burst({ dur: 0.22, type: "bandpass", f: 1500 * p, f2: 900 * p, q: 4, g: 0.5 * g });
        break;
      case "cow":
        this.tone({ dur: 0.4, type: "sawtooth", f: 170 * p, f2: 120 * p, g: 0.22 * g, lp: 700 });
        break;
      case "pig":
        this.tone({ dur: 0.12, type: "square", f: 520 * p, f2: 360 * p, g: 0.16 * g, lp: 1800 });
        this.tone({ t: 0.13, dur: 0.12, type: "square", f: 480 * p, f2: 330 * p, g: 0.14 * g, lp: 1800 });
        break;
      case "sheep":
        this.tone({ dur: 0.35, type: "sawtooth", f: 420 * p, f2: 380 * p, g: 0.18 * g, lp: 1500 });
        break;
      case "chicken":
        this.tone({ dur: 0.1, type: "square", f: 1300 * p, f2: 900 * p, g: 0.12 * g, lp: 3000 });
        break;
      default:
        this.tone({ dur: 0.2, type: "square", f: 400 * p, f2: 250 * p, g: 0.18 * g, lp: 1500 });
    }
  }

  /** 가끔 내는 울음소리 */
  mobSay(kind: MobKind, vol = 1) {
    if (!this.ready() || vol <= 0.05) return;
    const g = vol * 0.6;
    const p = 0.9 + Math.random() * 0.2;
    switch (kind) {
      case "zombie":
        this.tone({ dur: 0.7, type: "sawtooth", f: 110 * p, f2: 80 * p, g: 0.22 * g, a: 0.08, lp: 600 });
        break;
      case "skeleton":
        for (let i = 0; i < 3; i++) this.burst({ t: i * 0.05, dur: 0.03, type: "bandpass", f: 2200 * p, q: 4, g: 0.4 * g });
        break;
      case "spider":
        this.burst({ dur: 0.35, type: "bandpass", f: 1100 * p, q: 6, g: 0.35 * g, a: 0.05 });
        break;
      case "cow":
        this.tone({ dur: 0.8, type: "sawtooth", f: 150 * p, f2: 115 * p, g: 0.2 * g, a: 0.06, lp: 650 });
        break;
      case "pig":
        this.tone({ dur: 0.18, type: "square", f: 300 * p, f2: 240 * p, g: 0.12 * g, lp: 1200 });
        this.tone({ t: 0.22, dur: 0.18, type: "square", f: 280 * p, f2: 220 * p, g: 0.1 * g, lp: 1200 });
        break;
      case "sheep":
        for (let i = 0; i < 4; i++) this.tone({ t: i * 0.09, dur: 0.1, type: "sawtooth", f: 440 * p, f2: 400 * p, g: 0.13 * g, lp: 1400 });
        break;
      case "chicken":
        this.tone({ dur: 0.07, type: "square", f: 1100 * p, f2: 1400 * p, g: 0.09 * g, lp: 3000 });
        this.tone({ t: 0.1, dur: 0.07, type: "square", f: 1000 * p, f2: 1300 * p, g: 0.08 * g, lp: 3000 });
        break;
      default:
    }
  }

  fuse(vol = 1) {
    if (!this.ready() || !this.throttle("fuse", 600)) return;
    this.burst({ dur: 1.5, type: "highpass", f: 3200, g: 0.35 * vol, a: 0.05 });
  }

  explode(vol = 1) {
    if (!this.ready()) return;
    this.burst({ dur: 1.4, type: "lowpass", f: 1200, f2: 90, g: 1.2 * vol, a: 0.005 });
    this.tone({ dur: 0.9, type: "sine", f: 70, f2: 30, g: 0.6 * vol });
  }

  pop() {
    if (!this.ready() || !this.throttle("pop", 40)) return;
    const p = 0.7 + Math.random() * 0.9;
    this.tone({ dur: 0.07, type: "sine", f: 700 * p, f2: 1500 * p, g: 0.22 });
  }

  eat() {
    if (!this.ready() || !this.throttle("eat", 120)) return;
    for (let i = 0; i < 3; i++) this.burst({ t: i * 0.03, dur: 0.05, type: "bandpass", f: 1400 + Math.random() * 900, q: 1.2, g: 0.35 });
  }

  burp() {
    if (!this.ready()) return;
    this.tone({ dur: 0.3, type: "sawtooth", f: 130, f2: 85, g: 0.2, a: 0.03, lp: 500 });
  }

  bow() {
    if (!this.ready()) return;
    this.burst({ dur: 0.22, type: "bandpass", f: 1500, f2: 400, q: 1.5, g: 0.5 });
    this.tone({ dur: 0.08, type: "triangle", f: 320, f2: 200, g: 0.15 });
  }

  attack(strong: boolean) {
    if (!this.ready()) return;
    this.burst({ dur: strong ? 0.12 : 0.08, type: "bandpass", f: strong ? 700 : 1100, q: 1, g: strong ? 0.6 : 0.35 });
  }

  splash(vol = 1) {
    if (!this.ready() || !this.throttle("splash", 300)) return;
    this.burst({ dur: 0.5, type: "lowpass", f: 3200, f2: 500, g: 0.5 * vol, a: 0.01 });
  }

  /** 경험치 구슬 (마크의 짧은 딩) */
  orb() {
    if (!this.ready() || !this.throttle("orb", 45)) return;
    const p = 0.8 + Math.random() * 0.5;
    this.tone({ dur: 0.12, type: "sine", f: 1560 * p, g: 0.13 });
    this.tone({ t: 0.02, dur: 0.1, type: "sine", f: 2340 * p, g: 0.06 });
  }

  levelUp() {
    if (!this.ready() || !this.throttle("lvl", 400)) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ t: i * 0.07, dur: 0.35, type: "triangle", f, g: 0.14 }));
  }

  enchant() {
    if (!this.ready()) return;
    for (let i = 0; i < 7; i++) this.tone({ t: i * 0.05, dur: 0.4, type: "sine", f: 900 + Math.random() * 1600, g: 0.07 });
    this.burst({ dur: 0.6, type: "bandpass", f: 2600, f2: 900, q: 2, g: 0.15, a: 0.05 });
  }

  shield() {
    if (!this.ready() || !this.throttle("shield", 80)) return;
    this.burst({ dur: 0.1, type: "bandpass", f: 520, q: 3, g: 0.9 });
    this.tone({ dur: 0.12, type: "triangle", f: 160, f2: 110, g: 0.3 });
  }

  /** 소리 블록: 0~24 음 (F#3 부터 반음씩) */
  note(n: number) {
    if (!this.ready()) return;
    const f = 185 * Math.pow(2, n / 12);
    this.tone({ dur: 0.6, type: "triangle", f, g: 0.22, a: 0.004 });
    this.tone({ dur: 0.3, type: "sine", f: f * 2, g: 0.06 });
  }

  ignite() {
    if (!this.ready()) return;
    this.burst({ dur: 0.18, type: "highpass", f: 2600, g: 0.4 });
    this.tone({ dur: 0.05, type: "square", f: 2400, f2: 1600, g: 0.06 });
  }

  drink() {
    if (!this.ready() || !this.throttle("drink", 160)) return;
    this.burst({ dur: 0.12, type: "lowpass", f: 700, g: 0.35, a: 0.02 });
  }

  click() {
    if (!this.ready() || !this.throttle("click", 30)) return;
    this.tone({ dur: 0.04, type: "square", f: 1800, f2: 1200, g: 0.12, lp: 4000 });
    this.burst({ dur: 0.03, type: "highpass", f: 3000, g: 0.2 });
  }
}

export const sfx = new Sfx();
