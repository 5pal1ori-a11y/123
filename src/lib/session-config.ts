/** 관리자·플랫폼은 미활동 30분 뒤 세션 만료 (보안) */
export const SESSION_IDLE_MINUTES = 30;
export const SESSION_COOKIE_MAX_AGE_SEC = SESSION_IDLE_MINUTES * 60;

/** 일반 회원은 로그인 유지 — 30일간 로그인 상태를 지킨다 (활동 시 자동 연장) */
export const USER_SESSION_DAYS = 30;
export const USER_SESSION_MINUTES = USER_SESSION_DAYS * 24 * 60;
export const USER_SESSION_MAX_AGE_SEC = USER_SESSION_DAYS * 24 * 60 * 60;

/** 역할별 세션 수명 (분) */
export function sessionTtlMinutes(role: "user" | "admin" | "platform-admin") {
  return role === "user" ? USER_SESSION_MINUTES : SESSION_IDLE_MINUTES;
}
/** 역할별 쿠키 maxAge (초) */
export function sessionMaxAgeSec(role: "user" | "admin" | "platform-admin") {
  return role === "user" ? USER_SESSION_MAX_AGE_SEC : SESSION_COOKIE_MAX_AGE_SEC;
}
