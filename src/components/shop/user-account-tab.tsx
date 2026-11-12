"use client";

import { useEffect, useState } from "react";
import {
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  Monitor,
  Shield,
  Unlink,
} from "lucide-react";
import { PasswordStrengthMeter } from "@/components/ui/password-strength-meter";
import { formatKRW } from "@/lib/utils";
import { shopHeaders } from "@/lib/shop-client";
import { maskIp } from "@/lib/pii";
import type { PublicUser, ShopTier } from "@/lib/types";
import {
  PanelField,
  PanelFrame,
  PanelPrimaryBtn,
  PanelTabBody,
} from "@/components/admin/admin-panel-ui";
import { REFERRAL_STASH_KEY } from "@/lib/referral";
import { UserReferralPanel } from "./user-referral-panel";

type SubTab = "profile" | "discord" | "referral" | "security";

function MinecraftNameForm({
  shopSlug,
  current,
  onSaved,
}: {
  shopSlug: string;
  current: string | null;
  onSaved?: () => Promise<void> | void;
}) {
  const [name, setName] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(value: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/user/minecraft", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; user?: PublicUser };
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setName(data.user?.minecraftName ?? "");
      setMsg({ ok: true, text: value ? "등록했어요. 월드에서 이 스킨으로 보여요." : "등록을 지웠어요." });
      await onSaved?.();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "저장에 실패했어요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(name.trim());
      }}
      className="space-y-3"
    >
      <PanelField label="마인크래프트 자바 닉네임 (스킨)">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예) Notch"
          maxLength={16}
          className="toss-admin-field"
        />
      </PanelField>
      <p className="text-xs leading-relaxed text-neutral-500">
        월드에서 이 닉네임의 스킨과 이름으로 보여요. Microsoft 로그인으로 정품 확인이 되면 그 닉네임으로 자동으로 바뀌어요.
      </p>
      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <PanelPrimaryBtn type="submit" disabled={busy || !name.trim()} className="w-full sm:w-auto sm:min-w-[140px]">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "닉네임 등록"}
        </PanelPrimaryBtn>
        {current && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save("")}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-neutral-300 disabled:opacity-40"
          >
            등록 지우기
          </button>
        )}
      </div>
    </form>
  );
}

