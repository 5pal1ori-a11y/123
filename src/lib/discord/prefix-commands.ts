/**
 * DOES Auto — 채팅에 `!명령어` 를 쓰면 바로 처리하는 관리 명령.
 * 게이트웨이(StatusWatch)가 `!` 로 시작하는 메시지를 /api/discord/server-status (op: prefix) 로 넘긴다.
 * 명령을 쓴 사람의 실제 서버 권한과 역할 순서를 확인한 뒤에만 실행한다.
 */
import { appEmoji } from "@/lib/discord/app-emojis";
import { container, MessageFlags, separator, textDisplay } from "@/lib/discord/components";
import { doesDiscordEnvAsync } from "@/lib/discord/does-env";

const API = "https://discord.com/api/v10";

const P = {
  KICK: BigInt(1) << BigInt(1),
  BAN: BigInt(1) << BigInt(2),
  ADMIN: BigInt(1) << BigInt(3),
  MANAGE_CHANNELS: BigInt(1) << BigInt(4),
  MANAGE_GUILD: BigInt(1) << BigInt(5),
  MANAGE_NICKNAMES: BigInt(1) << BigInt(27),
  MODERATE: BigInt(1) << BigInt(40),
};

type Role = { id: string; position: number; permissions: string };
type Guild = { id: string; owner_id: string; roles: Role[] };
type Member = { user?: { id: string; username?: string }; roles: string[]; nick?: string | null };
type Channel = {
  id: string;
  type: number;
  name: string;
  topic?: string | null;
  nsfw?: boolean;
  position?: number;
  parent_id?: string | null;
  rate_limit_per_user?: number;
  bitrate?: number;
  user_limit?: number;
  rtc_region?: string | null;
  video_quality_mode?: number;
  default_auto_archive_duration?: number;
  default_thread_rate_limit_per_user?: number;
  available_tags?: unknown[];
  default_reaction_emoji?: unknown;
  default_sort_order?: number | null;
  default_forum_layout?: number;
  permission_overwrites?: unknown[];
};

export type PrefixInput = { guildId: string; channelId: string; messageId: string; userId: string; content: string };
/** 상점 설정의 관리자 역할 (없으면 서버 관리자 권한만) */
export type PrefixOptions = { adminRoleId?: string | null };

type Api = (method: string, path: string, body?: unknown, reason?: string) => Promise<{ ok: boolean; status: number; json: unknown }>;

function makeApi(token: string): Api {
  return async (method, path, body, reason) => {
    const headers: Record<string, string> = { Authorization: `Bot ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (reason) headers["X-Audit-Log-Reason"] = encodeURIComponent(reason.slice(0, 400));
    const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  };
}

/* ───────── 명령 목록 ───────── */

type Cmd = { names: string[]; usage: string; desc: string; perm: bigint; permLabel: string };
const COMMANDS: Cmd[] = [
  { names: ["명령어", "도움말", "help"], usage: "!명령어", desc: "명령어 목록을 보여 줘요", perm: BigInt(0), permLabel: "" },
  { names: ["채널명변경"], usage: "!채널명변경 <새 이름>", desc: "지금 채널 이름을 바꿔요", perm: P.MANAGE_CHANNELS, permLabel: "채널 관리" },
  { names: ["밴"], usage: "!밴 <@유저|ID> [사유]", desc: "유저를 서버에서 차단해요", perm: P.BAN, permLabel: "멤버 차단" },
  { names: ["언밴"], usage: "!언밴 <유저ID>", desc: "차단을 풀어요", perm: P.BAN, permLabel: "멤버 차단" },
  { names: ["킥"], usage: "!킥 <@유저|ID> [사유]", desc: "유저를 서버에서 내보내요", perm: P.KICK, permLabel: "멤버 추방" },
  { names: ["타임아웃"], usage: "!타임아웃 <@유저|ID> <시간> [사유]", desc: "시간: 30초 · 10분 · 2시간 · 1일 (숫자만 쓰면 분, 0 이면 해제)", perm: P.MODERATE, permLabel: "멤버 타임아웃" },
  { names: ["이름변경", "닉변"], usage: "!이름변경 <@유저|ID> <새 이름>", desc: "유저의 서버 별명을 바꿔요 (이름을 비우면 초기화)", perm: P.MANAGE_NICKNAMES, permLabel: "별명 관리" },
  { names: ["채널복제"], usage: "!채널복제 <채널ID|#채널>", desc: "채널을 설정·권한 그대로 하나 더 만들어요", perm: P.MANAGE_CHANNELS, permLabel: "채널 관리" },
  { names: ["카테고리복제"], usage: "!카테고리복제 <카테고리ID>", desc: "카테고리와 안의 채널을 통째로 복제해요", perm: P.MANAGE_CHANNELS, permLabel: "채널 관리" },
];

function findCmd(name: string) {
  return COMMANDS.find((c) => c.names.includes(name));
}

/* ───────── 답장 ───────── */

const GREEN = 0x22c55e;
const RED = 0xef4444;
const BLUE = 0x6366f1;

function reply(api: Api, input: PrefixInput, title: string, body: string, color: number) {
  return api("POST", `/channels/${input.channelId}/messages`, {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [container([textDisplay(`### ${title}`), ...(body ? [textDisplay(body)] : []), textDisplay("-# DOES Auto")], color)],
    message_reference: { message_id: input.messageId, fail_if_not_exists: false },
    allowed_mentions: { parse: [] },
  });
}
const ok = (api: Api, input: PrefixInput, title: string, body = "") => reply(api, input, `${appEmoji("does_check")} ${title}`, body, GREEN);
const fail = (api: Api, input: PrefixInput, title: string, body = "") => reply(api, input, `${appEmoji("does_cross")} ${title}`, body, RED);

