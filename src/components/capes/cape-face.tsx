"use client";

import { useEffect, useState } from "react";

const faceCache = new Map<string, Promise<string | null>>();

/** Mojang 텍스처(우리 서버 중계)에서 망토 바깥면(10×16)만 잘라 낸 이미지 주소 */
export function capeFace(hash: string) {
  let p = faceCache.get(hash);
  if (!p) {
    p = new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = img.width / 64;
        const c = document.createElement("canvas");
        c.width = Math.round(10 * k);
        c.height = Math.round(16 * k);
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, k, k, 10 * k, 16 * k, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = `/api/capes/texture/${hash}`;
    });
    faceCache.set(hash, p);
  }
  return p;
}

export function useCapeFace(hash: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!hash) {
      setSrc(null);
      return;
    }
    void capeFace(hash).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [hash]);
  return src;
}

/** 망토 그림 (픽셀 그대로 확대) */
export function CapeFaceImg({ hash, width, alt }: { hash: string; width: number; alt: string }) {
  const src = useCapeFace(hash);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={Math.round(width * 1.6)} style={{ imageRendering: "pixelated" }} />;
}
