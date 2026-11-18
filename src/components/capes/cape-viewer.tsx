"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type ViewMode = "cape" | "player" | "elytra";
export type SkinInfo = { hash: string; slim: boolean };

/** Mojang 기본 스킨(Steve) — 닉네임을 넣기 전에 쓰는 몸 */
const STEVE_HASH = "31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb";

type Rect = [number, number, number, number];
type FaceRects = { left: Rect; right: Rect; top: Rect; bottom: Rect; front: Rect; back: Rect };

/** 스킨/망토 상자 UV: 오프셋(u,v)과 크기(w,h,d)로 여섯 면의 이미지 영역을 구한다 */
function skinRects(u: number, v: number, w: number, h: number, d: number): FaceRects {
  return {
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + 2 * d + w, v + d, w, h],
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
  };
}

function boxGeo(w: number, h: number, d: number, rects: FaceRects, texW: number, texH: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z (각 4개 꼭짓점: 좌상, 우상, 좌하, 우하)
  const order: Rect[] = [rects.left, rects.right, rects.top, rects.bottom, rects.front, rects.back];
  order.forEach(([x, y, rw, rh], f) => {
    const u0 = x / texW;
    const u1 = (x + rw) / texW;
    const vTop = 1 - y / texH;
    const vBot = 1 - (y + rh) / texH;
    const base = f * 4;
    if (f === 2) {
      // 윗면: 앞쪽이 위로 오도록
      uv.setXY(base, u0, vBot);
      uv.setXY(base + 1, u1, vBot);
      uv.setXY(base + 2, u0, vTop);
      uv.setXY(base + 3, u1, vTop);
    } else if (f === 3) {
      // 아랫면
      uv.setXY(base, u0, vTop);
      uv.setXY(base + 1, u1, vTop);
      uv.setXY(base + 2, u0, vBot);
      uv.setXY(base + 3, u1, vBot);
    } else {
      uv.setXY(base, u0, vTop);
      uv.setXY(base + 1, u1, vTop);
      uv.setXY(base + 2, u0, vBot);
      uv.setXY(base + 3, u1, vBot);
    }
  });
  uv.needsUpdate = true;
  return g;
}