export function UserAccountTab({
  shopSlug,
  user,
  tier,
  saving,
  nickname,
  newEmail,
  emailPassword,
  currentPassword,
  newPassword,
  onNicknameChange,
  onNewEmailChange,
  onEmailPasswordChange,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onSaveNickname,
  onChangeEmail,
  onChangePassword,
  onDiscordRefresh,
  loginHistory,
  sessions,
  onRevokeSession,
  onRevokeOtherSessions,
}: {
  shopSlug: string;
  user: PublicUser;
  tier: ShopTier | null;
  saving: boolean;
  nickname: string;
  newEmail: string;
  emailPassword: string;
  currentPassword: string;
  newPassword: string;
  onNicknameChange: (v: string) => void;
  onNewEmailChange: (v: string) => void;
  onEmailPasswordChange: (v: string) => void;
  onCurrentPasswordChange: (v: string) => void;
  onNewPasswordChange: (v: string) => void;
  onSaveNickname: (e: React.FormEvent) => void;
  onChangeEmail: (e: React.FormEvent) => void;
  onChangePassword: (e: React.FormEvent) => void;
  onDiscordRefresh?: () => Promise<void> | void;
  loginHistory: { id: string; ip: string; deviceLabel: string; createdAt: string }[];
  sessions: {
    id: string;
    deviceLabel: string;
    ip: string;
    createdAt: string;
    lastActiveAt: string;
    current: boolean;
  }[];
  onRevokeSession: (sessionId: string) => void;
  onRevokeOtherSessions: () => void;
}) {
  const [sub, setSub] = useState<SubTab>("discord");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkExpires, setLinkExpires] = useState<string | null>(null);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const discordLinked = Boolean(user.discordId);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
    if (!ref) return;
    try {
      localStorage.setItem(REFERRAL_STASH_KEY, ref.slice(0, 12));
    } catch {
      /* storage blocked */
    }
    setSub("referral");
  }, []);

  async function deleteAccount() {
    if (!window.confirm("정말 계정을 삭제할까요? 이 작업은 되돌릴 수 없어요.")) return;
    setDeleteBusy(true);
    setDeleteMsg(null);
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-account", password: deleteConfirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      window.location.reload();
    } catch (err) {
      setDeleteMsg(err instanceof Error ? err.message : "계정 삭제에 실패했어요.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function issueLinkCode() {
    setLinkBusy(true);
    setLinkMsg(null);
    try {
      const res = await fetch("/api/discord/link", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        expiresAt?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "발급 실패");
      if (!data.code) throw new Error("코드가 응답에 없어요. 다시 시도해 주세요.");
      setLinkCode(data.code);
      setLinkExpires(data.expiresAt ?? null);
      setLinkMsg(null);
    } catch (err) {
      setLinkMsg(err instanceof Error ? err.message : "연동 코드 발급 실패");
    } finally {
      setLinkBusy(false);
    }
  }

  async function unlinkDiscordAccount() {
    setLinkBusy(true);
    setLinkMsg(null);
    try {
      const res = await fetch("/api/discord/link", {
        method: "POST",
        credentials: "include",
        headers: { ...shopHeaders(shopSlug), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "해제 실패");
      setLinkCode(null);
      setLinkExpires(null);
      await onDiscordRefresh?.();
      setLinkMsg("Discord 연동을 해제했어요.");
    } catch (err) {
      setLinkMsg(err instanceof Error ? err.message : "연동 해제에 실패했어요.");
    } finally {
      setLinkBusy(false);
    }
  }

  async function copyCode() {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(linkCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="w-full space-y-5 xl:grid xl:grid-cols-[minmax(280px,360px)_1fr] xl:items-start xl:gap-6 xl:space-y-0">
      <section className="user-mypage-profile flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt="" className="size-16 rounded-full border border-white/10" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-white/20 to-white/5 text-xl font-bold">
            {(user.name || user.email).slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-white">{user.name}</p>
          <p className="truncate text-sm text-neutral-500">{user.email}</p>
          {tier ? (
            <span
              className="mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: `${tier.color}22`, color: tier.color }}
            >
              {tier.name}
            </span>
          ) : null}
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-xs text-neutral-500">포인트</p>
          <p className="font-bold text-white">{formatKRW(user.points)}</p>
        </div>
      </section>

      <div className="space-y-5">
        <PanelFrame
          stats={[
            { label: "포인트", value: formatKRW(user.points) },
            { label: "누적 충전", value: formatKRW(user.totalCharged) },
          ]}
          tabs={[
            { id: "profile", label: "프로필" },
            { id: "discord", label: "Discord" },
            { id: "referral", label: "추천인" },
            { id: "security", label: "보안" },
          ]}
          activeTab={sub}
          onTabChange={(id) => setSub(id as SubTab)}
        >
          {sub === "profile" && (
            <PanelTabBody tabKey="profile" className="space-y-6">
              {user.minecraftName && !user.minecraftManual ? (
                <div className="space-y-2">
                  <PanelField label="닉네임">
                    <input value={user.minecraftName} className="toss-admin-field" disabled readOnly />
                  </PanelField>
                  <p className="text-xs text-neutral-500">
                    Microsoft 계정의 마인크래프트 닉네임을 그대로 써요. 마인크래프트에서 닉네임을 바꾸면 다음 로그인 때
                    반영돼요.
                  </p>
                </div>
              ) : user.minecraftName ? null : (
                <form onSubmit={onSaveNickname} className="space-y-4">
                  <PanelField label="표시 이름">
                    <input
                      value={nickname}
                      onChange={(e) => onNicknameChange(e.target.value)}
                      className="toss-admin-field"
                      required
                    />
                  </PanelField>
                  <PanelPrimaryBtn type="submit" disabled={saving} className="w-full sm:w-auto sm:min-w-[140px]">
                    {saving ? <Loader2 className="size-4 animate-spin" /> : "저장"}
                  </PanelPrimaryBtn>
                </form>
              )}
              {!(user.minecraftName && !user.minecraftManual) && (
                <MinecraftNameForm shopSlug={shopSlug} current={user.minecraftName ?? null} onSaved={onDiscordRefresh} />
              )}
            </PanelTabBody>
          )}

          {sub === "discord" && (
            <PanelTabBody tabKey="discord" className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <MessageCircle className="size-4 text-[#5865F2]" /> Discord 봇 연동
              </p>

              {discordLinked ? (
                <div className="space-y-3">
                  <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                    연동됨{user.discordUsername ? `: ${user.discordUsername}` : ""}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Discord 로그인으로 연결된 계정이에요. 서버에서 `/자판기` · `/충전` 을 바로 쓸 수
                    있어요.
                  </p>
                  <button
                    type="button"
                    disabled={linkBusy}
                    onClick={() => void unlinkDiscordAccount()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 py-2.5 text-sm text-red-300 disabled:opacity-40 sm:w-auto sm:px-4"
                  >
                    <Unlink className="size-4" /> 연동 해제
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <a
                    href={`/api/auth/user/discord/start?shop=${encodeURIComponent(shopSlug)}&next=${encodeURIComponent("/dashboard?tab=account")}&link=1`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
                  >
                    <Link2 className="size-4" /> Discord 계정으로 바로 연동하기
                  </a>
                  <p className="text-xs leading-relaxed text-neutral-500">
                    Discord 로그인 창에서 승인하면 끝이에요. 예전에 Discord로 쓰던 계정이면 포인트와 구매 내역이 이 계정으로
                    합쳐져요.
                  </p>
                  <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-neutral-400">
                    <li>
                      또는 아래 <strong className="text-neutral-200">연동 코드 발급</strong>을 누르고
                    </li>
                    <li>
                      Discord에서{" "}
                      <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">/연동</code>{" "}
                      실행
                    </li>
                    <li>발급된 코드를 그대로 붙여넣어요</li>
                  </ol>

                  {linkCode ? (
                    <div className="rounded-2xl border border-[#5865F2]/35 bg-[#5865F2]/10 p-4 text-center">
                      <p className="text-[11px] text-neutral-400">이 코드를 Discord에 입력하세요</p>
                      <p className="mt-2 font-mono text-3xl font-bold tracking-[0.2em] text-white">
                        {linkCode}
                      </p>
                      {linkExpires ? (
                        <p className="mt-1 text-[11px] text-neutral-500">
                          만료 {new Date(linkExpires).toLocaleTimeString("ko-KR")}
                        </p>
                      ) : null}
                      <p className="mt-2 font-mono text-[11px] text-neutral-400">
                        /연동 코드:{linkCode}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyCode()}
                        className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-neutral-200"
                      >
                        {copied ? "복사됨" : "코드 복사"}
                      </button>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-500">
                      아직 발급된 코드가 없어요. 버튼을 누르면 여기에 표시됩니다.
                    </p>
                  )}

                  <PanelPrimaryBtn
                    type="button"
                    disabled={linkBusy}
                    onClick={() => void issueLinkCode()}
                    className="w-full gap-2 sm:w-auto"
                  >
                    {linkBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Link2 className="size-4" />
                    )}
                    {linkCode ? "코드 다시 발급" : "연동 코드 발급"}
                  </PanelPrimaryBtn>
                </div>
              )}

              {linkMsg ? <p className="text-sm text-neutral-300">{linkMsg}</p> : null}
            </PanelTabBody>
          )}

          {sub === "referral" && (
            <PanelTabBody tabKey="referral">
              <UserReferralPanel shopSlug={shopSlug} />
            </PanelTabBody>
          )}

          {sub === "security" && (
            <PanelTabBody tabKey="security" className="space-y-6">
              <form onSubmit={onChangeEmail} className="space-y-4">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <Mail className="size-4 text-neutral-500" /> 이메일 변경
                </p>
                <PanelField label="새 이메일">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => onNewEmailChange(e.target.value)}
                    className="toss-admin-field"
                    required
                  />
                </PanelField>
                <PanelField label="현재 비밀번호">
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => onEmailPasswordChange(e.target.value)}
                    className="toss-admin-field"
                    required
                  />
                </PanelField>
                <PanelPrimaryBtn type="submit" disabled={saving} className="w-full sm:w-auto">
                  이메일 변경
                </PanelPrimaryBtn>
              </form>

              <div className="border-t border-white/10 pt-6">
                <form onSubmit={onChangePassword} className="space-y-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    <KeyRound className="size-4 text-neutral-500" /> 비밀번호 변경
                  </p>
                  <PanelField label="현재 비밀번호">
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => onCurrentPasswordChange(e.target.value)}
                      className="toss-admin-field"
                      required
                    />
                  </PanelField>
                  <PanelField label="새 비밀번호" hint="6자 이상">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => onNewPasswordChange(e.target.value)}
                      className="toss-admin-field"
                      minLength={6}
                      required
                    />
                    <PasswordStrengthMeter password={newPassword} />
                  </PanelField>
                  <PanelPrimaryBtn type="submit" disabled={saving} className="w-full sm:w-auto">
                    비밀번호 변경
                  </PanelPrimaryBtn>
                </form>
              </div>

              <div className="space-y-4 border-t border-white/10 pt-6">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <Monitor className="size-4 text-neutral-500" /> 접속 기기
                </p>
                {sessions.length === 0 ? (
                  <p className="text-xs text-neutral-500">등록된 세션이 없어요.</p>
                ) : (
                  <ul className="space-y-2">
                    {sessions.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white">
                            {s.deviceLabel}
                            {s.current ? (
                              <span className="ml-2 text-[10px] text-emerald-400">현재 기기</span>
                            ) : null}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            {maskIp(s.ip)} · {new Date(s.lastActiveAt).toLocaleString("ko-KR")}
                          </p>
                        </div>
                        {!s.current ? (
                          <button
                            type="button"
                            onClick={() => onRevokeSession(s.id)}
                            className="shrink-0 text-xs text-red-400 hover:text-red-300"
                          >
                            로그아웃
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {sessions.filter((s) => !s.current).length > 0 ? (
                  <button
                    type="button"
                    onClick={onRevokeOtherSessions}
                    className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300"
                  >
                    <LogOut className="size-3.5" /> 다른 기기 모두 로그아웃
                  </button>
                ) : null}
              </div>

              <div className="space-y-3 border-t border-white/10 pt-6">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <Shield className="size-4 text-neutral-500" /> 로그인 기록
                </p>
                {loginHistory.length === 0 ? (
                  <p className="text-xs text-neutral-500">기록이 없어요.</p>
                ) : (
                  <ul className="space-y-2">
                    {loginHistory.slice(0, 8).map((h) => (
                      <li key={h.id} className="rounded-xl border border-white/10 px-3 py-2 text-xs">
                        <span className="text-neutral-300">{h.deviceLabel}</span>
                        <span className="mx-2 text-neutral-600">·</span>
                        <span className="text-neutral-500">{maskIp(h.ip)}</span>
                        <p className="mt-0.5 text-[11px] text-neutral-600">
                          {new Date(h.createdAt).toLocaleString("ko-KR")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-3 border-t border-white/10 pt-6">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <Shield className="size-4 text-neutral-500" /> 계정 삭제
                </p>
                <p className="text-xs text-neutral-500">
                  계정과 연결된 세션·위시리스트 등 개인 데이터가 삭제됩니다. 주문·충전 기록은 상점 장부에 익명으로 남을 수 있어요.
                </p>
                <PanelField label="비밀번호 또는 DELETE 확인">
                  <input
                    type="password"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    className="toss-admin-field"
                    placeholder="비밀번호 · 소셜은 DELETE"
                    autoComplete="off"
                  />
                </PanelField>
                <button
                  type="button"
                  disabled={deleteBusy || !deleteConfirm.trim()}
                  onClick={() => void deleteAccount()}
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                >
                  {deleteBusy ? "삭제 중…" : "계정 영구 삭제"}
                </button>
                {deleteMsg ? <p className="text-xs text-red-400">{deleteMsg}</p> : null}
              </div>
            </PanelTabBody>
          )}

        </PanelFrame>
      </div>
    </div>
  );
}
