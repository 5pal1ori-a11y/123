/** 미활동 시 세션 만료 (분) — 관리자·유저·플랫폼 공통 */
export const SESSION_IDLE_MINUTES = 30;

export const SESSION_COOKIE_MAX_AGE_SEC = SESSION_IDLE_MINUTES * 60;
