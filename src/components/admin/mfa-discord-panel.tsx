"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, Server } from "lucide-react";
import { shopHeaders } from "@/lib/shop-client";

type Guild = { id: string; name: string; iconUrl: string | null };
type Channel = { id: string; name: string };

const LOG_CHANNELS = [
  ["discordPurchaseLogChannelId", "구매 로그"],
  ["discordReviewLogChannelId", "후기 로그"],
  ["discordRestockLogChannelId", "입고 로그"],
  ["discordChargeLogChannelId", "충전 로그"],
  ["discordRandomBoxLogChannelId", "랜덤박스 로그"],
  ["discordAdminLogChannelId", "관리 로그"],
  ["discordStockChannelId", "재고현황 채널"],
] as const;
type LogKey = (typeof LOG_CHANNELS)[number][0];
type Logs = Record<LogKey, string | null>;

type Payload = {
  channels: Channel[];
  channelsError: string | null;
  logs: Logs;
  shopBotReady: boolean;
  verifyBotReady: boolean;
  shopGuilds: Guild[];
  verifyGuilds: Guild[];
  selected: {
    shopGuildId: string | null;
    verifyGuildId: string | null;
    shopGuildName: string | null;
    verifyGuildName: string | null;
  };
  error?: string;
};

function GuildPicker({
  label,
  hint,
  guilds,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  guilds: Guild[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <section className="admin-bento p-5 sm:p-6">
      <h3 className="text-[17px] font-extrabold tracking-tight">{label}</h3>
      <p className="mb-4 mt-1 text-xs" style={{ color: "var(--ad-muted)" }}>
        {hint}
      </p>
      {!guilds.length ? (
        <p className="text-sm text-amber-300/90">봇이 들어간 서버가 없어요. 먼저 봇을 서버에 초대해 주세요.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {guilds.map((g) => {
            const on = value === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onChange(on ? null : g.id)}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                  on ? "border-white/40 bg-white/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                {g.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.iconUrl} alt="" className="size-9 rounded-lg" />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                    <Server className="size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{g.name}</span>
                  <span className="block truncate text-[11px] text-neutral-500">{g.id}</span>
                </span>
                {on ? <Check className="size-4 shrink-0 text-emerald-300" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function MfaDiscordPanel({ shopSlug }: { shopSlug: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [shopGuildId, setShopGuildId] = useState<string | null>(null);
  const [verifyGuildId, setVerifyGuildId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Partial<Logs>>({});
  const [logBusy, setLogBusy] = useState(false);
  const [logMsg, setLogMsg] = useState<string | null>(null);
  const [logErr, setLogErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const api = useCallback(
    async (method: "GET" | "POST", body?: unknown) => {
      const res = await fetch("/api/admin/mfa-discord", {
        method,
        credentials: "include",
        headers: shopHeaders(shopSlug, body !== undefined),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok) throw new Error(json.error || `요청 실패 (${res.status})`);
      return json;
    },
    [shopSlug],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const json = await api("GET");
      setData(json);
      setLogs(json.logs ?? {});
      setShopGuildId(json.selected.shopGuildId);
      setVerifyGuildId(json.selected.verifyGuildId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAndSync() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const json = await api("POST", { action: "save", shopGuildId, verifyGuildId });
      setData(json);
      setLogs(json.logs ?? {});
      setShopGuildId(json.selected.shopGuildId);
      setVerifyGuildId(json.selected.verifyGuildId);
      setMsg("서버를 저장하고 명령어를 동기화했어요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function saveLogs() {
    setLogBusy(true);
    setLogMsg(null);
    setLogErr(null);
    try {
      const payload = Object.fromEntries(LOG_CHANNELS.map(([key]) => [key, logs[key] || null]));
      const json = await api("POST", { action: "logs", logs: payload });
      setData(json);
      setLogs(json.logs ?? {});
      setLogMsg("로그 채널을 저장했어요.");
    } catch (e) {
      setLogErr(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setLogBusy(false);
    }
  }

  async function syncOnly() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const json = await api("POST", { action: "sync" });
      setData(json);
      setMsg("명령어를 다시 동기화했어요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5 px-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Discord 서버</h2>
          <p className="mt-1 text-xs text-neutral-400">
            DOES 봇이 들어가 있는 서버 중에서 자판기용·인증용을 고르세요. 저장하면 그 서버에 명령어가 등록됩니다.
          </p>
        </div>
        <button type="button" className="admin-icon-btn" onClick={() => void load()} title="새로고침">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {data && !data.shopBotReady && !data.verifyBotReady ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          봇 토큰이 아직 없어요. 플랫폼 Discord 봇 시크릿이 워커에 있는지 확인해 주세요.
        </p>
      ) : null}

      <GuildPicker
        label="자판기 서버"
        hint="포인트 구매·충전 명령(/자판기, /충전)을 쓸 서버"
        guilds={data?.shopGuilds ?? []}
        value={shopGuildId}
        onChange={setShopGuildId}
      />
      <GuildPicker
        label="인증 서버"
        hint="입장 인증·IP 기록 명령(/인증)을 쓸 서버. 자판기와 같아도 됩니다."
        guilds={data?.verifyGuilds ?? []}
        value={verifyGuildId}
        onChange={setVerifyGuildId}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveAndSync()}
          className="admin-btn inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          저장하고 명령어 동기화
        </button>
        <button
          type="button"
          disabled={busy || (!shopGuildId && !verifyGuildId)}
          onClick={() => void syncOnly()}
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          명령어만 다시 동기화
        </button>
      </div>
      {msg ? <p className="text-sm text-emerald-300">{msg}</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <section className="admin-bento p-5 sm:p-6">
        <h3 className="text-[17px] font-extrabold tracking-tight">로그 채널</h3>
        <p className="mb-4 mt-1 text-xs" style={{ color: "var(--ad-muted)" }}>
          자판기 서버의 채널 중에서 구매·후기·입고 로그를 받을 채널을 고르세요. 비워 두면 그 로그는 보내지 않아요.
        </p>
        {data?.channelsError ? (
          <p className="mb-3 text-sm text-amber-300/90">{data.channelsError}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {LOG_CHANNELS.map(([key, label]) => {
            const value = logs[key] ?? "";
            const channels = data?.channels ?? [];
            return (
              <label key={key} className="block">
                <span className="mb-1.5 block text-xs font-semibold text-neutral-300">{label}</span>
                <select
                  value={value}
                  onChange={(e) => setLogs((prev) => ({ ...prev, [key]: e.target.value || null }))}
                  disabled={!channels.length}
                  className="toss-admin-field w-full"
                >
                  <option value="">보내지 않음</option>
                  {value && !channels.some((c) => c.id === value) ? (
                    <option value={value}>#{value} (저장된 값)</option>
                  ) : null}
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      #{ch.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={logBusy || !data?.channels.length}
            onClick={() => void saveLogs()}
            className="admin-btn inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            {logBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            로그 채널 저장
          </button>
          {logMsg ? <span className="text-sm text-emerald-300">{logMsg}</span> : null}
          {logErr ? <span className="text-sm text-red-400">{logErr}</span> : null}
        </div>
      </section>
    </div>
  );
}