function loadTexture(hash: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      `/api/capes/texture/${hash}`,
      (t) => {
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.colorSpace = THREE.SRGBColorSpace;
        t.generateMipmaps = false;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

function mat(tex: THREE.Texture, transparent = false) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent,
    alphaTest: transparent ? 0.5 : 0,
    side: transparent ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function imgSize(t: THREE.Texture) {
  const i = t.image as { width: number; height: number };
  return { w: i.width, h: i.height };
}

/** 플레이어 몸: 머리·몸·팔·다리 (겉 레이어 포함) */
function buildPlayer(skin: THREE.Texture, slim: boolean) {
  const g = new THREE.Group();
  const { w: W, h: H } = imgSize(skin);
  const legacy = H === 32;
  const base = mat(skin);
  const over = mat(skin, true);
  const armW = slim ? 3 : 4;

  const add = (
    size: [number, number, number],
    uv: [number, number],
    pos: [number, number, number],
    overlay: [number, number] | null,
    flipLegacy = false,
  ) => {
    const [w, h, d] = size;
    let uvBase = uv;
    if (legacy && flipLegacy) uvBase = [uv[0] === 32 ? 40 : 0, uv[1] === 48 ? 16 : uv[1]];
    const mesh = new THREE.Mesh(boxGeo(w, h, d, skinRects(uvBase[0], uvBase[1], w, h, d), W, H), base);
    mesh.position.set(...pos);
    g.add(mesh);
    if (overlay && !legacy) {
      const o = new THREE.Mesh(boxGeo(w + 0.5, h + 0.5, d + 0.5, skinRects(overlay[0], overlay[1], w, h, d), W, H), over);
      o.position.set(...pos);
      g.add(o);
    }
  };

  add([8, 8, 8], [0, 0], [0, 28, 0], null);
  // 모자 레이어
  const hat = new THREE.Mesh(boxGeo(8.9, 8.9, 8.9, skinRects(32, 0, 8, 8, 8), W, H), over);
  hat.position.set(0, 28, 0);
  g.add(hat);
  add([8, 12, 4], [16, 16], [0, 18, 0], [16, 32]);
  add([armW, 12, 4], [40, 16], [-(4 + armW / 2), 18, 0], [40, 32]);
  add([armW, 12, 4], [32, 48], [4 + armW / 2, 18, 0], [48, 48], true);
  add([4, 12, 4], [0, 16], [-2, 6, 0], [0, 32]);
  add([4, 12, 4], [16, 48], [2, 6, 0], [0, 48], true);
  return g;
}

/** 망토 상자 (바깥면이 +z 쪽) */
function buildCape(capeTex: THREE.Texture) {
  const { w: W, h: H } = imgSize(capeTex);
  const k = W / 64;
  const rects = skinRects(0, 0, 10, 16, 1);
  // 망토 이미지 배치: 바깥면(1,1) · 안쪽(12,1) · 옆(0,1)/(11,1) · 윗면(1,0) · 아랫면(11,0)
  const r: FaceRects = {
    front: [1, 1, 10, 16],
    back: [12, 1, 10, 16],
    right: [0, 1, 1, 16],
    left: [11, 1, 1, 16],
    top: [1, 0, 10, 1],
    bottom: [11, 0, 10, 1],
  };
  void rects;
  const scaled = Object.fromEntries(
    Object.entries(r).map(([n, [x, y, w, h]]) => [n, [x * k, y * k, w * k, h * k]]),
  ) as FaceRects;
  const mesh = new THREE.Mesh(boxGeo(10, 16, 1, scaled, W, H), mat(capeTex));
  return mesh;
}

/** 겉날개: 날개 한 쪽 (10×20×2). mirrored 면 반대쪽 날개 */
function buildWing(tex: THREE.Texture, mirrored: boolean) {
  const { w: W, h: H } = imgSize(tex);
  const k = W / 64;
  const r: FaceRects = {
    right: [22, 2, 2, 20],
    front: [24, 2, 10, 20],
    left: [34, 2, 2, 20],
    back: [36, 2, 10, 20],
    top: [24, 0, 10, 2],
    bottom: [34, 0, 10, 2],
  };
  const scaled = Object.fromEntries(
    Object.entries(r).map(([n, [x, y, w, h]]) => [n, [x * k, y * k, w * k, h * k]]),
  ) as FaceRects;
  // 날개 텍스처는 투명한 칸이 많아서 투명 처리를 켠다
  const mesh = new THREE.Mesh(boxGeo(10, 20, 2, scaled, W, H), mat(tex, true));
  if (mirrored) mesh.scale.x = -1;
  return mesh;
}

export function CapeViewer({
  capeHash,
  mode,
  skin,
  className,
  autoRotate = true,
}: {
  capeHash: string;
  mode: ViewMode;
  skin: SkinInfo | null;
  className?: string;
  autoRotate?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    setError(false);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 2.2;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.maxPolarAngle = Math.PI * 0.8;

    const root = new THREE.Group();
    scene.add(root);
    const textures: THREE.Texture[] = [];
    let raf = 0;

    const resize = () => {
      const w = el.clientWidth || 300;
      const h = el.clientHeight || 400;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    (async () => {
      try {
        const capeTex = await loadTexture(capeHash);
        textures.push(capeTex);
        if (disposed) return;

        if (mode === "cape") {
          const cape = buildCape(capeTex);
          root.add(cape);
          camera.position.set(0, 0, 58);
          controls.target.set(0, 0, 0);
        } else {
          const skinTex = await loadTexture(skin?.hash ?? STEVE_HASH).catch(() => loadTexture(STEVE_HASH));
          textures.push(skinTex);
          if (disposed) return;
          root.add(buildPlayer(skinTex, skin?.slim ?? false));
          if (mode === "player") {
            const cape = buildCape(capeTex);
            cape.rotation.y = Math.PI; // 바깥면이 등 쪽(-z)을 보게
            cape.position.set(0, 17, -2.9);
            cape.rotation.x = -0.08;
            root.add(cape);
          } else {
            for (const side of [-1, 1] as const) {
              const wing = buildWing(capeTex, side === 1);
              const holder = new THREE.Group();
              holder.position.set(side * 0.2, 24, -2.2);
              holder.rotation.set(0.26, side * -0.35, side * -0.24);
              wing.position.set(side * 5, -10, 0);
              holder.add(wing);
              root.add(holder);
            }
          }
          camera.position.set(0, 18, 82);
          controls.target.set(0, 16, 0);
          // 처음엔 뒤쪽(망토·날개)이 보이게
          root.rotation.y = Math.PI * 0.82;
        }
        controls.update();
      } catch {
        if (!disposed) setError(true);
      }
    })();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      for (const t of textures) t.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mt = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
        else mt?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [capeHash, mode, skin?.hash, skin?.slim, autoRotate]);

  return (
    <div ref={host} className={`relative touch-none ${className ?? ""}`}>
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          3D 보기를 불러오지 못했어요
        </div>
      ) : null}
    </div>
  );
}
