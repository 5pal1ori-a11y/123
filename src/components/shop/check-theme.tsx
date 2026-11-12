"use client";

import { useEffect } from "react";

/** 이전에 씌운 라이트 테마 잔여 클래스를 지우고, 어두운 배경에서 글자가 묻히지 않게 한다. */
const CSS = `
html, body { color-scheme: dark; }
.auth-stage, .admin-shell, .quartz-shell, .user-dash-shell { color: #f4f4f5; }
.auth-stage .text-neutral-600,
.auth-stage .text-neutral-700,
.admin-shell .text-neutral-600,
.admin-shell .text-neutral-700 { color: #a1a1aa !important; }
.auth-stage h1, .auth-stage .font-semibold { color: #fafafa; }
`;

export function CheckTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("mfa-check", "light");
    root.setAttribute("data-admin-theme", "dark");
    try {
      localStorage.setItem("vendix-admin-theme", "dark");
    } catch {
      /* ignore */
    }
  }, []);
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
