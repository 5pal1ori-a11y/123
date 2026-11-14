import { createHmac } from "crypto";
import { boxIdleGif, boxOpenGif } from "@/lib/gif/cute-scenes";

export function renderIdleBoxGif() {
  return boxIdleGif();
}

export function renderOpenBoxGif(amount: number) {
  return boxOpenGif(amount);
}

function gifSecret() {
  return process.env.AUTH_SECRET?.trim() || "vendix-dev-secret-change-me";
}

/** 그림이 바뀌면 앞에 새 버전을 넣는다 — 디스코드가 주소별로 이미지를 오래 캐시함. 뒤쪽은 예전 메시지용 */
const SIG_VERSIONS = ["rbox-mine", "rbox-flat", "rbox-cute", "rbox-mc"] as const;

export function randomBoxGifSig(amount: number, version: (typeof SIG_VERSIONS)[number] = SIG_VERSIONS[0]) {
  return createHmac("sha256", gifSecret()).update(`${version}:${amount}`).digest("hex").slice(0, 16);
}

export function randomBoxGifSigs(amount: number) {
  return SIG_VERSIONS.map((v) => randomBoxGifSig(amount, v));
}

export function randomBoxGifPath(amount: number) {
  return `/api/discord/rbox/${amount}-${randomBoxGifSig(amount)}.gif`;
}

export const RANDOM_BOX_IDLE_GIF_PATH = "/api/discord/rbox/idle-mine.gif";

export function randomBoxGifUrl(amount: number) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
  return `${origin}${randomBoxGifPath(amount)}`;
}
