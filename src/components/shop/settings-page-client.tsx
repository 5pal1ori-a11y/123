"use client";

import { useEffect, useState } from "react";
import {
  Settings,
  User,
  Wallet,
  MessageCircle,
  LogOut,
  Loader2,
  Link2,
  Unlink,
} from "lucide-react";
import { useShopUser } from "@/components/shop/user-context";
import { UserAuthPanel } from "@/components/shop/user-auth-panel";
import { shopHeaders } from "@/lib/shop-client";
import { formatKRW } from "@/lib/utils";

export function SettingsPageClient({ shopSlug }: { shopSlug: string }) {
  const { user, loading, logout, refresh } = useShopUser();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkExpires, setLinkExpires] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [discordLinked, setDiscordLinked] = useState(false);
  const [discordUsername, setDiscordUsername] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.setAttribute("data-admin-theme", "dark");
    if (user) {
      setName(user.name);
      setDiscordLinked(Boolean(user.discordId));
      setDiscordUsername(user.discordUsername);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-tint" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Settings className="size-6 text-tint" /> 설정
        </h1>
        <UserAuthPanel shopSlug={shopSlug} />
      </div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/shop", {
        method: "PUT",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          theme: "dark",
        }),
      });
      if (!res.ok) throw new Error("저장 실패");
      await refresh();
      setMsg("저장했어요.");
    } catch {
      setMsg("오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function issueLinkCode() {
    setLinkBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/discord/link", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "발급 실패");
      setLinkCode((data as { code: string }).code);
      setLinkExpires((data as { expiresAt: string }).expiresAt);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "연동 코드 발급 실패");
    } finally {
      setLinkBusy(false);
    }
  }

  async function unlinkDiscordAccount() {
    setLinkBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/discord/link", {
        method: "POST",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink" }),
      });
      if (!res.ok) throw new Error("해제 실패");
      setLinkCode(null);
      setDiscordLinked(false);
      setDiscordUsername(null);
      await refresh();
      setMsg("Discord 연동을 해제했어요.");
    } catch {
      setMsg("연동 해제에 실패했어요.");
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Settings className="size-6 text-tint" /> 설정
      </h1>

      <div className="glass-thick rounded-3xl p-5">
        <div className="flex items-center gap-3">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" className="size-14 rounded-full" />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full bg-tint/20">
              <User className="size-7 text-tint" />
            </div>
          )}
          <div>
            <p className="font-semibold">{user.name}</p>
            <p className="text-xs text-label">{user.email}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-fill p-3">
            <p className="flex items-center gap-1 text-label">
              <Wallet className="size-3.5" /> 포인트
            </p>
            <p className="font-bold text-tint">{formatKRW(user.points)}</p>
          </div>
          <div className="rounded-2xl bg-fill p-3">
            <p className="text-label">누적 충전</p>
            <p className="font-bold">{formatKRW(user.totalCharged)}</p>
          </div>
        </div>
      </div>

      <form onSubmit={save} className="glass space-y-4 rounded-3xl p-5">
        <label className="block space-y-2">
          <span className="flex items-center gap-1 text-sm font-medium">
            <User className="size-4" /> 닉네임
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="ios-input" />
        </label>

        {msg && <p className="text-sm text-green">{msg}</p>}
        <button
          type="submit"
          disabled={saving}
          className="user-dash-btn w-full py-3.5 disabled:opacity-40"
        >
          저장
        </button>
      </form>

      <div className="glass space-y-3 rounded-3xl p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="size-4 text-[#5865F2]" /> Discord 봇 연동
        </h2>
        {discordLinked ? (
          <div className="space-y-3">
            <p className="text-sm text-label">
              연동됨{discordUsername ? `: ${discordUsername}` : ""}
            </p>
            <p className="text-xs text-label">서버에서 `/자판기` `/충전` 을 사용할 수 있어요.</p>
            <button
              type="button"
              disabled={linkBusy}
              onClick={() => void unlinkDiscordAccount()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red/30 py-3 text-sm text-red disabled:opacity-40"
            >
              <Unlink className="size-4" /> 연동 해제
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-label">
              <li>
                아래 <strong>연동 코드 발급</strong>을 눌러 코드를 받아요
              </li>
              <li>
                Discord 서버에서{" "}
                <code className="rounded bg-fill px-1 py-0.5 text-[11px]">/연동</code> 명령을
                실행해요
              </li>
              <li>
                <code className="rounded bg-fill px-1 py-0.5 text-[11px]">코드</code> 칸에 발급받은
                문자를 그대로 붙여넣어요
              </li>
            </ol>
            <p className="text-[11px] text-label">코드는 30분만 유효합니다.</p>
            {linkCode && (
              <div className="rounded-2xl bg-fill p-4 text-center">
                <p className="text-[11px] text-label">이 코드를 Discord에 입력하세요</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-tint">{linkCode}</p>
                {linkExpires && (
                  <p className="mt-1 text-[11px] text-label">
                    만료 {new Date(linkExpires).toLocaleTimeString("ko-KR")}
                  </p>
                )}
                <p className="mt-2 font-mono text-[11px] text-label">
                  /연동 코드:{linkCode}
                </p>
              </div>
            )}
            <button
              type="button"
              disabled={linkBusy}
              onClick={() => void issueLinkCode()}
              className="user-dash-btn flex w-full items-center justify-center gap-2 py-3.5 disabled:opacity-40"
            >
              <Link2 className="size-4" />
              {linkBusy ? "처리 중…" : linkCode ? "코드 다시 발급" : "연동 코드 발급"}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => logout()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red/30 py-3 text-sm text-red"
      >
        <LogOut className="size-4" /> 로그아웃
      </button>
    </div>
  );
}
