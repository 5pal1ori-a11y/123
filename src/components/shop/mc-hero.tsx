"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import type * as THREE_NS from "three";

type Three = typeof THREE_NS;
type SteveKit = typeof import("../world/steve-model");

/** 8×8 같은 작은 픽셀 그리드를 텍스처로 — 문자 하나 = 팔레트 색 하나 */
function pixelTexture(T: Three, rows: string[], palette: Record<string, string>) {
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }),
  );
  const tex = new T.CanvasTexture(c);
  tex.magFilter = T.NearestFilter;
  tex.minFilter = T.NearestFilter;
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

function noiseTexture(T: Three, base: string[], seed: number) {
  const rows: string[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 8; y++) {
    let r = "";
    for (let x = 0; x < 8; x++) r += String(Math.floor(rnd() * base.length));
    rows.push(r);
  }
  return pixelTexture(T, rows, Object.fromEntries(base.map((c, i) => [String(i), c])));
}

const CREEPER_FACE = [
  "gGgggGgg",
  "gkkggkkg",
  "gkkggkkg",
  "gggkkggg",
  "ggkkkkgg",
  "ggkkkkgg",
  "ggkggkgg",
  "gGgggGgg",
];
const SHEEP_FACE = [
  "wwwwwwww",
  "wwwwwwww",
  "wppppppw",
  "pkwppwkp",
  "pppppppp",
  "ppprrppp",
  "pppnnppp",
  "pppppppp",
];

type Tick = (t: number) => void;

type Mob = {
  group: THREE_NS.Group;
  base: THREE_NS.Vector3;
  phase: number;
  spin: number;
  bob: number;
  tick?: Tick;
};

const wave01 = (x: number) => Math.max(0, Math.min(1, x));

