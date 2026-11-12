/**
 * 실시간 접속 표시용 토큰 — 로그인한 회원만 PresenceRoom 에 "회원 ID"로 붙을 수 있게 서명한다.
 * 형식: `${userId}.${exp}.${sig}` (sig = base64url(HMAC-SHA256(AUTH_SECRET, `${room}:${userId}:${exp}`)))
 * 같은 형식을 worker/presence-room.ts 가 WebCrypto 로 검증한다.
 */
import { createHmac } from "crypto";
import { getAuthSecret } from "@/lib/auth";

export function presenceRoomName(slug: string) {
  return slug.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

export function signPresenceToken(room: string, userId: string, ttlSec = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = createHmac("sha256", getAuthSecret())
    .update(`${room}:${userId}:${exp}`)
    .digest("base64url");
  return `${userId}.${exp}.${sig}`;
}