function helpPanel(api: Api, input: PrefixInput) {
  const lines = COMMANDS.map((c) => `**\`${c.usage}\`**\n${c.desc}`);
  return api("POST", `/channels/${input.channelId}/messages`, {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          textDisplay(`## ${appEmoji("does_robot")} DOES Auto 명령어`),
          textDisplay("채팅창에 아래처럼 입력하면 바로 실행돼요."),
          separator(true, 1),
          textDisplay(lines.join("\n\n")),
          separator(true, 1),
          textDisplay("-# 관리자만 쓸 수 있어요 · 자기보다 높은 역할의 멤버에게는 쓸 수 없어요 · 실행 기록은 서버 감사 로그에 남아요"),
        ],
        BLUE,
      ),
    ],
    message_reference: { message_id: input.messageId, fail_if_not_exists: false },
    allowed_mentions: { parse: [] },
  });
}

/* ───────── 권한 ───────── */

function permsOf(guild: Guild, member: Member) {
  if (member.user?.id === guild.owner_id) return { perms: ~BigInt(0), top: Number.MAX_SAFE_INTEGER };
  let perms = BigInt(0);
  let top = 0;
  for (const r of guild.roles) {
    if (r.id === guild.id || member.roles.includes(r.id)) {
      perms |= BigInt(r.permissions);
      if (r.id !== guild.id) top = Math.max(top, r.position);
    }
  }
  if (perms & P.ADMIN) perms = ~BigInt(0);
  return { perms, top };
}

function parseUserId(arg: string | undefined) {
  const m = /^<@!?(\d{15,25})>$/.exec(arg ?? "") ?? /^(\d{15,25})$/.exec(arg ?? "");
  return m ? m[1] : null;
}
function parseChannelId(arg: string | undefined) {
  const m = /^<#(\d{15,25})>$/.exec(arg ?? "") ?? /^(\d{15,25})$/.exec(arg ?? "");
  return m ? m[1] : null;
}

