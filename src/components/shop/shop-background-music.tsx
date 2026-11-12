"use client";

import { useEffect, useRef } from "react";

export function ShopBackgroundMusic({
  url,
  enabled,
}: {
  url: string | null;
  enabled: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !enabled || !url) {
      audio?.pause();
      return;
    }

    audio.volume = 0.35;
    void audio.play().catch(() => {
      /* autoplay blocked until user interaction */
    });
  }, [enabled, url]);

  if (!enabled || !url) return null;

  return (
    <audio ref={audioRef} src={url} loop preload="none" aria-hidden className="hidden" />
  );
}