function buildScene(T: Three, kit: SteveKit) {
  const mats = new Map<string, THREE_NS.Material>();
  const lam = (key: string, make: () => THREE_NS.Material) => {
    let m = mats.get(key);
    if (!m) {
      m = make();
      mats.set(key, m);
    }
    return m;
  };
  const color = (hex: string) => lam(hex, () => new T.MeshLambertMaterial({ color: hex }));
  const boxGeo = new T.BoxGeometry(1, 1, 1);
  const textures: THREE_NS.Texture[] = [];
  const tex = <X extends THREE_NS.Texture>(t: X) => {
    textures.push(t);
    return t;
  };

  const box = (
    parent: THREE_NS.Object3D,
    size: [number, number, number],
    pos: [number, number, number],
    mat: THREE_NS.Material | THREE_NS.Material[],
  ) => {
    const mesh = new T.Mesh(boxGeo, mat);
    mesh.scale.set(...size);
    mesh.position.set(...pos);
    parent.add(mesh);
    return mesh;
  };
  const pivot = (parent: THREE_NS.Object3D, pos: [number, number, number]) => {
    const p = new T.Group();
    p.position.set(...pos);
    parent.add(p);
    return p;
  };

  /** 정면(+z)만 얼굴 텍스처, 나머지는 몸통 텍스처 */
  const faced = (face: THREE_NS.Texture, side: THREE_NS.Material) => {
    const f = new T.MeshLambertMaterial({ map: face });
    return [side, side, side, side, f, side];
  };

  const creeperSkin = tex(noiseTexture(T, ["#4caf3b", "#3d8f2f", "#62c74f", "#2f7a25"], 7));
  const creeperMat = new T.MeshLambertMaterial({ map: creeperSkin });
  const creeperFace = tex(pixelTexture(T, CREEPER_FACE, { g: "#4caf3b", G: "#62c74f", k: "#111111" }));
  const sheepFace = tex(
    pixelTexture(T, SHEEP_FACE, {
      w: "#eeeeee",
      p: "#d7b9a3",
      k: "#111111",
      r: "#e8a0a0",
      n: "#b48a76",
    }),
  );
  const wool = tex(noiseTexture(T, ["#f2f2f2", "#e4e4e4", "#ffffff", "#d9d9d9"], 11));
  const woolMat = new T.MeshLambertMaterial({ map: wool });
  const chestSide = tex(noiseTexture(T, ["#a26b2c", "#8f5c24", "#b47a35"], 3));
  const chestSideMat = new T.MeshLambertMaterial({ map: chestSide });
  const gold = lam("gold", () => new T.MeshLambertMaterial({ color: "#f5c33b", emissive: "#6b4a00", emissiveIntensity: 0.5 }));
  const diaMat = new T.MeshLambertMaterial({ color: "#5ef0e6", emissive: "#0f6f6a", emissiveIntensity: 0.7 });
  const octa = new T.OctahedronGeometry(1, 0);

  const mobs: { make: () => { g: THREE_NS.Group; tick?: Tick }; pos: [number, number, number]; spin: number; scale: number }[] = [
    {
      // 크리퍼 — 다리를 종종거리다 가끔 '치익' 하고 부푼다
      make: () => {
        const g = new T.Group();
        const inner = pivot(g, [0, 0, 0]);
        box(inner, [0.5, 0.75, 0.25], [0, 0.675, 0], creeperMat);
        const head = pivot(inner, [0, 1.05, 0]);
        box(head, [0.5, 0.5, 0.5], [0, 0.25, 0], faced(creeperFace, creeperMat));
        const legs = ([[-0.13, 0.19], [0.13, 0.19], [-0.13, -0.19], [0.13, -0.19]] as const).map(([x, z]) => {
          const p = pivot(inner, [x, 0.3, z]);
          box(p, [0.25, 0.3, 0.25], [0, -0.15, 0], creeperMat);
          return p;
        });
        return {
          g,
          tick: (t) => {
            const s = Math.sin(t * 6);
            legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? s : -s) * 0.4));
            head.rotation.y = Math.sin(t * 0.7) * 0.35;
            const c = t % 7;
            const fuse = c > 5.6 ? (c - 5.6) / 1.4 : 0;
            const blink = fuse > 0 && Math.sin(fuse * 40) > 0 ? 0.7 : 0;
            creeperMat.emissive.setRGB(blink, blink, blink);
            const puff = 1 + fuse * fuse * 0.22;
            inner.scale.set(puff, 1 + fuse * 0.1, puff);
          },
        };
      },
      pos: [-3.2, -0.6, -0.4],
      spin: 0.35,
      scale: 1.25,
    },
    {
      // 스티브 — 입체 스킨, 걷다가 손 흔들기
      make: () => {
        const g = new T.Group();
        const skin = tex(kit.makeSkinTexture({ shirt: 0x2fb3c2, hair: 0x3b2a1a, pants: 0x3b3fa8, accent: 0xb388ff, seed: 77 }));
        const rig = kit.buildSteve(skin, []);
        g.add(rig.root);
        return {
          g,
          tick: (t) => {
            const c = t % 7;
            const wave = c > 4.4 && c < 6.6 ? Math.min(1, (c - 4.4) * 3, (6.6 - c) * 3) : 0;
            kit.poseSteve(rig.limbs, { t, walk: t * 1.7, speed: 0.8 * (1 - wave), swing: 0, pitch: -0.12, wave });
          },
        };
      },
      pos: [3.3, -1.05, -0.8],
      spin: -0.28,
      scale: 1.05,
    },
    {
      // 양 — 고개 숙여 풀 뜯기
      make: () => {
        const g = new T.Group();
        const skin = color("#d7b9a3");
        box(g, [0.6, 0.55, 0.9], [0, 0.6, 0], woolMat);
        const head = pivot(g, [0, 0.78, 0.4]);
        box(head, [0.38, 0.38, 0.38], [0, 0.04, 0.17], faced(sheepFace, skin));
        box(head, [0.42, 0.14, 0.3], [0, 0.22, 0.1], woolMat);
        const legs = ([[-0.18, 0.3], [0.18, 0.3], [-0.18, -0.3], [0.18, -0.3]] as const).map(([x, z]) => {
          const p = pivot(g, [x, 0.35, z]);
          box(p, [0.16, 0.35, 0.16], [0, -0.175, 0], skin);
          return p;
        });
        return {
          g,
          tick: (t) => {
            const c = (t + 1.5) % 6;
            const down = c > 3.6 ? Math.sin(((c - 3.6) / 2.4) * Math.PI) : 0;
            head.rotation.x = down * 0.95 + Math.sin(t * 9) * 0.04 * down;
            head.rotation.y = Math.sin(t * 0.8) * 0.25 * (1 - down);
            const s = Math.sin(t * 4) * 0.18 * (1 - down);
            legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? s : -s)));
          },
        };
      },
      pos: [-5.4, 1.3, -2.6],
      spin: 0.22,
      scale: 1.1,
    },
    {
      // 알레이 — 날갯짓하며 다이아를 들고 둥실
      make: () => {
        const g = new T.Group();
        const inner = pivot(g, [0, 0, 0]);
        const body = lam("allay", () => new T.MeshLambertMaterial({ color: "#5fd0ff", emissive: "#1a6fa8", emissiveIntensity: 0.6 }));
        box(inner, [0.32, 0.32, 0.32], [0, 0.6, 0], body);
        box(inner, [0.08, 0.06, 0.02], [-0.08, 0.62, 0.165], color("#0b2a4a"));
        box(inner, [0.08, 0.06, 0.02], [0.08, 0.62, 0.165], color("#0b2a4a"));
        box(inner, [0.22, 0.3, 0.16], [0, 0.32, 0], body);
        const wing = lam("allay-wing", () => new T.MeshLambertMaterial({ color: "#d9f6ff", transparent: true, opacity: 0.72, side: T.DoubleSide }));
        const wingL = pivot(inner, [-0.1, 0.45, -0.08]);
        box(wingL, [0.03, 0.32, 0.36], [0, 0, -0.18], wing);
        const wingR = pivot(inner, [0.1, 0.45, -0.08]);
        box(wingR, [0.03, 0.32, 0.36], [0, 0, -0.18], wing);
        const gem = new T.Mesh(octa, diaMat);
        gem.scale.setScalar(0.1);
        gem.position.set(0, 0.3, 0.2);
        inner.add(gem);
        return {
          g,
          tick: (t) => {
            const flap = Math.sin(t * 18) * 0.55;
            wingL.rotation.y = -0.45 - flap;
            wingR.rotation.y = 0.45 + flap;
            inner.position.y = Math.sin(t * 2.6) * 0.1;
            inner.rotation.z = Math.sin(t * 1.4) * 0.14;
            gem.rotation.y = t * 3;
          },
        };
      },
      pos: [5.2, 1.5, -1.8],
      spin: 0.6,
      scale: 1.4,
    },
    {
      // 개구리 — 콩콩 뛰고 가끔 혀 날름
      make: () => {
        const g = new T.Group();
        const inner = pivot(g, [0, 0, 0]);
        const skin = color("#d07a36");
        box(inner, [0.55, 0.3, 0.6], [0, 0.2, 0], skin);
        box(inner, [0.55, 0.12, 0.6], [0, 0.4, 0.03], color("#e39a52"));
        box(inner, [0.16, 0.14, 0.14], [-0.18, 0.5, 0.2], color("#f6e7a8"));
        box(inner, [0.16, 0.14, 0.14], [0.18, 0.5, 0.2], color("#f6e7a8"));
        box(inner, [0.06, 0.06, 0.02], [-0.18, 0.5, 0.28], color("#111111"));
        box(inner, [0.06, 0.06, 0.02], [0.18, 0.5, 0.28], color("#111111"));
        const legs = ([-0.24, 0.24] as const).map((x) => {
          const p = pivot(inner, [x, 0.12, -0.2]);
          box(p, [0.14, 0.1, 0.32], [0, -0.04, 0.06], color("#b8652a"));
          return p;
        });
        const tongue = pivot(inner, [0, 0.22, 0.3]);
        box(tongue, [0.08, 0.04, 1], [0, 0, 0.5], color("#e05a7a"));
        tongue.scale.z = 0.001;
        return {
          g,
          tick: (t) => {
            const c = (t % 1.8) / 1.8;
            const hop = c < 0.42 ? Math.sin((c / 0.42) * Math.PI) : 0;
            const squash = c > 0.86 ? Math.sin(((c - 0.86) / 0.14) * Math.PI) : 0;
            inner.position.y = hop * 0.6;
            inner.scale.set(1 + squash * 0.12, 1 - squash * 0.2 + hop * 0.12, 1 + squash * 0.12);
            inner.rotation.x = -hop * 0.25;
            legs.forEach((l) => (l.rotation.x = hop * 0.9));
            const lick = t % 5;
            tongue.scale.z = lick > 4.5 ? 0.001 + Math.sin(((lick - 4.5) / 0.5) * Math.PI) * 0.5 : 0.001;
          },
        };
      },
      pos: [-1.6, -1.9, 0.6],
      spin: -0.4,
      scale: 1.2,
    },
    {
      // 상자 — 뚜껑이 열리며 금빛이 새어 나온다
      make: () => {
        const g = new T.Group();
        box(g, [0.85, 0.58, 0.85], [0, 0.29, 0], chestSideMat);
        box(g, [0.86, 0.04, 0.86], [0, 0.56, 0], color("#5a3a17"));
        const glowMat = new T.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0 });
        box(g, [0.74, 0.02, 0.74], [0, 0.585, 0], glowMat);
        const lid = pivot(g, [0, 0.58, -0.43]);
        box(lid, [0.87, 0.27, 0.87], [0, 0.135, 0.435], chestSideMat);
        box(lid, [0.12, 0.16, 0.05], [0, 0.04, 0.89], color("#d9d9d9"));
        const ingot = box(g, [0.26, 0.1, 0.14], [0, 0.6, 0], gold);
        return {
          g,
          tick: (t) => {
            const open = Math.pow(wave01(Math.sin(t * 0.9) * 1.4), 0.7);
            lid.rotation.x = -open * 1.15;
            glowMat.opacity = open * 0.9;
            ingot.visible = open > 0.15;
            ingot.position.y = 0.6 + open * 0.45 + Math.sin(t * 3) * 0.04;
            ingot.rotation.y = t * 2.2;
          },
        };
      },
      pos: [1.9, -2.0, 0.4],
      spin: 0.3,
      scale: 1,
    },
    {
      // 금괴 더미
      make: () => {
        const g = new T.Group();
        box(g, [0.5, 0.18, 0.26], [0, 0.09, 0], gold);
        box(g, [0.5, 0.18, 0.26], [0.08, 0.27, 0.05], gold).rotation.y = 0.5;
        return { g };
      },
      pos: [0.4, 2.0, -2.2],
      spin: 0.8,
      scale: 1.2,
    },
    {
      // 다이아몬드 — 반짝이며 돌고 주위를 작은 조각이 맴돈다
      make: () => {
        const g = new T.Group();
        const m = new T.Mesh(octa, diaMat);
        m.scale.setScalar(0.32);
        m.position.y = 0.32;
        g.add(m);
        const orbit = pivot(g, [0, 0.32, 0]);
        const bits = [0, 1, 2].map((i) => {
          const b = box(orbit, [0.06, 0.06, 0.06], [0, 0, 0], color(i === 1 ? "#ffffff" : "#9ffcf4"));
          return b;
        });
        return {
          g,
          tick: (t) => {
            diaMat.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.35;
            m.scale.setScalar(0.32 * (1 + Math.sin(t * 3) * 0.05));
            bits.forEach((b, i) => {
              const a = t * 2.2 + (i * Math.PI * 2) / 3;
              b.position.set(Math.cos(a) * 0.55, Math.sin(t * 3 + i) * 0.15, Math.sin(a) * 0.55);
              b.rotation.set(t * 3, t * 2, 0);
            });
          },
        };
      },
      pos: [-3.6, 1.9, -1.2],
      spin: 1.1,
      scale: 1,
    },
  ];

  const scene = new T.Scene();
  scene.add(new T.AmbientLight("#b9a6ff", 1.2));
  const sun = new T.DirectionalLight("#ffffff", 1.6);
  sun.position.set(3, 6, 5);
  scene.add(sun);
  const rim = new T.DirectionalLight("#a36bff", 1.1);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  const placed: Mob[] = mobs.map((m, i) => {
    const { g: group, tick } = m.make();
    group.scale.setScalar(m.scale);
    group.position.set(...m.pos);
    group.rotation.y = (i % 2 ? -1 : 1) * 0.6;
    scene.add(group);
    return { group, base: new T.Vector3(...m.pos), phase: i * 1.37, spin: m.spin, bob: 0.12 + (i % 3) * 0.05, tick };
  });

  /** 떠다니는 블록 조각 */
  const dust = new T.Group();
  const dustMats = ["#7c4dff", "#b388ff", "#5ef0e6", "#f5c33b"].map(color);
  for (let i = 0; i < 26; i++) {
    const s = 0.06 + Math.random() * 0.1;
    const m = box(dust, [s, s, s], [(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6, -1 - Math.random() * 4], dustMats[i % dustMats.length]);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    m.userData.spin = 0.4 + Math.random() * 1.2;
  }
  scene.add(dust);

  const dispose = () => {
    const geos = new Set<THREE_NS.BufferGeometry>();
    const used = new Set<THREE_NS.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE_NS.Mesh;
      if (!mesh.isMesh) return;
      geos.add(mesh.geometry);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) used.add(m);
    });
    for (const g of geos) g.dispose();
    for (const m of used) m.dispose();
    for (const t of textures) t.dispose();
  };

  return { scene, mobs: placed, dust, dispose };
}