/** "10분" "2h" "1일" "30" → 밀리초 (숫자만이면 분). 0 이면 해제 */
function parseDuration(arg: string | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(s|초|m|분|h|시간|d|일|w|주)?$/i.exec((arg ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "분").toLowerCase();
  const k = unit === "s" || unit === "초" ? 1e3 : unit === "h" || unit === "시간" ? 3.6e6 : unit === "d" || unit === "일" ? 8.64e7 : unit === "w" || unit === "주" ? 6.048e8 : 6e4;
  return Math.round(n * k);
}
function durationText(ms: number) {
  if (ms % 8.64e7 === 0) return `${ms / 8.64e7}일`;
  if (ms % 3.6e6 === 0) return `${ms / 3.6e6}시간`;
  if (ms % 6e4 === 0) return `${ms / 6e4}분`;
  return `${Math.round(ms / 1e3)}초`;
}

function errText(r: { status: number; json: unknown }) {
  const msg = (r.json as { message?: string } | null)?.message ?? "";
  if (r.status === 403) return "봇 권한이 부족하거나, 봇 역할이 대상보다 낮아요. 서버 설정 › 역할에서 DOES 봇 역할을 위로 올려 주세요.";
  if (r.status === 404) return "대상을 찾지 못했어요.";
  if (r.status === 429) return "요청이 너무 많아요. 잠시 뒤 다시 해 주세요.";
  return `디스코드 오류 (${r.status}${msg ? ` · ${msg}` : ""})`;
}

/* ───────── 채널 복제 ───────── */

function cloneBody(c: Channel, overrides: Partial<Channel> = {}) {
  const body: Record<string, unknown> = {
    name: c.name,
    type: c.type,
    topic: c.topic ?? undefined,
    nsfw: c.nsfw,
    parent_id: c.parent_id ?? undefined,
    rate_limit_per_user: c.rate_limit_per_user,
    bitrate: c.bitrate,
    user_limit: c.user_limit,
    rtc_region: c.rtc_region ?? undefined,
    video_quality_mode: c.video_quality_mode,
    default_auto_archive_duration: c.default_auto_archive_duration,
    default_thread_rate_limit_per_user: c.default_thread_rate_limit_per_user,
    available_tags: c.available_tags,
    default_reaction_emoji: c.default_reaction_emoji ?? undefined,
    default_sort_order: c.default_sort_order ?? undefined,
    default_forum_layout: c.default_forum_layout,
    permission_overwrites: c.permission_overwrites,
    position: typeof c.position === "number" ? c.position + 1 : undefined,
    ...overrides,
  };
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
}

/* ───────── 실행 ───────── */

export async function handlePrefixCommand(input: PrefixInput, opts: PrefixOptions = {}) {
  const text = input.content.trim();
  if (!text.startsWith("!")) return { skipped: "not command" };
  const [rawName, ...args] = text.slice(1).trim().split(/\s+/);
  const cmd = findCmd(rawName ?? "");
  if (!cmd) return { skipped: "unknown" };

  const token = (await doesDiscordEnvAsync()).botToken;
  if (!token) return { error: "no token" };
  const api = makeApi(token);

  // 명령을 쓴 사람의 권한 · 역할 순서 — 관리자만 쓸 수 있다
  const [g, m] = await Promise.all([api("GET", `/guilds/${input.guildId}`), api("GET", `/guilds/${input.guildId}/members/${input.userId}`)]);
  if (!g.ok || !m.ok) {
    await fail(api, input, "권한을 확인하지 못했어요", errText(g.ok ? m : g));
    return { error: "perm lookup" };
  }
  const guild = g.json as Guild;
  const me = permsOf(guild, m.json as Member);
  const member = m.json as Member;
  const isAdmin =
    Boolean(me.perms & P.ADMIN) ||
    Boolean(me.perms & P.MANAGE_GUILD) ||
    Boolean(opts.adminRoleId && member.roles.includes(opts.adminRoleId));
  if (!isAdmin) {
    await fail(api, input, "관리자만 쓸 수 있어요", "DOES Auto 명령어는 서버 관리자만 사용할 수 있어요.");
    return { denied: true };
  }
  if (cmd.names[0] === "명령어") {
    await helpPanel(api, input);
    return { ok: true };
  }
  const reasonTail = (from: number) => args.slice(from).join(" ").trim();
  const auditBy = (r: string) => `${r || "사유 없음"} · by ${input.userId} (DOES Auto)`;

  /** 대상 멤버가 나보다 낮은지 (주인·나 자신·봇 보호) */
  async function checkTarget(targetId: string, mustBeMember: boolean) {
    if (targetId === input.userId) return "자기 자신에게는 쓸 수 없어요.";
    if (targetId === guild.owner_id) return "서버 주인에게는 쓸 수 없어요.";
    const t = await api("GET", `/guilds/${input.guildId}/members/${targetId}`);
    if (!t.ok) return mustBeMember ? "서버에 없는 유저예요." : null;
    const target = permsOf(guild, t.json as Member);
    if (target.top >= me.top) return "나보다 높거나 같은 역할의 멤버에게는 쓸 수 없어요.";
    return null;
  }

  const name = cmd.names[0];

  if (name === "채널명변경") {
    const newName = args.join(" ").trim().slice(0, 100);
    if (!newName) return fail(api, input, "새 채널 이름을 적어 주세요", "`!채널명변경 새-이름`").then(() => ({ bad: true }));
    const r = await api("PATCH", `/channels/${input.channelId}`, { name: newName }, auditBy("채널명 변경"));
    if (!r.ok) return fail(api, input, "채널 이름을 못 바꿨어요", errText(r)).then(() => ({ error: r.status }));
    await ok(api, input, "채널 이름을 바꿨어요", `<#${input.channelId}> → **${(r.json as Channel).name}**\n-# 디스코드는 채널 이름 변경을 10분에 2번까지만 허용해요`);
    return { ok: true };
  }

  if (name === "밴" || name === "킥") {
    const target = parseUserId(args[0]);
    if (!target) return fail(api, input, "대상을 적어 주세요", `\`${cmd.usage}\``).then(() => ({ bad: true }));
    const blocked = await checkTarget(target, name === "킥");
    if (blocked) return fail(api, input, `${name} 할 수 없어요`, blocked).then(() => ({ denied: true }));
    const reason = reasonTail(1);
    const r =
      name === "밴"
        ? await api("PUT", `/guilds/${input.guildId}/bans/${target}`, { delete_message_seconds: 0 }, auditBy(reason))
        : await api("DELETE", `/guilds/${input.guildId}/members/${target}`, undefined, auditBy(reason));
    if (!r.ok) return fail(api, input, `${name} 하지 못했어요`, errText(r)).then(() => ({ error: r.status }));
    await ok(api, input, name === "밴" ? "차단했어요" : "내보냈어요", `<@${target}> (\`${target}\`)\n**사유** ${reason || "없음"}`);
    return { ok: true };
  }

  if (name === "언밴") {
    const target = parseUserId(args[0]);
    if (!target) return fail(api, input, "유저 ID를 적어 주세요", "`!언밴 123456789012345678`").then(() => ({ bad: true }));
    const r = await api("DELETE", `/guilds/${input.guildId}/bans/${target}`, undefined, auditBy(reasonTail(1)));
    if (!r.ok) return fail(api, input, "차단을 풀지 못했어요", r.status === 404 ? "차단된 유저가 아니에요." : errText(r)).then(() => ({ error: r.status }));
    await ok(api, input, "차단을 풀었어요", `<@${target}> (\`${target}\`)`);
    return { ok: true };
  }

  if (name === "타임아웃") {
    const target = parseUserId(args[0]);
    const ms = parseDuration(args[1]);
    if (!target || ms === null) return fail(api, input, "대상과 시간을 적어 주세요", `\`${cmd.usage}\`\n예) \`!타임아웃 @유저 10분 도배\``).then(() => ({ bad: true }));
    if (ms > 28 * 8.64e7) return fail(api, input, "타임아웃은 최대 28일이에요").then(() => ({ bad: true }));
    const blocked = await checkTarget(target, true);
    if (blocked) return fail(api, input, "타임아웃 할 수 없어요", blocked).then(() => ({ denied: true }));
    const until = ms > 0 ? new Date(Date.now() + ms).toISOString() : null;
    const reason = reasonTail(2);
    const r = await api("PATCH", `/guilds/${input.guildId}/members/${target}`, { communication_disabled_until: until }, auditBy(reason));
    if (!r.ok) return fail(api, input, "타임아웃 하지 못했어요", errText(r)).then(() => ({ error: r.status }));
    if (until) {
      const ts = Math.floor((Date.now() + ms) / 1000);
      await ok(api, input, `${durationText(ms)} 타임아웃했어요`, `<@${target}> · <t:${ts}:R> 풀려요 (<t:${ts}:f>)\n**사유** ${reason || "없음"}`);
    } else {
      await ok(api, input, "타임아웃을 풀었어요", `<@${target}>`);
    }
    return { ok: true };
  }

  if (name === "이름변경") {
    const target = parseUserId(args[0]);
    if (!target) return fail(api, input, "대상을 적어 주세요", `\`${cmd.usage}\``).then(() => ({ bad: true }));
    const nick = args.slice(1).join(" ").trim().slice(0, 32);
    if (target !== input.userId) {
      const blocked = await checkTarget(target, true);
      if (blocked) return fail(api, input, "이름을 바꿀 수 없어요", blocked).then(() => ({ denied: true }));
    }
    const r = await api("PATCH", `/guilds/${input.guildId}/members/${target}`, { nick: nick || null }, auditBy("이름 변경"));
    if (!r.ok) return fail(api, input, "이름을 못 바꿨어요", errText(r)).then(() => ({ error: r.status }));
    await ok(api, input, nick ? "이름을 바꿨어요" : "이름을 초기화했어요", nick ? `<@${target}> → **${nick}**` : `<@${target}>`);
    return { ok: true };
  }

  if (name === "채널복제") {
    const id = parseChannelId(args[0]) ?? input.channelId;
    const src = await api("GET", `/channels/${id}`);
    if (!src.ok) return fail(api, input, "채널을 찾지 못했어요", errText(src)).then(() => ({ error: src.status }));
    const ch = src.json as Channel & { guild_id?: string };
    if (ch.guild_id !== input.guildId) return fail(api, input, "이 서버의 채널이 아니에요").then(() => ({ bad: true }));
    if (ch.type === 4) return fail(api, input, "카테고리는 `!카테고리복제` 로 복제해 주세요").then(() => ({ bad: true }));
    const r = await api("POST", `/guilds/${input.guildId}/channels`, cloneBody(ch), auditBy("채널 복제"));
    if (!r.ok) return fail(api, input, "채널을 복제하지 못했어요", errText(r)).then(() => ({ error: r.status }));
    await ok(api, input, "채널을 복제했어요", `<#${ch.id}> → <#${(r.json as Channel).id}>\n-# 이름 · 주제 · 권한 · 슬로우모드가 그대로 복사돼요 (메시지는 복사되지 않아요)`);
    return { ok: true };
  }

  if (name === "카테고리복제") {
    const id = parseChannelId(args[0]);
    if (!id) return fail(api, input, "카테고리 ID를 적어 주세요", "`!카테고리복제 123456789012345678`\n-# 카테고리를 우클릭 › ID 복사").then(() => ({ bad: true }));
    const src = await api("GET", `/channels/${id}`);
    if (!src.ok) return fail(api, input, "카테고리를 찾지 못했어요", errText(src)).then(() => ({ error: src.status }));
    const cat = src.json as Channel & { guild_id?: string };
    if (cat.guild_id !== input.guildId || cat.type !== 4) return fail(api, input, "이 서버의 카테고리가 아니에요").then(() => ({ bad: true }));
    const all = await api("GET", `/guilds/${input.guildId}/channels`);
    const children = ((all.json as Channel[] | null) ?? []).filter((c) => c.parent_id === id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (children.length > 40) return fail(api, input, "채널이 너무 많아요", "한 번에 40개까지만 복제할 수 있어요.").then(() => ({ bad: true }));
    const made = await api("POST", `/guilds/${input.guildId}/channels`, cloneBody(cat), auditBy("카테고리 복제"));
    if (!made.ok) return fail(api, input, "카테고리를 복제하지 못했어요", errText(made)).then(() => ({ error: made.status }));
    const newCat = made.json as Channel;
    let copied = 0;
    const failed: string[] = [];
    for (const c of children) {
      const r = await api("POST", `/guilds/${input.guildId}/channels`, cloneBody(c, { parent_id: newCat.id, position: undefined }), auditBy("카테고리 복제"));
      if (r.ok) copied += 1;
      else {
        failed.push(c.name);
        if (r.status === 429) await new Promise((res) => setTimeout(res, 1500));
      }
    }
    await (failed.length ? fail : ok)(
      api,
      input,
      failed.length ? `일부만 복제했어요 (${copied}/${children.length})` : "카테고리를 복제했어요",
      `**${cat.name}** → **${newCat.name}** · 채널 ${copied}개${failed.length ? `\n못 만든 채널: ${failed.slice(0, 10).join(", ")}` : ""}`,
    );
    return { ok: true, copied, failed: failed.length };
  }

  return { skipped: "unhandled" };
}
