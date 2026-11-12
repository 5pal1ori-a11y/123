"use client";

import { useEffect, useState } from "react";

type SetupInfo = {
  guildId: string;
  password: string;
  recoveryKey?: string | null;
};

export function PanelSetupCredentials({
  product,
  accentClass = "bg-rose-400 text-[#1a0508]",
}: {
  product: "security" | "ticket" | "verify" | "manage";
  accentClass?: string;
}) {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("setup") !== "1") return;
    void (async () => {
      const res = await fetch(`/api/${product}/oauth/setup`, { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        needSetup?: boolean;
        guildId?: string;
        password?: string;
        recoveryKey?: string | null;
      };
      if (data.needSetup && data.guildId && data.password) {
        setInfo({
          guildId: data.guildId,
          password: data.password,
          recoveryKey: data.recoveryKey,
        });
        setOpen(true);
      }
      window.history.replaceState({}, "", window.location.pathname);
    })();
  }, [product]);

  if (!open || !info) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="admin-bento w-full max-w-md p-6" data-theme="dark">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ad-muted)]">
          등록 완료
        </p>
        <h2 className="mt-2 text-lg font-bold text-[var(--ad-text)]">웹패널 로그인 정보</h2>
        <p className="mt-2 text-sm text-[var(--ad-muted)]">
          이 비밀번호는 지금 한 번만 보여줍니다. 안전한 곳에 보관하세요. 평소 로그인은 Discord로
          하면 됩니다.
        </p>
        <div className="mt-4 space-y-3 rounded-xl border border-[var(--ad-border)] bg-black/30 p-3 text-sm">
          <div>
            <p className="text-[11px] text-[var(--ad-muted)]">아이디 (서버 ID)</p>
            <p className="mt-1 break-all font-mono text-[var(--ad-text)]">{info.guildId}</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--ad-muted)]">비밀번호</p>
            <p className="mt-1 break-all font-mono text-[var(--ad-text)]">{info.password}</p>
          </div>
          {info.recoveryKey ? (
            <div>
              <p className="text-[11px] text-[var(--ad-muted)]">복구키</p>
              <p className="mt-1 break-all font-mono text-[var(--ad-text)]">{info.recoveryKey}</p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={`vx-btn-press mt-5 w-full rounded-xl py-2.5 text-sm font-semibold ${accentClass}`}
          onClick={() => setOpen(false)}
        >
          확인
        </button>
      </div>
    </div>
  );
}