export function McHero({ onShop }: { onShop?: () => void }) {
  const canvasHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    void Promise.all([import("three"), import("../world/steve-model")]).then(([T, kit]) => {
      if (disposed) return;
      let renderer: THREE_NS.WebGLRenderer;
      try {
        renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = T.SRGBColorSpace;
      host.appendChild(renderer.domElement);
      requestAnimationFrame(() => host.classList.add("is-ready"));

      const camera = new T.PerspectiveCamera(38, 1, 0.1, 60);
      camera.position.set(0, 0.2, 9);
      const { scene, mobs, dust, dispose } = buildScene(T, kit);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let spread = 1;
      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        spread = Math.min(1.9, Math.max(1, (w / h) / 1.8));
        // 좁은 화면에선 뒤로 빼서 몹이 잘리지 않게
        camera.position.z = w / h < 1.2 ? 13 : w / h < 1.8 ? 10.5 : 9;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      const target = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        const r = host.getBoundingClientRect();
        target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
        target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      let visible = true;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      io.observe(host);

      let raf = 0;
      const start = performance.now();
      let last = start;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!visible || document.hidden) {
          last = now;
          return;
        }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const t = reduce ? 0 : (now - start) / 1000;
        const intro = reduce ? 1 : Math.min(1, t / 1.4);
        const ease = 1 - Math.pow(1 - intro, 3);
        mobs.forEach((m, i) => {
          const k = Math.min(1, Math.max(0, ease * 1.6 - i * 0.08));
          m.group.position.x = m.base.x * spread;
          m.group.position.y = m.base.y + Math.sin(t * 1.1 + m.phase) * m.bob - (1 - k) * 4;
          if (!reduce) m.group.rotation.y += m.spin * dt * 0.5;
          m.tick?.(t + m.phase);
        });
        for (const d of dust.children) {
          d.rotation.x += dt * (d.userData.spin as number);
          d.rotation.y += dt * (d.userData.spin as number) * 0.7;
        }
        dust.rotation.y = Math.sin(t * 0.1) * 0.15;
        dust.position.y = Math.sin(t * 0.4) * 0.1;
        camera.position.x += (target.x * 0.6 - camera.position.x) * 0.04;
        camera.position.y += (0.2 - target.y * 0.35 - camera.position.y) * 0.04;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <section className="mch" aria-label="DOES MC">
      <div ref={canvasHost} className="mch-canvas" aria-hidden />
      <div className="mch-glow" aria-hidden />
      <div className="mch-body">
        <span className="mch-live">
          <i />
          LIVE · 월드 오픈
        </span>
        <h2 className="mch-title" aria-label="DOES MC">
          {"DOES".split("").map((ch, i) => (
            <b key={i}>{ch}</b>
          ))}{" "}
          <span>MC</span>
        </h2>
        <p className="mch-sub">마인크래프트 계정 · 하늘섬 파쿠르 · 매일 미션으로 토큰 모으기</p>
        <div className="mch-actions">
          <button type="button" className="mc-btn" onClick={onShop}>
            <ShoppingBag className="size-4" />
            상품 보기
          </button>
          <Link href="/main" className="mc-btn is-green">
            월드 입장
          </Link>
        </div>
      </div>
    </section>
  );
}
