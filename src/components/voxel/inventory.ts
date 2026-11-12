import { item, maxDurability, maxStack, stackable, type Stack } from "@/lib/voxel/items";
import { enchLevel } from "@/lib/voxel/enchant";

/** 0~8 핫바, 9~35 가방. armor 는 머리 · 몸 · 다리 · 발, offhand 는 왼손 */
export class Inventory {
  slots: (Stack | null)[] = Array(36).fill(null);
  armor: (Stack | null)[] = Array(4).fill(null);
  offhand: Stack | null = null;
  selected = 0;
  version = 0;

  changed() {
    this.version++;
  }

  held(): Stack | null {
    return this.slots[this.selected] ?? null;
  }

  /** F: 손에 든 것과 왼손을 맞바꾼다 */
  swapHands() {
    const main = this.slots[this.selected] ?? null;
    this.slots[this.selected] = this.offhand;
    this.offhand = main;
    this.changed();
  }

  /** 넣고 남은 개수를 돌려준다 */
  add(stack: Stack): number {
    let left = stack.count;
    const max = maxStack(stack.id);
    const canStack = max > 1 && stack.dmg === undefined && !stack.ench;
    if (canStack && this.offhand && stackable(this.offhand, stack) && this.offhand.count < max) {
      const n = Math.min(left, max - this.offhand.count);
      this.offhand.count += n;
      left -= n;
    }
    if (canStack) {
      for (let i = 0; i < 36 && left > 0; i++) {
        const s = this.slots[i];
        if (s && stackable(s, stack) && s.count < max) {
          const n = Math.min(left, max - s.count);
          s.count += n;
          left -= n;
        }
      }
    }
    for (let i = 0; i < 36 && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(left, max);
      this.slots[i] = { ...stack, count: n };
      left -= n;
    }
    if (left !== stack.count) this.changed();
    return left;
  }

  count(id: string) {
    let n = this.offhand?.id === id ? this.offhand.count : 0;
    for (const s of this.slots) if (s?.id === id) n += s.count;
    return n;
  }

  take(id: string, n: number) {
    if (this.offhand?.id === id) {
      const k = Math.min(n, this.offhand.count);
      this.offhand.count -= k;
      n -= k;
      if (this.offhand.count <= 0) this.offhand = null;
    }
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n, s.count);
      s.count -= k;
      n -= k;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.changed();
    return n === 0;
  }

  /** 손에 든 것을 n 개 쓴다 (off 면 왼손) */
  consumeHeld(n = 1, off = false) {
    const s = off ? this.offhand : this.held();
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) {
      if (off) this.offhand = null;
      else this.slots[this.selected] = null;
    }
    this.changed();
  }

  /** 손에 든 도구 내구도를 깎는다 (내구성 마법은 확률로 막아 준다). 부서지면 true */
  damageHeld(amount = 1, off = false): boolean {
    const s = off ? this.offhand : this.held();
    if (!s) return false;
    const max = maxDurability(s.id);
    if (!max) return false;
    const unb = enchLevel(s, "unbreaking");
    let real = 0;
    for (let i = 0; i < amount; i++) if (Math.random() < 1 / (unb + 1)) real++;
    if (!real) return false;
    s.dmg = (s.dmg ?? 0) + real;
    this.changed();
    if (s.dmg >= max) {
      if (off) this.offhand = null;
      else this.slots[this.selected] = null;
      return true;
    }
    return false;
  }

  /** 갑옷이 막는 피해 (마인크래프트 공식) */
  armorPoints() {
    let def = 0;
    let tough = 0;
    for (const a of this.armor) {
      const info = a ? item(a.id)?.armor : undefined;
      if (!info) continue;
      def += info.defense;
      tough += info.toughness;
    }
    return { def, tough };
  }

  /** 보호 마법 합 (EPF): 보호 1/레벨, 가벼운 착지는 낙하에만 3/레벨 */
  protection(fall: boolean) {
    let epf = 0;
    for (const a of this.armor) {
      epf += enchLevel(a, "protection");
      if (fall) epf += enchLevel(a, "feather_falling") * 3;
    }
    return Math.min(20, epf);
  }

  damageArmor(dmg: number) {
    const per = Math.max(1, Math.floor(dmg / 4));
    this.armor = this.armor.map((a) => {
      if (!a) return a;
      const unb = enchLevel(a, "unbreaking");
      if (unb && Math.random() >= 0.6 + 0.4 / (unb + 1)) return a;
      const max = maxDurability(a.id);
      const next = { ...a, dmg: (a.dmg ?? 0) + per };
      return max && next.dmg >= max ? null : next;
    });
    this.changed();
  }

  serialize() {
    return { slots: this.slots, armor: this.armor, offhand: this.offhand, selected: this.selected };
  }

  load(data: { slots?: (Stack | null)[]; armor?: (Stack | null)[]; offhand?: Stack | null; selected?: number } | undefined) {
    if (!data) return;
    const ok = (s: Stack | null | undefined): Stack | null => {
      if (!s || typeof s.id !== "string" || !item(s.id) || !(s.count > 0)) return null;
      const out: Stack = { id: s.id, count: Math.min(s.count, maxStack(s.id)) };
      if (typeof s.dmg === "number") out.dmg = s.dmg;
      if (s.ench && typeof s.ench === "object") {
        const e: Record<string, number> = {};
        for (const [k, v] of Object.entries(s.ench)) if (typeof v === "number" && v >= 1 && v <= 10) e[k] = Math.floor(v);
        if (Object.keys(e).length) out.ench = e;
      }
      return out;
    };
    if (Array.isArray(data.slots)) this.slots = Array.from({ length: 36 }, (_, i) => ok(data.slots![i]));
    if (Array.isArray(data.armor)) this.armor = Array.from({ length: 4 }, (_, i) => ok(data.armor![i]));
    this.offhand = ok(data.offhand);
    if (typeof data.selected === "number") this.selected = Math.max(0, Math.min(8, data.selected));
    this.changed();
  }

  clear() {
    const all = [...this.slots, ...this.armor, this.offhand].filter((s): s is Stack => s !== null);
    this.slots = Array(36).fill(null);
    this.armor = Array(4).fill(null);
    this.offhand = null;
    this.changed();
    return all;
  }
}

/** 마인크래프트 갑옷 피해 감소 */
export function armorReduce(dmg: number, def: number, tough: number) {
  const eff = Math.min(20, Math.max(def / 5, def - (4 * dmg) / (tough + 8)));
  return dmg * (1 - eff / 25);
}
