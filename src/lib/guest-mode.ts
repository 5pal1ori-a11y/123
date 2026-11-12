/**
 * 게스트 모드 — 로그인 없이 /main 월드만 둘러볼 수 있다 (상점·충전·구매는 로그인 필요).
 * 브라우저에만 저장하는 선택값이라 서버 권한과는 무관하다.
 */
const key = (shopSlug: string) => `vendix:guest:${shopSlug}`;

export function isGuestMode(shopSlug: string): boolean {
  try {
    return window.localStorage.getItem(key(shopSlug)) === "1";
  } catch {
    return false;
  }
}

export function setGuestMode(shopSlug: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key(shopSlug), "1");
    else window.localStorage.removeItem(key(shopSlug));
  } catch {
    /* 저장이 막힌 브라우저 — 이번 페이지에서만 게스트 */
  }
}

/** 상점 첫 화면(랜딩) — 로그인 없이 누구나 본다. 커스텀 도메인은 "/", 공용 도메인은 "/s/<slug>" */
export function isLandingPath(pathname: string | null | undefined) {
  return Boolean(pathname && (pathname === "/" || /^\/s\/[^/]+\/?$/.test(pathname)));
}

/** 게스트가 볼 수 있는 경로 */
export function guestAllowedPath(pathname: string | null | undefined) {
  return Boolean(pathname && /(^|\/)(main|wild|mine)\/?$/.test(pathname));
}
