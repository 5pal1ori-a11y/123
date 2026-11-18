var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/src/state.js
import { DurableObject } from "cloudflare:workers";

// worker/src/discord.js
var API = "https://discord.com/api/v10";
var EPHEMERAL = 1 << 6;
var V2 = 1 << 15;
var V2_EPHEMERAL = V2 | EPHEMERAL;
var ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4 };
var ADMINISTRATOR = 1n << 3n;
var VIEW_CHANNEL = 1n << 10n;
var SEND_MESSAGES = 1n << 11n;
var MANAGE_CHANNELS = 1n << 4n;
var Perm = { ADMINISTRATOR, VIEW_CHANNEL, SEND_MESSAGES, MANAGE_CHANNELS };
var sleep = /* @__PURE__ */ __name((ms) => new Promise((r) => setTimeout(r, ms)), "sleep");
var DiscordError = class extends Error {
  static {
    __name(this, "DiscordError");
  }
  constructor(status, body, path) {
    super(`Discord API ${status} ${path}: ${body.slice(0, 300)}`);
    this.status = status;
  }
};
var DiscordApi = class {
  static {
    __name(this, "DiscordApi");
  }
  constructor(token, appId) {
    this.token = token;
    this.appId = appId;
  }
  async request(method, path, { body, files, auth = true } = {}, retried = false) {
    const headers = {};
    if (auth) headers.Authorization = `Bot ${this.token}`;
    let payload;
    if (files?.length) {
      const form = new FormData();
      form.append("payload_json", JSON.stringify({
        ...body,
        attachments: files.map((f, i) => ({ id: i, filename: f.name }))
      }));
      files.forEach((f, i) => form.append(`files[${i}]`, new Blob([f.data]), f.name));
      payload = form;
    } else if (body !== void 0) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(API + path, { method, headers, body: payload });
    if (res.status === 429 && !retried) {
      const info = await res.json().catch(() => ({}));
      await sleep(Math.ceil((info.retry_after ?? 1) * 1e3));
      return this.request(method, path, { body, files, auth }, true);
    }
    if (!res.ok) throw new DiscordError(res.status, await res.text(), path);
    if (res.status === 204) return null;
    return res.json();
  }
  get(path) {
    return this.request("GET", path);
  }
  post(path, body, files) {
    return this.request("POST", path, { body, files });
  }
  patch(path, body) {
    return this.request("PATCH", path, { body });
  }
  put(path, body) {
    return this.request("PUT", path, { body });
  }
  delete(path) {
    return this.request("DELETE", path);
  }
  sendMessage(channelId, body, files) {
    return this.post(`/channels/${channelId}/messages`, body, files);
  }
  editMessage(channelId, messageId, body) {
    return this.patch(`/channels/${channelId}/messages/${messageId}`, body);
  }
  async fetchMessage(channelId, messageId) {
    try {
      return await this.get(`/channels/${channelId}/messages/${messageId}`);
    } catch (err) {
      if (err.status === 404 || err.status === 403) return null;
      throw err;
    }
  }
  async dm(userId, body) {
    const channel = await this.post("/users/@me/channels", { recipient_id: userId });
    return this.sendMessage(channel.id, body);
  }
  // 인터랙션 웹훅(후속 응답)은 봇 토큰 없이 인터랙션 토큰으로 호출
  editOriginal(token, body, files) {
    return this.request("PATCH", `/webhooks/${this.appId}/${token}/messages/@original`, { body, files, auth: false });
  }
  deleteOriginal(token) {
    return this.request("DELETE", `/webhooks/${this.appId}/${token}/messages/@original`, { auth: false });
  }
  followUp(token, body, files) {
    return this.request("POST", `/webhooks/${this.appId}/${token}`, { body, files, auth: false });
  }
};
function panel() {
  return { type: 17, accent_color: 0, components: [] };
}
__name(panel, "panel");
function addText(container, content) {
  container.components.push({ type: 10, content });
  return container;
}
__name(addText, "addText");
function addDivider(container, large = false) {
  container.components.push({ type: 14, divider: true, spacing: large ? 2 : 1 });
  return container;
}
__name(addDivider, "addDivider");
function addButtonRow(container, ...buttons) {
  container.components.push(row(...buttons));
  return container;
}
__name(addButtonRow, "addButtonRow");
function addSection(container, texts, thumbnailUrl) {
  container.components.push({
    type: 9,
    components: texts.map((content) => ({ type: 10, content })),
    accessory: { type: 11, media: { url: thumbnailUrl } }
  });
  return container;
}
__name(addSection, "addSection");
function row(...components) {
  return { type: 1, components };
}
__name(row, "row");
function parseEmoji(e) {
  const m = /^<(a?):(\w+):(\d+)>$/.exec(e);
  return m ? { id: m[3], name: m[2], animated: m[1] === "a" } : { name: e };
}
function button({ customId, label, style = ButtonStyle.Secondary, emoji, disabled = false }) {
  const b = { type: 2, custom_id: customId, label, style, disabled };
  if (emoji) b.emoji = parseEmoji(emoji);
  return b;
}
__name(button, "button");
function stringSelect({ customId, placeholder, options, minValues, maxValues }) {
  const s = { type: 3, custom_id: customId, placeholder, options };
  if (minValues != null) s.min_values = minValues;
  if (maxValues != null) s.max_values = maxValues;
  return s;
}
__name(stringSelect, "stringSelect");
function userSelect({ customId, placeholder, minValues = 1, maxValues = 1 }) {
  return { type: 5, custom_id: customId, placeholder, min_values: minValues, max_values: maxValues };
}
__name(userSelect, "userSelect");
function selectOption({ label, value, emoji }) {
  const o = { label, value };
  if (emoji) o.emoji = parseEmoji(emoji);
  return o;
}
__name(selectOption, "selectOption");
function reply(data, ephemeral = false) {
  return { type: 4, data: { ...data, flags: (data.flags ?? 0) | (ephemeral ? EPHEMERAL : 0) } };
}
__name(reply, "reply");
function replyText(content, ephemeral = true) {
  return reply({ content }, ephemeral);
}
__name(replyText, "replyText");
function v2Reply(container, ephemeral = false) {
  return { type: 4, data: { components: [container], flags: ephemeral ? V2_EPHEMERAL : V2 } };
}
__name(v2Reply, "v2Reply");
function update(data) {
  return { type: 7, data };
}
__name(update, "update");
function deferReply(ephemeral = false) {
  return { type: 5, data: { flags: ephemeral ? EPHEMERAL : 0 } };
}
__name(deferReply, "deferReply");
function deferUpdate() {
  return { type: 6 };
}
__name(deferUpdate, "deferUpdate");
function modal(customId, title, inputs) {
  return {
    type: 9,
    data: {
      custom_id: customId,
      title,
      components: inputs.map((input) => row({ type: 4, style: 1, required: true, ...input }))
    }
  };
}
__name(modal, "modal");
function mention(userId) {
  return `<@${userId}>`;
}
__name(mention, "mention");
function displayName(user) {
  return user.global_name ?? user.username;
}
__name(displayName, "displayName");
function avatarUrl(user) {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}
__name(avatarUrl, "avatarUrl");

// worker/src/interaction.js
var Interaction = class {
  static {
    __name(this, "Interaction");
  }
  constructor(raw) {
    this.raw = raw;
  }
  get type() {
    return this.raw.type;
  }
  get token() {
    return this.raw.token;
  }
  get data() {
    return this.raw.data ?? {};
  }
  get user() {
    return this.raw.member?.user ?? this.raw.user;
  }
  get member() {
    return this.raw.member ?? null;
  }
  get guildId() {
    return this.raw.guild_id ?? null;
  }
  get channelId() {
    return this.raw.channel_id ?? this.raw.channel?.id ?? null;
  }
  get memberPermissions() {
    return BigInt(this.raw.member?.permissions ?? 0);
  }
  get isCommand() {
    return this.type === 2;
  }
  get isComponent() {
    return this.type === 3;
  }
  get isModalSubmit() {
    return this.type === 5;
  }
  get commandName() {
    return this.data.name;
  }
  get customId() {
    return this.data.custom_id;
  }
  get values() {
    return this.data.values ?? [];
  }
  subcommand() {
    const first = this.data.options?.[0];
    return first?.type === 1 ? first.name : null;
  }
  _options() {
    const opts = this.data.options ?? [];
    if (opts[0]?.type === 1) return opts[0].options ?? [];
    return opts;
  }
  _value(name) {
    return this._options().find((o) => o.name === name)?.value ?? null;
  }
  getString(name) {
    return this._value(name);
  }
  getInteger(name) {
    return this._value(name);
  }
  getNumber(name) {
    return this._value(name);
  }
  getBoolean(name) {
    return this._value(name);
  }
  getUser(name) {
    const id = this._value(name);
    return id ? this.data.resolved?.users?.[id] ?? { id, username: id } : null;
  }
  getChannel(name) {
    const id = this._value(name);
    return id ? this.data.resolved?.channels?.[id] ?? { id, name: id } : null;
  }
  getAttachment(name) {
    const id = this._value(name);
    return id ? this.data.resolved?.attachments?.[id] ?? null : null;
  }
  // 모달 입력값 (구형 ActionRow 형식과 신형 Label 형식 모두 지원)
  field(customId) {
    for (const top of this.data.components ?? []) {
      const inner = top.components ?? (top.component ? [top.component] : [top]);
      for (const c of inner) {
        if (c.custom_id === customId) return c.value ?? "";
      }
    }
    return "";
  }
};

// worker/src/constants.js
var LISTING_CATEGORIES = [
  { id: "og", label: "OG", emoji: "<:does_crown:1572032067946938528>" },
  { id: "3c", label: "3c/3l/3n", emoji: "<:does_key:1572035026592342047>" },
  { id: "semi", label: "Semi", emoji: "<a:does_star:1572044106958504038>" },
  { id: "bedwars", label: "Bedwars", emoji: "<:does_shield:1572035048461439076>" },
  { id: "skywars", label: "Skywars/Other Stat", emoji: "<:does_rocket:1572035045491744839>" }
];
var MINECRAFT_CAPES = [
  { id: "copper", label: "Copper", emoji: "<:cape_copper:1572038077822664764>" },
  { id: "pan", label: "Pan", emoji: "<:cape_pan:1572041102456782888>" },
  { id: "founders", label: "Founders", emoji: "<:cape_founders:1572044113061347398>" },
  { id: "common", label: "Common", emoji: "<:cape_common:1572047096901537914>" },
  { id: "mce", label: "MCE", emoji: "<:cape_mcexp:1572025985845436606>" },
  { id: "migrator", label: "Migrator", emoji: "<:cape_migratorcape:1572044115346989217>" },
  { id: "mojang", label: "Mojang", emoji: "<:cape_mojang:1572053169184178316>" },
  { id: "mojang_studios", label: "Mojang Studios", emoji: "<:cape_mojangstudios:1572053168198778983>" },
  { id: "cherry_blossom", label: "Cherry Blossom", emoji: "<:cape_cherry:1572041099848056875>" },
  { id: "purple_heart", label: "Purple Heart", emoji: "<:does_heart:1572032075241103421>" },
  { id: "yearn", label: "Yearn", emoji: "<:cape_yearn:1572047095224074271>" },
  { id: "follower", label: "Follower's", emoji: "<:does_user:1572038070528639147>" },
  { id: "vanquisher", label: "Vanquisher", emoji: "<:does_sword:1572038066539860090>" },
  { id: "home", label: "Home", emoji: "<:cape_home:1572038079311515800>" },
  { id: "menace", label: "Menace", emoji: "<:cape_menace:1572038080637050982>" },
  { id: "15th", label: "15th Anniversary", emoji: "<:cape_15a:1572047098302697607>" }
];
var LEADERBOARD_PAGE_SIZE = 10;
var categoryById = Object.fromEntries(LISTING_CATEGORIES.map((c) => [c.id, c]));
var capeById = Object.fromEntries(MINECRAFT_CAPES.map((c) => [c.id, c]));
var ADMIN_IDS = [];
var ROLE_BUTTONS = [
  { id: "1524035666738937926", label: "High Tier", emoji: "<:does_crown:1572032067946938528>" },
  { id: "1524035713614610622", label: "Semi/OGs", emoji: "<a:does_star:1572044106958504038>" },
  { id: "1524035742425419956", label: "Minecons", emoji: "<:does_ticket:1572044109877743697>" },
  { id: "1524035762935431219", label: "3c/3ls", emoji: "<:does_key:1572035026592342047>" },
  { id: "1524035791947563178", label: "Hypixel", emoji: "<:does_sword:1572038066539860090>" }
];
var CHECKIN_MIN = 1;
var CHECKIN_MAX = 100;
var JACKPOT_CHANCE = 1e-3;
var JACKPOT_AMOUNT = 1e3;
var SHOP_TICKET_COST = 50;
var USD_KRW = 1400;
// 출석 상점 상품 — kind: 이미지 아이콘 · points: 출석 포인트로 바로 지급 · gif: 예전 결과 GIF (이미지가 안 될 때)
var SHOP_PRIZES = [
  { name: "마크 계정", chance: 5e-4, kind: "mc", gif: "mc" },
  { name: "니트로", chance: 1e-3, kind: "nitro", gif: "nitro" },
  { name: "충전권", chance: 3e-3, kind: "charge", gif: "charge" },
  { name: "500P", chance: 5e-3, kind: "points", points: 500, gif: "charge" },
  { name: "100P", chance: 0.04, kind: "points", points: 100, gif: "charge" },
  { name: "50P", chance: 0.12, kind: "points", points: 50, gif: "charge" },
  { name: "20P", chance: 0.2, kind: "points", points: 20, gif: "charge" }
];

// worker/src/util.js
function todayKST(offsetMs = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + offsetMs));
}
__name(todayKST, "todayKST");
function isAdmin(interaction) {
  if (ADMIN_IDS.includes(interaction.user.id)) return true;
  return (interaction.memberPermissions & Perm.ADMINISTRATOR) === Perm.ADMINISTRATOR;
}
__name(isAdmin, "isAdmin");
function isStaff(interaction, state) {
  if (isAdmin(interaction)) return true;
  return state.getGuildSettings(interaction.guildId).owners.includes(interaction.user.id);
}
__name(isStaff, "isStaff");
function usd(n) {
  return "$" + Number(n).toLocaleString("en-US");
}
__name(usd, "usd");
function won(n) {
  return n.toLocaleString("ko-KR") + "\uC6D0";
}
__name(won, "won");
function pts(n) {
  return n.toLocaleString("ko-KR") + "P";
}
__name(pts, "pts");
async function resultGifUrl(state, payload) {
  const key = state.env?.DOES_FORWARD_KEY;
  if (!key) return null;
  try {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("gif4:" + payload)));
    const sig = [...mac.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `https://vendix.team/api/discord/gif/${payload}-${sig}.gif`;
  } catch {
    return null;
  }
}
__name(resultGifUrl, "resultGifUrl");
// 출석 상점 이미지 — vendix /api/discord/botimg 가 DOES_FORWARD_KEY 서명을 확인하고 그린다
async function botImageUrl(state, data) {
  const key = state.env?.DOES_FORWARD_KEY;
  if (!key) return null;
  try {
    const enc = new TextEncoder();
    let bin = "";
    for (const b of enc.encode(JSON.stringify(data))) bin += String.fromCharCode(b);
    const body = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (body.length > 1900) return null;
    const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("img1:" + body)));
    const sig = [...mac.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `https://doesmc.xyz/api/discord/botimg/${body}-${sig}.png`;
  } catch {
    return null;
  }
}
__name(botImageUrl, "botImageUrl");
function kstStamp() {
  const t = new Date(Date.now() + 9 * 36e5);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${p2(t.getUTCMonth() + 1)}.${p2(t.getUTCDate())} ${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}`;
}
__name(kstStamp, "kstStamp");
function shopPrizeTable() {
  return SHOP_PRIZES.map((p) => ({ name: p.name, kind: p.kind, pct: Math.round(p.chance * 1e5) / 1e3 }));
}
__name(shopPrizeTable, "shopPrizeTable");
function addGif(container, url) {
  if (url) container.components.push({ type: 12, items: [{ media: { url } }] });
  return container;
}
__name(addGif, "addGif");
function successPanel(title, body) {
  const c = panel();
  addText(c, `## ${title}`);
  addDivider(c);
  addText(c, body);
  return c;
}
__name(successPanel, "successPanel");
function listingLabel(listing) {
  return `${listing.hidden ? "<:does_lock:1572035032325951582>" : "<a:does_gem:1572041084727595088>"} ${listing.displayName}`;
}
__name(listingLabel, "listingLabel");
function newId(prefix = "") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
__name(newId, "newId");

// worker/src/leaderboard.js
function buildLeaderboardText(state, guildId, page = 0) {
  const settings = state.getGuildSettings(guildId);
  const hidden = new Set(settings.hiddenDealUsers ?? []);
  const totals = state.getDealTotals(guildId);
  const ranked = Object.entries(totals).filter(([userId]) => !hidden.has(userId) && !state.getUser(userId).dealHidden).sort((a, b) => b[1] - a[1]);
  const totalPages = Math.max(1, Math.ceil(ranked.length / LEADERBOARD_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = ranked.slice(safePage * LEADERBOARD_PAGE_SIZE, (safePage + 1) * LEADERBOARD_PAGE_SIZE);
  const medals = { 1: "<:does_crown:1572032067946938528>", 2: "<:does_trophy:1572038069165752320>", 3: "<:does_medal:1572035034754326718>" };
  const divider = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501";
  const lines = slice.length === 0 ? "\uC544\uC9C1 \uAC70\uB798 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." : slice.map(([userId, amount], i) => {
    const rank = safePage * LEADERBOARD_PAGE_SIZE + i + 1;
    const badge = medals[rank] ?? `**#${rank}**`;
    return `${badge}  <@${userId}>
\u2003\u27A5 ${won(amount)}`;
  }).join(`
${divider}
`);
  return { lines, page: safePage, totalPages, total: ranked.length };
}
__name(buildLeaderboardText, "buildLeaderboardText");
function buildLeaderboardMessage(state, guildId, page = 0) {
  const { lines, page: safePage, totalPages, total } = buildLeaderboardText(state, guildId, page);
  const embed = {
    title: "\u{1F3C6}  Top Clients",
    color: 15844367,
    description: lines,
    footer: { text: `${total} clients \xB7 Page ${safePage + 1}/${totalPages}` },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  const components = totalPages > 1 ? [row(
    button({ customId: `lb_prev_${guildId}_${safePage}`, label: "\u25C0", disabled: safePage <= 0 }),
    button({ customId: `lb_next_${guildId}_${safePage}`, label: "\u25B6", disabled: safePage >= totalPages - 1 })
  )] : [];
  return { embeds: [embed], components, allowed_mentions: { parse: [] } };
}
__name(buildLeaderboardMessage, "buildLeaderboardMessage");
async function refreshLeaderboard(state, guildId) {
  const settings = state.getGuildSettings(guildId);
  if (!settings.leaderboardChannelId) return;
  const message = buildLeaderboardMessage(state, guildId, 0);
  if (settings.leaderboardMessageId) {
    const existing = await state.api.fetchMessage(settings.leaderboardChannelId, settings.leaderboardMessageId);
    if (existing) {
      await state.api.editMessage(settings.leaderboardChannelId, existing.id, message);
      return;
    }
  }
  const sent = await state.api.sendMessage(settings.leaderboardChannelId, message);
  settings.leaderboardMessageId = sent.id;
  state.markDirty();
}
__name(refreshLeaderboard, "refreshLeaderboard");
function handleLeaderboardButton(interaction, state) {
  const [, , guildId, pageStr] = interaction.customId.split("_");
  const page = parseInt(pageStr, 10);
  const newPage = interaction.customId.startsWith("lb_prev_") ? page - 1 : page + 1;
  return update(buildLeaderboardMessage(state, guildId, newPage));
}
__name(handleLeaderboardButton, "handleLeaderboardButton");

// worker/src/roles.js
function buildRolesPanel() {
  return {
    embeds: [{
      title: "Roles",
      color: 5793266,
      description: "Click a role below to toggle it. Any role you already have will be removed instead."
    }],
    components: [row(...ROLE_BUTTONS.map((r) => button({ customId: `role_toggle_${r.id}`, label: r.label, emoji: r.emoji })))]
  };
}
__name(buildRolesPanel, "buildRolesPanel");
async function handleRolesPost(interaction, state) {
  const channelId = interaction.getChannel("\uCC44\uB110")?.id ?? interaction.channelId;
  await state.api.sendMessage(channelId, buildRolesPanel());
  return replyText(`\uC5ED\uD560 \uD328\uB110\uC744 <#${channelId}>\uC5D0 \uAC8C\uC2DC\uD588\uC2B5\uB2C8\uB2E4.`);
}
__name(handleRolesPost, "handleRolesPost");
async function handleRoleToggle(interaction, state) {
  const roleId = interaction.customId.slice("role_toggle_".length);
  const member = interaction.member;
  if (!member) return replyText("\uBA64\uBC84 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const hasRole = member.roles.includes(roleId);
  const path = `/guilds/${interaction.guildId}/members/${interaction.user.id}/roles/${roleId}`;
  try {
    if (hasRole) {
      await state.api.delete(path);
      return replyText(`<@&${roleId}> \uC5ED\uD560\uC744 **\uC81C\uAC70**\uD588\uC2B5\uB2C8\uB2E4.`);
    }
    await state.api.put(path);
    return replyText(`<@&${roleId}> \uC5ED\uD560\uC744 **\uCD94\uAC00**\uD588\uC2B5\uB2C8\uB2E4.`);
  } catch (err) {
    console.error("\uC5ED\uD560 \uD1A0\uAE00 \uC624\uB958:", err);
    if (err.status === 404) return replyText("\uC5ED\uD560\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC5ED\uD560 ID\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    return replyText("\uC5ED\uD560 \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uBD07\uC5D0 **\uC5ED\uD560 \uAD00\uB9AC** \uAD8C\uD55C\uC774 \uC788\uB294\uC9C0, \uBD07 \uC5ED\uD560\uC774 \uC774 \uC5ED\uD560\uBCF4\uB2E4 \uC704\uC5D0 \uC788\uB294\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  }
}
__name(handleRoleToggle, "handleRoleToggle");

// worker/src/mojang.js
var PROFILE_URL = "https://api.mojang.com/users/profiles/minecraft";
var SESSION_URL = "https://sessionserver.mojang.com/session/minecraft/profile";
async function lookupUsername(username) {
  const name = username.trim();
  if (!name || name.length > 16) return null;
  const res = await fetch(`${PROFILE_URL}/${encodeURIComponent(name)}`, {
    headers: { Accept: "application/json" }
  });
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error(`Mojang API error: ${res.status}`);
  const data = await res.json();
  return { uuid: data.id, name: data.name };
}
__name(lookupUsername, "lookupUsername");
async function fetchProfile(uuid) {
  const res = await fetch(`${SESSION_URL}/${uuid}?unsigned=false`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) return null;
  return res.json();
}
__name(fetchProfile, "fetchProfile");
function decodeTextures(profile) {
  const tex = profile?.properties?.find((p) => p.name === "textures");
  if (!tex?.value) return null;
  try {
    const bytes = Uint8Array.from(atob(tex.value), (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
__name(decodeTextures, "decodeTextures");
async function validateAccount(username) {
  const basic = await lookupUsername(username);
  if (!basic) return { valid: false, error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uB9C8\uC778\uD06C\uB798\uD504\uD2B8 \uB2C9\uB124\uC784\uC785\uB2C8\uB2E4." };
  let cape = null;
  try {
    const textures = decodeTextures(await fetchProfile(basic.uuid));
    if (textures?.textures?.CAPE?.url) {
      cape = textures.textures.CAPE.url.split("/").pop()?.replace(".png", "") ?? "Unknown";
    }
  } catch {
  }
  return { valid: true, uuid: basic.uuid, name: basic.name, cape };
}
__name(validateAccount, "validateAccount");

// worker/src/hypixel.js
var HYPIXEL_URL = "https://api.hypixel.net/v2/player";
async function fetchHypixelPlayer(uuid, apiKey) {
  if (!apiKey) {
    return { error: "Hypixel API \uD0A4\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.\n`npx wrangler secret put HYPIXEL_API_KEY` \uB85C \uD0A4\uB97C \uB4F1\uB85D\uD574 \uC8FC\uC138\uC694." };
  }
  const dashed = uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  const res = await fetch(`${HYPIXEL_URL}?uuid=${encodeURIComponent(dashed)}`, {
    headers: { "API-Key": apiKey, Accept: "application/json" }
  });
  if (res.status === 403) return { error: "Hypixel API \uD0A4\uAC00 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. HYPIXEL_API_KEY \uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694." };
  if (res.status === 429) return { error: "Hypixel API \uC694\uCCAD \uD55C\uB3C4 \uCD08\uACFC. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." };
  if (!res.ok) return { error: `Hypixel API \uC624\uB958 (${res.status})` };
  const data = await res.json();
  if (!data.success) return { error: data.cause ?? "Hypixel API \uC694\uCCAD \uC2E4\uD328" };
  if (!data.player) return { error: "Hypixel\uC5D0 \uD50C\uB808\uC774 \uAE30\uB85D\uC774 \uC5C6\uB294 \uACC4\uC815\uC785\uB2C8\uB2E4." };
  return { player: data.player };
}
__name(fetchHypixelPlayer, "fetchHypixelPlayer");
function networkLevel(exp = 0) {
  return Math.floor(Math.sqrt(2 * exp + 30625) / 50 - 2.5);
}
__name(networkLevel, "networkLevel");
function bedwarsStarFromExp(exp = 0) {
  const perPrestige = [500, 1e3, 2e3, 3500, 5500, 9e3, 15e3, 25e3, 5e4, 1e5];
  let level = 0;
  let remaining = exp;
  for (let prestige = 0; prestige < 5; prestige++) {
    for (const req of perPrestige) {
      if (remaining >= req) {
        remaining -= req;
        level++;
      } else {
        return prestige * 100 + level;
      }
    }
    level = (prestige + 1) * 100;
    remaining = exp - 487e3 * (prestige + 1);
    if (remaining < 0) return prestige * 100 + 10;
  }
  return level;
}
__name(bedwarsStarFromExp, "bedwarsStarFromExp");
function skywarsLevelFromExp(exp = 0) {
  const tiers = [20, 70, 150, 250, 500, 1e3, 2e3, 3500, 6e3, 1e4, 15e3, 2e4, 25e3, 3e4, 35e3, 4e4, 45e3, 5e4, 55e3, 6e4];
  let level = 0;
  let total = 0;
  for (const t of tiers) {
    total += t;
    if (exp >= total) level++;
    else break;
  }
  return level;
}
__name(skywarsLevelFromExp, "skywarsLevelFromExp");
function pitLevelFromXp(xp = 0) {
  if (xp <= 0) return 0;
  return Math.floor((Math.sqrt(xp + 15312.5) - 62.5) / 50);
}
__name(pitLevelFromXp, "pitLevelFromXp");
function ratio(kills, deaths, digits = 2) {
  if (!deaths) return kills > 0 ? kills.toFixed(digits) : "0.00";
  return (kills / deaths).toFixed(digits);
}
__name(ratio, "ratio");
function formatRank(player) {
  if (player.rank && !["NONE", "NORMAL", "DEFAULT"].includes(player.rank)) {
    return player.rank.replace(/_/g, " ");
  }
  const monthly = player.monthlyPackageRank;
  const pkg = player.newPackageRank ?? player.packageRank ?? "NONE";
  if (monthly && monthly !== "NONE") return `${monthly.replace(/_/g, " ")} (Monthly)`;
  if (pkg && pkg !== "NONE") return pkg.replace(/_/g, " ");
  return "None";
}
__name(formatRank, "formatRank");
function parsePlayerStats(player) {
  const achievements = player.achievements ?? {};
  const stats = player.stats ?? {};
  const bw = stats.Bedwars ?? {};
  const sw = stats.SkyWars ?? {};
  const pit = stats.Pit?.pit_stats_pt ?? stats.Pit ?? {};
  const bwExp = bw.Experience ?? 0;
  const swExp = sw.skywars_experience ?? 0;
  const pitXp = pit.total_xp ?? pit.xp ?? 0;
  const netExp = player.networkExp ?? player.networkExperience ?? 0;
  return {
    username: player.displayname ?? player.playername,
    uuid: player.uuid,
    networkLevel: networkLevel(netExp),
    rank: formatRank(player),
    gifted: player.giftedPremium === true,
    giftsGiven: player.giftingMeta?.rankGiftsGiven ?? 0,
    firstLogin: player.firstLogin ?? null,
    lastLogin: player.lastLogin ?? null,
    bedwars: {
      star: achievements.bedwars_level ?? bedwarsStarFromExp(bwExp),
      fkdr: ratio(bw.final_kills_bedwars ?? 0, bw.final_deaths_bedwars ?? 0),
      wins: bw.wins_bedwars ?? 0,
      losses: bw.losses_bedwars ?? 0,
      wlr: ratio(bw.wins_bedwars ?? 0, bw.losses_bedwars ?? 0),
      bedsBroken: bw.beds_broken_bedwars ?? 0,
      exp: bwExp
    },
    skywars: {
      level: skywarsLevelFromExp(swExp),
      kdr: ratio(sw.kills ?? 0, sw.deaths ?? 0),
      wins: sw.wins ?? 0,
      kills: sw.kills ?? 0,
      exp: swExp
    },
    pit: {
      level: pitLevelFromXp(pitXp),
      prestige: pit.prestige ?? stats.Pit?.prestige ?? 0,
      kills: pit.kills ?? pit.total_kills ?? 0,
      deaths: pit.deaths ?? pit.total_deaths ?? 0,
      kdr: ratio(pit.kills ?? pit.total_kills ?? 0, pit.deaths ?? pit.total_deaths ?? 0),
      xp: pitXp
    },
    duels: {
      wins: stats.Duels?.wins ?? 0,
      losses: stats.Duels?.losses ?? 0,
      wlr: ratio(stats.Duels?.wins ?? 0, stats.Duels?.losses ?? 0)
    }
  };
}
__name(parsePlayerStats, "parsePlayerStats");
function formatShortStatLine(s) {
  const parts = [`${s.bedwars.star}\u2B50`, `${s.bedwars.fkdr}fkdr`, `${s.skywars.level}sg`];
  if (s.pit.prestige > 0 || s.pit.level > 0) parts.push(`P${s.pit.prestige} L${s.pit.level}`);
  if (s.rank !== "None") parts.push(s.rank.replace(/\s+/g, ""));
  return parts.join("-");
}
__name(formatShortStatLine, "formatShortStatLine");
function buildHypixelEmbed(s, uuid) {
  const fields = [
    {
      name: "Network",
      value: [`**Level:** ${s.networkLevel}`, `**Rank:** ${s.rank}`, `**Gifted Rank:** ${s.gifted ? "Yes" : "No"}`, `**Gifts Given:** ${s.giftsGiven}`].join("\n"),
      inline: true
    },
    {
      name: "Bedwars",
      value: [`**Star:** ${s.bedwars.star}\u2B50`, `**FKDR:** ${s.bedwars.fkdr}`, `**W/L:** ${s.bedwars.wins}/${s.bedwars.losses} (${s.bedwars.wlr})`, `**Beds Broken:** ${s.bedwars.bedsBroken}`].join("\n"),
      inline: true
    },
    {
      name: "SkyWars",
      value: [`**Level:** ${s.skywars.level}`, `**KDR:** ${s.skywars.kdr}`, `**Wins:** ${s.skywars.wins}`, `**Kills:** ${s.skywars.kills}`].join("\n"),
      inline: true
    },
    {
      name: "The Pit",
      value: [`**Prestige:** ${s.pit.prestige}`, `**Level:** ${s.pit.level}`, `**KDR:** ${s.pit.kdr}`, `**Kills:** ${s.pit.kills}`].join("\n"),
      inline: true
    },
    {
      name: "Duels",
      value: [`**W/L:** ${s.duels.wins}/${s.duels.losses}`, `**WLR:** ${s.duels.wlr}`].join("\n"),
      inline: true
    },
    { name: "Listing Format", value: `\`${formatShortStatLine(s)}\``, inline: false }
  ];
  if (s.lastLogin) {
    fields.push({ name: "Last Login", value: `<t:${Math.floor(s.lastLogin / 1e3)}:R>`, inline: true });
  }
  return {
    color: 16755200,
    title: `Hypixel Stats \u2014 ${s.username}`,
    url: `https://hypixel.net/player/${s.username}`,
    thumbnail: { url: `https://minotar.net/helm/${encodeURIComponent(s.username)}/100.png` },
    fields,
    footer: { text: `UUID ${uuid?.slice(0, 8)}\u2026` }
  };
}
__name(buildHypixelEmbed, "buildHypixelEmbed");
function hypixelFieldValue(s) {
  if (!s) return null;
  return [
    `**Network Lv:** ${s.networkLevel} \xB7 **Rank:** ${s.rank}`,
    `**Gifted:** ${s.gifted ? "Yes" : "No"} \xB7 **Gifts Given:** ${s.giftsGiven}`,
    `**Bedwars:** ${s.bedwars.star}\u2B50 \xB7 FKDR ${s.bedwars.fkdr} \xB7 W/L ${s.bedwars.wlr}`,
    `**SkyWars:** Lv ${s.skywars.level} \xB7 KDR ${s.skywars.kdr} \xB7 ${s.skywars.wins} wins`,
    `**Pit:** P${s.pit.prestige} L${s.pit.level} \xB7 KDR ${s.pit.kdr}`
  ].join("\n");
}
__name(hypixelFieldValue, "hypixelFieldValue");
async function getHypixelStats(username, apiKey) {
  const account = await lookupUsername(username);
  if (!account) return { error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uB9C8\uC778\uD06C\uB798\uD504\uD2B8 \uB2C9\uB124\uC784\uC785\uB2C8\uB2E4." };
  const result = await fetchHypixelPlayer(account.uuid, apiKey);
  if (result.error) return { error: result.error };
  const stats = parsePlayerStats(result.player);
  stats.username = account.name;
  stats.uuid = account.uuid;
  return {
    stats,
    embed: buildHypixelEmbed(stats, account.uuid),
    shortLine: formatShortStatLine(stats)
  };
}
__name(getHypixelStats, "getHypixelStats");

// worker/src/listings.js
function formatListingLine(listing) {
  const name = listing.hidden ? `<:does_lock:1572035032325951582> ${listing.displayName}` : listing.displayName;
  const priceParts = [];
  if (listing.co != null) priceParts.push(`C/O ${usd(listing.co)}`);
  if (listing.bin != null) priceParts.push(`BIN ${usd(listing.bin)}`);
  const price = priceParts.length ? priceParts.join(" \xB7 ") : "No current price";
  const owner = listing.hidden ? "" : ` \xB7 Owner <@${listing.ownerId}>`;
  return `<a:does_gem:1572041084727595088> # ${name} : ${price}${owner}`;
}
__name(formatListingLine, "formatListingLine");
function buildStockDescription(listings) {
  const byCategory = {};
  for (const listing of listings) {
    (byCategory[listing.category] ??= []).push(listing);
  }
  const parts = [];
  for (const [catId, items] of Object.entries(byCategory)) {
    const header = categoryById[catId] ? `**${categoryById[catId].label}**` : `**${catId}**`;
    parts.push(`${header}
${items.map(formatListingLine).join("\n")}`);
  }
  return parts.join("\n\n") || "\uC7AC\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
}
__name(buildStockDescription, "buildStockDescription");
function buildStockEmbed(listings, title = "Current Stock") {
  return {
    title,
    color: 5793266,
    description: buildStockDescription(listings),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(buildStockEmbed, "buildStockEmbed");
async function refreshAllStock(state, guildId) {
  const settings = state.getGuildSettings(guildId);
  if (!settings.stockChannelId) return;
  const listings = state.getGuildListings(guildId, { includeHidden: false });
  const message = { embeds: [buildStockEmbed(listings)], allowed_mentions: { parse: [] } };
  if (settings.stockMessageId) {
    const existing = await state.api.fetchMessage(settings.stockChannelId, settings.stockMessageId);
    if (existing) {
      await state.api.editMessage(settings.stockChannelId, existing.id, message);
      return;
    }
  }
  const sent = await state.api.sendMessage(settings.stockChannelId, message);
  settings.stockMessageId = sent.id;
  state.markDirty();
}
__name(refreshAllStock, "refreshAllStock");
function buildDisplayName(draft) {
  const parts = [];
  if (draft.username) parts.push(draft.username);
  if (draft.info) parts.push(draft.info);
  if (draft.capes?.length) parts.push(draft.capes.map((id) => capeById[id]?.label ?? id).join(","));
  return parts.join(" ") || "Unnamed Listing";
}
__name(buildDisplayName, "buildDisplayName");
function listingEmbed(listing, title) {
  const fields = [
    { name: "Category", value: categoryById[listing.category]?.label ?? listing.category, inline: true },
    { name: "Owner", value: listing.hidden ? "Hidden" : `<@${listing.ownerId}>`, inline: true },
    { name: "Minecraft", value: listing.username ? `\`${listing.username}\`` : "Not set", inline: true },
    { name: "Info", value: listing.info || "Not set" },
    { name: "Capes", value: listing.capes?.length ? listing.capes.map((id) => capeById[id]?.label ?? id).join(", ") : "None" },
    { name: "C/O", value: listing.co != null ? usd(listing.co) : "Not set", inline: true },
    { name: "BIN", value: listing.bin != null ? usd(listing.bin) : "Not set", inline: true }
  ];
  if (listing.proxyChannelId) fields.push({ name: "Proxy Channel", value: `<#${listing.proxyChannelId}>` });
  const hx = hypixelFieldValue(listing.hypixelStats);
  if (hx) fields.push({ name: "Hypixel Stats", value: hx });
  return { title, color: 5763719, fields };
}
__name(listingEmbed, "listingEmbed");
async function createListingChannel(state, guildId, draft, listingId) {
  const settings = state.getGuildSettings(guildId);
  const displayName2 = buildDisplayName(draft);
  const channelName = displayName2.toLowerCase().replace(/[^a-z0-9\-_]/g, "-").replace(/-+/g, "-").slice(0, 90) || `listing-${listingId.slice(-6)}`;
  const channel = await state.api.post(`/guilds/${guildId}/channels`, {
    name: channelName,
    type: 0,
    parent_id: settings.listingCategoryId ?? null,
    permission_overwrites: [
      { id: guildId, type: 0, deny: String(Perm.SEND_MESSAGES) },
      { id: state.api.appId, type: 1, allow: String(Perm.VIEW_CHANNEL | Perm.SEND_MESSAGES | Perm.MANAGE_CHANNELS) }
    ]
  });
  const embed = listingEmbed({ ...draft, hidden: false }, listingLabel({ displayName: displayName2, hidden: false }));
  await state.api.sendMessage(channel.id, { embeds: [embed], allowed_mentions: { parse: [] } });
  return channel;
}
__name(createListingChannel, "createListingChannel");
function finalizeListing(state, guildId, draft, channelId, createdBy) {
  const id = newId("lst_");
  const listing = {
    guildId,
    channelId,
    category: draft.category,
    ownerId: draft.ownerId,
    proxyChannelId: draft.proxyChannelId ?? null,
    capes: draft.capes ?? [],
    info: draft.info ?? "",
    username: draft.username ?? "",
    mcUuid: draft.mcUuid ?? null,
    co: draft.co ?? null,
    bin: draft.bin ?? null,
    displayName: buildDisplayName(draft),
    hypixelStats: draft.hypixelStats ?? null,
    hidden: false,
    createdAt: Date.now(),
    createdBy,
    offers: []
  };
  state.data.listings[id] = listing;
  state.markDirty();
  return { id, listing };
}
__name(finalizeListing, "finalizeListing");
async function notifyOffer(state, listing, amount, offererId) {
  const label = listingLabel(listing);
  await state.api.dm(listing.ownerId, { content: `Your account ${label} has a new offer of ${usd(amount)}.` }).catch(() => {
  });
  if (offererId && offererId !== listing.ownerId) {
    await state.api.dm(offererId, {
      content: `You placed an offer of ${usd(amount)} on ${label}. The owner has been notified.`
    }).catch(() => {
    });
  }
  if (listing.proxyChannelId) {
    await state.api.sendMessage(listing.proxyChannelId, {
      content: `<:does_megaphone:1572035037128564857> New offer on **${listing.displayName}**: ${usd(amount)} from <@${offererId}>`
    }).catch(() => {
    });
  }
}
__name(notifyOffer, "notifyOffer");
async function updateListingChannelEmbed(state, listing) {
  if (!listing.channelId) return;
  const message = { embeds: [listingEmbed(listing, listingLabel(listing))], allowed_mentions: { parse: [] } };
  const [last] = await state.api.get(`/channels/${listing.channelId}/messages?limit=1`).catch(() => []);
  if (last?.author?.id === state.api.appId) {
    await state.api.editMessage(listing.channelId, last.id, message).catch(() => {
    });
  } else {
    await state.api.sendMessage(listing.channelId, message).catch(() => {
    });
  }
}
__name(updateListingChannelEmbed, "updateListingChannelEmbed");

// worker/src/marketplace.js
var STAFF_ONLY = "\uC2A4\uD0DC\uD504\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
var ADMIN_ONLY = "\uAD00\uB9AC\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
var NO_LISTING = "\uB9AC\uC2A4\uD305 \uCC44\uB110\uC5D0\uC11C \uC2E4\uD589\uD558\uAC70\uB098 listing \uC635\uC158\uC744 \uC9C0\uC815\uD574 \uC8FC\uC138\uC694.";
function buildListingForm(draft) {
  const cat = LISTING_CATEGORIES.find((c) => c.id === draft.category);
  const capes = draft.capes?.length ? draft.capes.map((id) => MINECRAFT_CAPES.find((c) => c.id === id)?.label ?? id).join(", ") : "*None selected*";
  const embed = {
    title: "\u{1F4CB}  Create Listing",
    color: 5793266,
    description: "\uC544\uB798 \uBA54\uB274\uC640 \uBC84\uD2BC\uC73C\uB85C \uB9AC\uC2A4\uD305\uC744 \uAD6C\uC131\uD55C \uB4A4 **Finish** \uB97C \uB20C\uB7EC \uC8FC\uC138\uC694.",
    fields: [
      { name: "\u{1F4C1} Listing Type", value: cat ? `${cat.emoji ?? ""} **${cat.label}**` : "*Choose the category below*" },
      { name: "\u{1F464} Owner", value: draft.ownerId ? `<@${draft.ownerId}>` : "*Select the account owner*" },
      { name: "\u{1F517} Proxy Channel", value: draft.proxyChannelId ? `<#${draft.proxyChannelId}>` : "*None \u2014 owner is secure*" },
      { name: "\u{1F397}\uFE0F Capes", value: capes },
      { name: "\u{1F4DD} Info", value: draft.info ? draft.info : "*Not set*" },
      { name: "\u26CF\uFE0F Minecraft Username", value: draft.username ? `\`${draft.username}\`` : "*Not set*", inline: true },
      { name: "\u{1F4AC} C/O (Current Offer)", value: draft.co != null ? usd(draft.co) : "*Not set*", inline: true },
      { name: "\u{1F4B5} BIN (Buy It Now)", value: draft.bin != null ? usd(draft.bin) : "*Not set*", inline: true }
    ]
  };
  const components = [
    row(stringSelect({
      customId: "list_cat",
      placeholder: "\u{1F4C1} Choose the category for this listing",
      options: LISTING_CATEGORIES.map((c) => selectOption({ label: c.label, value: c.id, emoji: c.emoji }))
    })),
    row(userSelect({ customId: "list_owner", placeholder: "\u{1F464} Select the account owner" })),
    row(stringSelect({
      customId: "list_capes",
      placeholder: "\u{1F397}\uFE0F Select Capes",
      minValues: 0,
      maxValues: Math.min(MINECRAFT_CAPES.length, 25),
      options: MINECRAFT_CAPES.map((c) => selectOption({ label: c.label, value: c.id, emoji: c.emoji }))
    })),
    row(
      button({ customId: "list_set_info", label: "Set Info" }),
      button({ customId: "list_set_username", label: "Set Username" }),
      button({ customId: "list_set_co", label: "Set C/O" }),
      button({ customId: "list_set_bin", label: "Set BIN" }),
      button({ customId: "list_set_proxy", label: "Set Proxy" })
    ),
    row(
      button({ customId: "list_cancel", label: "Cancel", style: ButtonStyle.Danger }),
      button({ customId: "list_finish", label: "Finish", style: ButtonStyle.Success })
    )
  ];
  return { content: null, embeds: [embed], components, allowed_mentions: { parse: [] } };
}
__name(buildListingForm, "buildListingForm");
function finishListing(interaction, state) {
  const draft = state.getDraft(interaction.user.id);
  if (!draft.category) return replyText("\uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
  if (!draft.ownerId) return replyText("\uC624\uB108\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694. `/\uC124\uC815 \uC624\uB108\uCD94\uAC00`\uB85C \uC624\uB108\uB97C \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const token = interaction.token;
  state.later(async () => {
    const channel = await createListingChannel(state, guildId, draft, "pending");
    const { listing } = finalizeListing(state, guildId, draft, channel.id, userId);
    if (draft.proxyChannelId) {
      await state.api.sendMessage(draft.proxyChannelId, {
        content: `<:does_new:1572035039007342733> New listing: **${listing.displayName}** \xB7 Owner <@${listing.ownerId}>`
      }).catch(() => {
      });
    }
    await refreshAllStock(state, guildId);
    state.clearDraft(userId);
    await state.api.editOriginal(token, {
      content: `\u2705 Listing created: **${listing.displayName}** \u2192 <#${channel.id}>`,
      embeds: [],
      components: []
    });
  });
  return deferUpdate();
}
__name(finishListing, "finishListing");
function handleDeal(interaction, state) {
  if (!isStaff(interaction, state)) return replyText(STAFF_ONLY);
  const sub = interaction.subcommand();
  const guildId = interaction.guildId;
  if (sub === "add") {
    const user = interaction.getUser("\uC720\uC800");
    const amount = interaction.getNumber("\uAE08\uC561");
    const deal = {
      id: newId("deal_"),
      guildId,
      userId: user.id,
      amount,
      addedBy: interaction.user.id,
      timestamp: Date.now(),
      cancelled: false
    };
    state.data.deals.push(deal);
    state.markDirty();
    state.later(() => refreshLeaderboard(state, guildId));
    return v2Reply(successPanel("Success", `Added **${usd(amount)}** to <@${user.id}>.
Deal ID: \`${deal.id}\``), true);
  }
  if (sub === "cancel") {
    const user = interaction.getUser("\uC720\uC800");
    const amount = interaction.getNumber("\uAE08\uC561");
    const userDeals = [...state.data.deals].reverse().filter((d) => d.guildId === guildId && d.userId === user.id && !d.cancelled);
    const deal = amount != null ? userDeals.find((d) => d.amount === amount) : userDeals[0];
    if (!deal) {
      return replyText(amount != null ? `<@${user.id}> \uB2D8\uC758 ${usd(amount)} \uAC70\uB798\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` : `<@${user.id}> \uB2D8\uC758 \uCDE8\uC18C\uD560 \uAC70\uB798\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`);
    }
    deal.cancelled = true;
    state.markDirty();
    state.later(() => refreshLeaderboard(state, guildId));
    return v2Reply(successPanel("Cancelled", `Cancelled **${usd(deal.amount)}** deal for <@${user.id}>.`), true);
  }
  if (sub === "hidden") {
    const user = interaction.getUser("\uC720\uC800");
    const u = state.getUser(user.id);
    u.dealHidden = !u.dealHidden;
    state.markDirty();
    state.later(() => refreshLeaderboard(state, guildId));
    return v2Reply(successPanel(
      "Updated",
      `<@${user.id}> is now **${u.dealHidden ? "hidden" : "visible"}** on the leaderboard.`
    ), true);
  }
  if (sub === "setup") {
    if (!isAdmin(interaction)) return replyText(ADMIN_ONLY);
    const channel = interaction.getChannel("\uCC44\uB110");
    const settings = state.getGuildSettings(guildId);
    settings.leaderboardChannelId = channel.id;
    settings.leaderboardMessageId = null;
    state.markDirty();
    state.later(() => refreshLeaderboard(state, guildId));
    return replyText(`\uB9AC\uB354\uBCF4\uB4DC \uCC44\uB110: <#${channel.id}>`);
  }
}
__name(handleDeal, "handleDeal");
function handleList(interaction, state) {
  const sub = interaction.subcommand();
  if (sub === "create") {
    if (!isStaff(interaction, state)) return replyText(STAFF_ONLY);
    state.clearDraft(interaction.user.id);
    return reply(buildListingForm(state.getDraft(interaction.user.id)), true);
  }
  if (sub === "refresh") {
    if (!isAdmin(interaction)) return replyText(ADMIN_ONLY);
    const guildId = interaction.guildId;
    state.later(() => refreshAllStock(state, guildId));
    return replyText("\uC7AC\uACE0 \uC784\uBCA0\uB4DC\uAC00 \uC0C8\uB85C\uACE0\uCE68\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
  }
  if (sub === "mine") {
    const listings = state.getGuildListings(interaction.guildId, { ownerId: interaction.user.id, includeHidden: true });
    return reply({ embeds: [buildStockEmbed(listings, "OWNER-STOCK")], allowed_mentions: { parse: [] } }, true);
  }
  if (sub === "stats") {
    const username = interaction.getString("\uB2C9\uB124\uC784");
    const token = interaction.token;
    state.later(async () => {
      const result = await getHypixelStats(username, state.env.HYPIXEL_API_KEY);
      await state.api.editOriginal(token, result.error ? { content: result.error } : { embeds: [result.embed] });
    });
    return deferReply();
  }
}
__name(handleList, "handleList");
function resolveListing(interaction, state) {
  const channelId = interaction.getChannel("listing")?.id ?? interaction.channelId;
  return state.getListingByChannel(channelId);
}
__name(resolveListing, "resolveListing");
function handleOffer(interaction, state) {
  const amount = interaction.getNumber("amount");
  const offererId = interaction.getUser("offerer")?.id ?? interaction.user.id;
  const listing = resolveListing(interaction, state);
  if (!listing) return replyText(NO_LISTING);
  listing.co = amount;
  listing.offers.push({ amount, offererId, timestamp: Date.now() });
  state.markDirty();
  const guildId = interaction.guildId;
  state.later(async () => {
    await notifyOffer(state, listing, amount, offererId);
    await updateListingChannelEmbed(state, listing);
    await refreshAllStock(state, guildId);
  });
  return v2Reply(successPanel("Success", `Added offer **${usd(amount)}** to # ${listing.displayName}.`), true);
}
__name(handleOffer, "handleOffer");
function afterListingChange(state, guildId, listing) {
  state.later(async () => {
    await updateListingChannelEmbed(state, listing);
    await refreshAllStock(state, guildId);
  });
}
__name(afterListingChange, "afterListingChange");
function handleBin(interaction, state) {
  if (!isStaff(interaction, state)) return replyText(STAFF_ONLY);
  const amount = interaction.getNumber("amount");
  const listing = resolveListing(interaction, state);
  if (!listing) return replyText(NO_LISTING);
  listing.bin = amount;
  state.markDirty();
  afterListingChange(state, interaction.guildId, listing);
  return v2Reply(successPanel("Success", `BIN set to **${usd(amount)}** for # ${listing.displayName}.`), true);
}
__name(handleBin, "handleBin");
function handleEdit(interaction, state) {
  if (!isStaff(interaction, state)) return replyText(STAFF_ONLY);
  const sub = interaction.subcommand();
  const listing = resolveListing(interaction, state);
  if (!listing) return replyText(NO_LISTING);
  const guildId = interaction.guildId;
  if (sub === "info") {
    listing.info = interaction.getString("text");
    listing.displayName = buildDisplayName(listing);
    state.markDirty();
    afterListingChange(state, guildId, listing);
    return v2Reply(successPanel("Updated", "Info updated."), true);
  }
  if (sub === "username") {
    const name = interaction.getString("name");
    const token = interaction.token;
    state.later(async () => {
      const result = await validateAccount(name);
      if (!result.valid) {
        await state.api.editOriginal(token, { content: result.error });
        return;
      }
      listing.username = result.name;
      listing.mcUuid = result.uuid;
      const hypixel = await getHypixelStats(result.name, state.env.HYPIXEL_API_KEY);
      if (!hypixel.error) {
        listing.info = hypixel.shortLine;
        listing.hypixelStats = hypixel.stats;
      }
      listing.displayName = buildDisplayName(listing);
      state.markDirty();
      await updateListingChannelEmbed(state, listing);
      await refreshAllStock(state, guildId);
      const extra = hypixel.error ? `
\u26A0 Hypixel: ${hypixel.error}` : `
\`${hypixel.shortLine}\``;
      await state.api.editOriginal(token, {
        components: [successPanel("Updated", `Username set to **${result.name}**${extra}`)],
        flags: V2
      });
    });
    return deferReply(true);
  }
  if (sub === "hidden") {
    listing.hidden = interaction.getBoolean("hide");
    listing.displayName = buildDisplayName(listing);
    state.markDirty();
    afterListingChange(state, guildId, listing);
    return v2Reply(successPanel("Updated", `Listing is now **${listing.hidden ? "hidden" : "visible"}**.`), true);
  }
  if (sub === "proxy") {
    const channel = interaction.getChannel("channel");
    listing.proxyChannelId = channel?.id ?? null;
    state.markDirty();
    state.later(() => updateListingChannelEmbed(state, listing));
    return v2Reply(successPanel("Updated", channel ? `Proxy set to <#${channel.id}>` : "Proxy removed."), true);
  }
}
__name(handleEdit, "handleEdit");
function handleVoucher(interaction, state) {
  const target = interaction.getUser("\uC720\uC800") ?? interaction.user;
  const mentionCount = state.getVoucherData(interaction.guildId).counts[target.id] ?? 0;
  const user = state.getUser(target.id);
  const total = mentionCount + user.reviewCount;
  return reply({
    embeds: [{
      title: displayName(target),
      color: 5793266,
      thumbnail: { url: avatarUrl(target) },
      description: `Discord vouchers: **${total}**
Channel mentions: ${mentionCount} \xB7 Saved reviews: ${user.reviewCount}`
    }]
  }, true);
}
__name(handleVoucher, "handleVoucher");
function handleSettingsMarketplace(interaction, state) {
  const sub = interaction.subcommand();
  const guildId = interaction.guildId;
  const settings = state.getGuildSettings(guildId);
  if (sub === "\uBC14\uC6B0\uCC98\uCC44\uB110") {
    const channel = interaction.getChannel("\uCC44\uB110");
    state.getVoucherData(guildId).channelId = channel.id;
    state.markDirty();
    return replyText(`\uBC14\uC6B0\uCC98 \uCC44\uB110: <#${channel.id}>
-# \uD074\uB77C\uC6B0\uB4DC \uBC84\uC804\uC5D0\uC11C\uB294 \uCC44\uD305 \uBA58\uC158 \uC790\uB3D9 \uC9D1\uACC4\uAC00 \uB3D9\uC791\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
  }
  if (sub === "\uC7AC\uACE0\uCC44\uB110") {
    const channel = interaction.getChannel("\uCC44\uB110");
    settings.stockChannelId = channel.id;
    settings.stockMessageId = null;
    state.markDirty();
    state.later(() => refreshAllStock(state, guildId));
    return replyText(`\uC7AC\uACE0 \uCC44\uB110: <#${channel.id}>`);
  }
  if (sub === "\uC624\uB108\uC7AC\uACE0\uCC44\uB110") {
    const channel = interaction.getChannel("\uCC44\uB110");
    settings.ownerStockChannelId = channel.id;
    settings.ownerStockMessageId = null;
    state.markDirty();
    return replyText(`OWNER-STOCK \uCC44\uB110: <#${channel.id}>`);
  }
  if (sub === "\uB9AC\uC2A4\uD305\uCE74\uD14C\uACE0\uB9AC") {
    const cat = interaction.getChannel("\uCE74\uD14C\uACE0\uB9AC");
    settings.listingCategoryId = cat.id;
    state.markDirty();
    return replyText(`\uB9AC\uC2A4\uD305 \uCE74\uD14C\uACE0\uB9AC: ${cat.name}`);
  }
  if (sub === "\uC624\uB108\uCD94\uAC00") {
    const user = interaction.getUser("\uC720\uC800");
    if (!settings.owners.includes(user.id)) settings.owners.push(user.id);
    state.markDirty();
    return replyText(`<@${user.id}> added to owners list.`);
  }
  if (sub === "\uC624\uB108\uC81C\uAC70") {
    const user = interaction.getUser("\uC720\uC800");
    settings.owners = settings.owners.filter((id) => id !== user.id);
    state.markDirty();
    return replyText(`<@${user.id}> removed from owners list.`);
  }
}
__name(handleSettingsMarketplace, "handleSettingsMarketplace");
async function downloadFile(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`\uCCA8\uBD80\uD30C\uC77C \uB2E4\uC6B4\uB85C\uB4DC \uC2E4\uD328 (${res.status})`);
  return { name, data: await res.arrayBuffer() };
}
__name(downloadFile, "downloadFile");
async function sendSay(state, channelId, { content, asPanel, attachmentUrl, attachmentName }) {
  const files = attachmentUrl ? [await downloadFile(attachmentUrl, attachmentName)] : [];
  if (asPanel && content) {
    const c = panel();
    addText(c, content);
    await state.api.sendMessage(channelId, { components: [c], flags: V2 }, files);
  } else {
    await state.api.sendMessage(channelId, { content: content || void 0 }, files);
  }
}
__name(sendSay, "sendSay");
function handleSay(interaction, state) {
  if (!isAdmin(interaction)) return replyText(ADMIN_ONLY);
  const content = interaction.getString("\uB0B4\uC6A9");
  const channelId = interaction.getChannel("\uCC44\uB110")?.id ?? interaction.channelId;
  const attachment = interaction.getAttachment("\uD30C\uC77C");
  const asPanel = interaction.getBoolean("\uC784\uBCA0\uB4DC") ?? false;
  const pending = {
    channelId,
    attachmentUrl: attachment?.url,
    attachmentName: attachment?.filename,
    asPanel
  };
  if (!content && !attachment) {
    state.temp.sayPending[interaction.user.id] = pending;
    state.markDirty();
    return modal("say_modal", "Message Sender", [{
      custom_id: "say_content",
      label: "What the bot should say",
      style: 2,
      placeholder: "I am a bot!",
      required: false
    }]);
  }
  const token = interaction.token;
  state.later(async () => {
    await sendSay(state, channelId, { ...pending, content });
    await state.api.editOriginal(token, { content: content ? `Sent to <#${channelId}>` : `\uD30C\uC77C\uC744 <#${channelId}>\uC5D0 \uC804\uC1A1\uD588\uC2B5\uB2C8\uB2E4.` });
  });
  return deferReply(true);
}
__name(handleSay, "handleSay");
function handleSayModal(interaction, state) {
  const pending = state.temp.sayPending[interaction.user.id];
  if (!pending) return replyText("Session expired. Run /say again.");
  delete state.temp.sayPending[interaction.user.id];
  state.markDirty();
  const content = interaction.field("say_content");
  if (!content && !pending.attachmentUrl) return replyText("\uBCF4\uB0BC \uB0B4\uC6A9\uC774\uB098 \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const token = interaction.token;
  state.later(async () => {
    await sendSay(state, pending.channelId, { ...pending, content });
    await state.api.editOriginal(token, { content: `Sent to <#${pending.channelId}>` });
  });
  return deferReply(true);
}
__name(handleSayModal, "handleSayModal");
function handleListingSelect(interaction, state) {
  const draft = state.getDraft(interaction.user.id);
  const { customId, values } = interaction;
  if (customId === "list_cat") draft.category = values[0];
  else if (customId === "list_owner") draft.ownerId = values[0];
  else if (customId === "list_capes") draft.capes = values;
  return update(buildListingForm(draft));
}
__name(handleListingSelect, "handleListingSelect");
async function handleListingButton(interaction, state) {
  const { customId } = interaction;
  if (customId === "list_cancel") {
    state.clearDraft(interaction.user.id);
    return update({ content: "Listing creation cancelled.", embeds: [], components: [] });
  }
  if (customId === "list_set_proxy") {
    const channels = (await state.api.get(`/guilds/${interaction.guildId}/channels`)).filter((ch) => ch.type === 0 || ch.type === 5).slice(0, 24);
    if (channels.length === 0) return replyText("\uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uD14D\uC2A4\uD2B8 \uCC44\uB110\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return reply({
      content: "\uD504\uB85D\uC2DC \uCC44\uB110\uC744 \uC120\uD0DD\uD558\uC138\uC694:",
      components: [row(stringSelect({
        customId: "list_proxy",
        placeholder: "Select proxy channel",
        options: [
          { label: "None", value: "none" },
          ...channels.map((ch) => ({ label: ch.name.slice(0, 100), value: ch.id }))
        ]
      }))]
    }, true);
  }
  if (customId === "list_finish") return finishListing(interaction, state);
  const modals = {
    list_set_info: { id: "list_modal_info", title: "Set Info", label: "Hypixel rank, ban status, etc." },
    list_set_username: { id: "list_modal_username", title: "Set Username", label: "Minecraft Username" },
    list_set_co: { id: "list_modal_co", title: "Set C/O", label: "Current Offer ($)" },
    list_set_bin: { id: "list_modal_bin", title: "Set BIN", label: "Buy It Now ($)" }
  };
  const cfg = modals[customId];
  if (!cfg) return null;
  return modal(cfg.id, cfg.title, [{ custom_id: "value", label: cfg.label }]);
}
__name(handleListingButton, "handleListingButton");
function handleListingModal(interaction, state) {
  const draft = state.getDraft(interaction.user.id);
  const value = interaction.field("value");
  const id = interaction.customId;
  if (id === "list_modal_username") {
    const token = interaction.token;
    state.later(async () => {
      const result = await validateAccount(value);
      if (!result.valid) {
        await state.api.editOriginal(token, { content: result.error });
        return;
      }
      draft.username = result.name;
      draft.mcUuid = result.uuid;
      const hypixel = await getHypixelStats(result.name, state.env.HYPIXEL_API_KEY);
      if (!hypixel.error) {
        draft.info = hypixel.shortLine;
        draft.hypixelStats = hypixel.stats;
      }
      state.markDirty();
      await state.api.editOriginal(token, buildListingForm(draft));
    });
    return deferReply(true);
  }
  if (id === "list_modal_info") {
    draft.info = value;
  } else if (id === "list_modal_co" || id === "list_modal_bin") {
    const amount = parseFloat(value);
    if (isNaN(amount)) return replyText("Invalid amount.");
    draft[id === "list_modal_co" ? "co" : "bin"] = amount;
  }
  state.markDirty();
  return reply(buildListingForm(draft), true);
}
__name(handleListingModal, "handleListingModal");
function handleListingProxySelect(interaction, state) {
  const draft = state.getDraft(interaction.user.id);
  draft.proxyChannelId = interaction.values[0] === "none" ? null : interaction.values[0];
  return update(buildListingForm(draft));
}
__name(handleListingProxySelect, "handleListingProxySelect");

// worker/src/bot.js
var ADMIN_ONLY_COMMANDS = ["\uB9D0\uD558\uAE30", "say", "roles", "\uC794\uC561\uAD00\uB9AC", "\uAD6C\uB9E4\uAE30\uB85D", "\uC124\uC815", "\uBC31\uC5C5", "\uBCF5\uAD6C", "\uC774\uBCA4\uD2B8"];
async function route(interaction, state) {
  if (interaction.isCommand) return handleCommand(interaction, state);
  if (interaction.isComponent) return handleComponent(interaction, state);
  if (interaction.isModalSubmit) return handleModal(interaction, state);
  return null;
}
__name(route, "route");
function drawShopPrize() {
  const roll = Math.random();
  let cumulative = 0;
  for (const prize of SHOP_PRIZES) {
    cumulative += prize.chance;
    if (roll < cumulative) return prize;
  }
  return null;
}
__name(drawShopPrize, "drawShopPrize");
async function handleCommand(interaction, state) {
  const name = interaction.commandName;
  const me = interaction.user;
  if (!interaction.guildId) return replyText("\uC11C\uBC84 \uC548\uC5D0\uC11C\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  if (ADMIN_ONLY_COMMANDS.includes(name) && !isAdmin(interaction)) {
    return replyText("\uAD00\uB9AC\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uB294 \uBA85\uB839\uC5B4\uC785\uB2C8\uB2E4.");
  }
  switch (name) {
    case "deal":
      return handleDeal(interaction, state);
    case "list":
      return handleList(interaction, state);
    case "offer":
      return handleOffer(interaction, state);
    case "bin":
      return handleBin(interaction, state);
    case "edit":
      return handleEdit(interaction, state);
    case "\uBC14\uC6B0\uCC98":
      return handleVoucher(interaction, state);
    case "say":
      return handleSay(interaction, state);
    case "roles":
      if (interaction.subcommand() === "post") return handleRolesPost(interaction, state);
      return null;
  }
  if (name === "\uB9D0\uD558\uAE30") {
    const content = interaction.getString("\uB0B4\uC6A9");
    const channelId = interaction.getChannel("\uCC44\uB110")?.id ?? interaction.channelId;
    const asPanel = interaction.getBoolean("\uC784\uBCA0\uB4DC") ?? false;
    if (asPanel) {
      const c = panel();
      addText(c, content);
      await state.api.sendMessage(channelId, { components: [c], flags: V2 });
    } else {
      await state.api.sendMessage(channelId, { content });
    }
    return replyText(`\uC804\uC1A1 \uC644\uB8CC \u2014 <#${channelId}>`);
  }
  if (name === "\uCD9C\uC11D") {
    const user = state.getUser(me.id);
    const today = todayKST();
    if (user.lastCheckin === today) {
      return replyText("\uC624\uB298\uC740 \uC774\uBBF8 \uCD9C\uC11D\uD588\uC2B5\uB2C8\uB2E4. \uB0B4\uC77C \uB2E4\uC2DC \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.");
    }
    const yesterday = todayKST(-24 * 60 * 60 * 1e3);
    user.streak = user.lastCheckin === yesterday ? user.streak + 1 : 1;
    const jackpot = Math.random() < JACKPOT_CHANCE;
    const reward = jackpot ? JACKPOT_AMOUNT : Math.floor(Math.random() * (CHECKIN_MAX - CHECKIN_MIN + 1)) + CHECKIN_MIN;
    user.balance += reward;
    user.lastCheckin = today;
    user.checkinCount += 1;
    if (jackpot) user.jackpotCount += 1;
    state.markDirty();
    const c = panel();
    addGif(c, await resultGifUrl(state, `${jackpot ? "jackpot" : "checkin"}-${reward}`));
    addText(c, jackpot ? "## \uCDA9\uC804\uAD8C \uB2F9\uCCA8" : "## \uCD9C\uC11D \uC644\uB8CC");
    addText(c, `-# <t:${Math.floor(Date.now() / 1e3)}:D>`);
    addDivider(c, true);
    addText(c, jackpot ? `${mention(me.id)}\uB2D8, 0.1% \uD655\uB960\uC758 \uCDA9\uC804\uAD8C **${won(JACKPOT_AMOUNT)}** \uC5D0 \uB2F9\uCCA8\uB418\uC5C8\uC2B5\uB2C8\uB2E4.` : `${mention(me.id)}\uB2D8, \uC624\uB298\uC758 \uBCF4\uC0C1\uC740 **${won(reward)}** \uC785\uB2C8\uB2E4.`);
    addDivider(c);
    addText(c, `-# \uD604\uC7AC \uC794\uC561 ${won(user.balance)}  \xB7  \uC5F0\uC18D \uCD9C\uC11D ${user.streak}\uC77C  \xB7  \uCD1D \uCD9C\uC11D ${user.checkinCount}\uD68C`);
    return v2Reply(c);
  }
  if (name === "\uCD9C\uC11D\uC0C1\uC810") {
    // 패널은 관리자만 올린다 — 올라간 패널의 [뽑기권 구매] 버튼은 누구나 쓸 수 있다
    if (!isAdmin(interaction)) {
      return v2Reply(addText(panel(), "## 관리자 전용\n출석 상점 패널은 관리자만 올릴 수 있어요.\n채널에 올라가 있는 출석 상점의 **뽑기권 구매** 버튼을 눌러 주세요."), true);
    }
    const c = panel();
    addGif(c, await botImageUrl(state, { kind: "att_shop", cost: SHOP_TICKET_COST, prizes: shopPrizeTable() }));
    addText(c, "## 출석 상점");
    addText(c, `출석 포인트 **${pts(SHOP_TICKET_COST)}** 로 뽑기권을 사면 바로 뽑아요.\n> 포인트 상품은 즉시 지급 · 마크 계정·니트로·충전권은 관리자가 전달`);
    addDivider(c);
    addButtonRow(c, button({
      customId: "shop_buy_raffle",
      label: `뽑기권 구매 (${SHOP_TICKET_COST}P)`,
      style: ButtonStyle.Primary
    }));
    addText(c, "-# 매일 /출석 으로 포인트를 모을 수 있어요 · 결과는 나에게만 보이고, 채널에는 뽑기 로그가 남아요");
    return v2Reply(c);
  }
  if (name === "\uB3C4\uBC15") {
    const bet = interaction.getInteger("\uAC78\uD3EC\uC778\uD2B8");
    const multiplier = interaction.getInteger("\uBC30\uB2F9");
    const user = state.getUser(me.id);
    if (user.balance < bet) {
      const c2 = panel();
      addText(c2, "## \uD3EC\uC778\uD2B8 \uBD80\uC871");
      addDivider(c2);
      addText(c2, `\uD3EC\uC778\uD2B8\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4. (\uD604\uC7AC ${pts(user.balance)})`);
      return v2Reply(c2, true);
    }
    user.balance -= bet;
    const winChance = 1 / multiplier;
    const isWin = Math.random() < winChance;
    if (isWin) user.balance += bet * multiplier;
    state.markDirty();
    const c = panel();
    addGif(c, await resultGifUrl(state, isWin ? `gamble-w-${bet * multiplier}` : `gamble-l-${bet}`));
    addText(c, isWin ? "## <:does_party:1572044096548118690> \uB3C4\uBC15 \uC131\uACF5" : "## <:does_cross:1572041080059334851> \uB3C4\uBC15 \uC2E4\uD328");
    addDivider(c);
    addText(c, isWin ? `${mention(me.id)}\uB2D8, **${multiplier}\uBC30** \uBC30\uB2F9\uC5D0 \uC131\uACF5\uD588\uC2B5\uB2C8\uB2E4!
\uBCA0\uD305 ${pts(bet)} \u2192 \uD68D\uB4DD **${pts(bet * multiplier)}** (\uC21C\uC774\uC775 ${pts(bet * (multiplier - 1))})` : `${mention(me.id)}\uB2D8, **${multiplier}\uBC30** \uBC30\uB2F9\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.
${pts(bet)} \uC744 \uC783\uC5C8\uC2B5\uB2C8\uB2E4.`);
    addDivider(c);
    addText(c, `-# \uB2F9\uCCA8 \uD655\uB960 ${Math.round(winChance * 100)}%  \xB7  \uD604\uC7AC \uC794\uC561 ${pts(user.balance)}`);
    return v2Reply(c);
  }
  if (name === "\uC22B\uC790") {
    const number = interaction.getInteger("\uC22B\uC790");
    const channel = interaction.getChannel("\uCC44\uB110");
    state.data.numberGames[interaction.guildId] = {
      channelId: channel.id,
      number,
      hostId: me.id,
      guessed: []
    };
    state.markDirty();
    const c = panel();
    addText(c, "## <:does_question:1572035042991935558> \uC22B\uC790 \uB9DE\uCD94\uAE30");
    addDivider(c);
    addText(c, `<#${channel.id}> \uCC44\uB110\uC5D0\uC11C \`/\uB9DE\uCD94\uAE30\` \uBA85\uB839\uC5B4\uB85C \uC22B\uC790\uB97C \uC785\uB825\uD574 \uBCF4\uC138\uC694.
\uB9DE\uCD94\uBA74 **\uB2F9\uCCA8** \uC774\uB77C\uACE0 \uB2F5\uD569\uB2C8\uB2E4.`);
    addDivider(c);
    addText(c, `-# \uC124\uC815\uC790 ${mention(me.id)}  \xB7  \uC815\uB2F5 \uC22B\uC790\uB294 \uBE44\uBC00\uC785\uB2C8\uB2E4`);
    return v2Reply(c);
  }
  if (name === "\uB9DE\uCD94\uAE30") {
    const game = state.data.numberGames[interaction.guildId];
    if (!game) return replyText("\uC9C4\uD589 \uC911\uC778 \uC22B\uC790 \uB9DE\uCD94\uAE30 \uAC8C\uC784\uC774 \uC5C6\uC5B4\uC694.");
    if (game.channelId !== interaction.channelId) {
      return replyText(`<#${game.channelId}> \uCC44\uB110\uC5D0\uC11C\uB9CC \uC785\uB825\uD560 \uC218 \uC788\uC5B4\uC694.`);
    }
    const guessed = interaction.getInteger("\uC22B\uC790");
    game.guessed ??= [];
    if (game.guessed.includes(guessed)) return replyText("\uC911\uBCF5\uB418\uB294 \uC22B\uC790\uC5D0\uC694.");
    game.guessed.push(guessed);
    state.markDirty();
    if (guessed === game.number) {
      const c = panel();
      addText(c, "## <:does_party:1572044096548118690> \uB2F9\uCCA8!");
      addDivider(c);
      addText(c, `${mention(me.id)}\uB2D8\uC774 \uC815\uB2F5 **${guessed}** \uC744(\uB97C) \uB9DE\uCDC4\uC2B5\uB2C8\uB2E4!`);
      return v2Reply(c);
    }
    const token = interaction.token;
    state.later(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(700);
        try {
          await state.api.deleteOriginal(token);
          return;
        } catch (err) {
          if (err.status !== 404) throw err;
        }
      }
    });
    return deferReply(true);
  }
  if (name === "\uC774\uBCA4\uD2B8") {
    const prize = interaction.getString("\uC0C1\uD488");
    const minutes = interaction.getInteger("\uC2DC\uAC04");
    const content = interaction.getString("\uB0B4\uC6A9") ?? "";
    const eventId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const endsAt = Date.now() + minutes * 60 * 1e3;
    state.data.events[eventId] = {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      prize,
      content,
      endsAt,
      participants: [],
      bets: {},
      ended: false
    };
    state.markDirty();
    await state.scheduleEvents();
    const c = panel();
    addText(c, "## <:does_party:1572044096548118690> \uC774\uBCA4\uD2B8 \uC2DC\uC791");
    addDivider(c, true);
    addText(
      c,
      `**\uC0C1\uD488:** ${prize}
` + (content ? `**\uB0B4\uC6A9:** ${content}
` : "") + `**\uC885\uB8CC:** <t:${Math.floor(endsAt / 1e3)}:R>

**\uCC38\uC5EC** \u2014 \uBB34\uB8CC\uB85C \uC774\uBCA4\uD2B8\uC5D0 \uCC38\uC5EC\uD569\uB2C8\uB2E4
**\uBC30\uD305** \u2014 \uD3EC\uC778\uD2B8\uB97C \uBCA0\uD305\uD574 \uB2F9\uCCA8 \uD655\uB960\uC744 \uB192\uC785\uB2C8\uB2E4 (100P \uBCA0\uD305 = 0.1% \uAC00\uC911\uCE58)`
    );
    addDivider(c);
    addButtonRow(
      c,
      button({ customId: `event_join_${eventId}`, label: "\uCC38\uC5EC", style: ButtonStyle.Success, emoji: "\u2705" }),
      button({ customId: `event_bet_${eventId}`, label: "\uBC30\uD305", style: ButtonStyle.Primary, emoji: "<:does_coin:1572032062137831624>" })
    );
    return v2Reply(c);
  }
  if (name === "\uC794\uC561") {
    let target = interaction.getUser("\uC720\uC800");
    if (target && target.id !== me.id && !isAdmin(interaction)) {
      return replyText("\uB2E4\uB978 \uC720\uC800\uC758 \uC794\uC561\uC740 \uAD00\uB9AC\uC790\uB9CC \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    target ??= me;
    const user = state.getUser(target.id);
    const c = panel();
    addText(c, "## \uC794\uC561");
    addDivider(c);
    addText(c, `${mention(target.id)} \uB2D8\uC758 \uC794\uC561\uC740 **${won(user.balance)}** \uC785\uB2C8\uB2E4.`);
    return v2Reply(c, true);
  }
  if (name === "\uC794\uC561\uAD00\uB9AC") {
    const kind = interaction.getString("\uC885\uB958");
    const target = interaction.getUser("\uC720\uC800");
    const amount = interaction.getInteger("\uAE08\uC561");
    const user = state.getUser(target.id);
    if (kind === "add") {
      user.balance += amount;
    } else {
      if (user.balance < amount) return replyText(`\uC794\uC561\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4. (\uD604\uC7AC \uC794\uC561 ${won(user.balance)})`);
      user.balance -= amount;
    }
    state.markDirty();
    const verb = kind === "add" ? "\uC9C0\uAE09" : "\uCC28\uAC10";
    const c = panel();
    addText(c, `## \uC794\uC561 ${verb}`);
    addDivider(c);
    addText(c, `${mention(target.id)} \uB2D8\uC5D0\uAC8C **${won(amount)}** ${verb} \uC644\uB8CC`);
    addText(c, `-# \uD604\uC7AC \uC794\uC561 ${won(user.balance)}`);
    return v2Reply(c);
  }
  if (name === "\uAD6C\uB9E4\uAE30\uB85D") {
    const target = interaction.getUser("\uC720\uC800");
    const product = interaction.getString("\uC0C1\uD488");
    const amount = interaction.getInteger("\uAE08\uC561");
    const user = state.getUser(target.id);
    user.purchases.push({ product, amount, timestamp: Date.now(), guildId: interaction.guildId });
    user.totalPurchase += amount;
    state.markDirty();
    const c = panel();
    addText(c, "## \uAD6C\uB9E4 \uAE30\uB85D");
    addDivider(c, true);
    addText(c, `\uAD6C\uB9E4\uC790 ${mention(target.id)}
\uC0C1\uD488 **${product}**
\uAE08\uC561 **${won(amount)}**`);
    addDivider(c);
    addText(c, `-# \uB204\uC801 \uAD6C\uB9E4 ${won(user.totalPurchase)}  \xB7  ${user.purchases.length}\uD68C`);
    return v2Reply(c);
  }
  if (name === "\uB0B4\uC815\uBCF4") {
    let target = interaction.getUser("\uC720\uC800");
    if (target && target.id !== me.id && !isAdmin(interaction)) {
      return replyText("\uB2E4\uB978 \uC720\uC800\uC758 \uC815\uBCF4\uB294 \uAD00\uB9AC\uC790\uB9CC \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    target ??= me;
    const user = state.getUser(target.id);
    const recent = user.purchases.slice(-5).reverse().map((p) => `${p.product} \u2014 ${won(p.amount)} (<t:${Math.floor(p.timestamp / 1e3)}:d>)`).join("\n") || "\uAD6C\uB9E4 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
    const c = panel();
    addSection(c, [`## ${displayName(target)} \uB2D8\uC758 \uC815\uBCF4`, "-# \uC794\uC561 \xB7 \uAD6C\uB9E4 \xB7 \uD6C4\uAE30 \xB7 \uCD9C\uC11D \uD604\uD669"], avatarUrl(target));
    addDivider(c, true);
    addText(
      c,
      `\uC794\uC561 **${won(user.balance)}**
\uCD1D \uAD6C\uB9E4\uAE08\uC561 **${won(user.totalPurchase)}**  \xB7  \uAD6C\uB9E4 \uD69F\uC218 **${user.purchases.length}\uD68C**
\uC791\uC131\uD55C \uD6C4\uAE30 **${user.reviewCount}\uAC1C**
\uCD1D \uCD9C\uC11D **${user.checkinCount}\uD68C**  \xB7  \uC5F0\uC18D \uCD9C\uC11D **${user.streak}\uC77C**  \xB7  \uCDA9\uC804\uAD8C \uB2F9\uCCA8 **${user.jackpotCount}\uD68C**`
    );
    addDivider(c);
    addText(c, `**\uCD5C\uADFC \uAD6C\uB9E4 \uB0B4\uC5ED**
${recent}`);
    return v2Reply(c, true);
  }
  if (name === "\uC124\uC815") {
    if (interaction.subcommand() === "\uD6C4\uAE30\uCC44\uB110") {
      const channel = interaction.getChannel("\uCC44\uB110");
      state.getGuildSettings(interaction.guildId).reviewChannelId = channel.id;
      state.markDirty();
      return replyText(`\uD6C4\uAE30 \uCC44\uB110\uC774 <#${channel.id}> (\uC73C)\uB85C \uC124\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.
-# \uD074\uB77C\uC6B0\uB4DC \uBC84\uC804\uC5D0\uC11C\uB294 \uCC44\uD305 \uD6C4\uAE30 \uC790\uB3D9 \uC800\uC7A5\uC774 \uB3D9\uC791\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
    }
    return handleSettingsMarketplace(interaction, state);
  }
  if (name === "\uBC31\uC5C5") {
    const token = interaction.token;
    state.later(async () => {
      const json = JSON.stringify(state.data, null, 2);
      await state.api.editOriginal(token, {
        content: `\uBC31\uC5C5 \uC644\uB8CC
\uCD1D \uD6C4\uAE30 ${state.data.reviews.length}\uAC1C, \uC720\uC800 ${Object.keys(state.data.users).length}\uBA85\uC758 \uB370\uC774\uD130\uAC00 \uC800\uC7A5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.
\uC544\uB798 \uD30C\uC77C\uC744 \uC548\uC804\uD55C \uACF3\uC5D0 \uBCF4\uAD00\uD574 \uB450\uC138\uC694.`
      }, [{ name: `backup-${todayKST()}.json`, data: new TextEncoder().encode(json) }]);
    });
    return deferReply(true);
  }
  if (name === "\uBCF5\uAD6C") {
    const count = interaction.getInteger("\uAC1C\uC218");
    let reviews = state.data.reviews;
    if (count) reviews = reviews.slice(-count);
    if (reviews.length === 0) return replyText("\uC800\uC7A5\uB41C \uD6C4\uAE30\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const channelId = interaction.channelId;
    const token = interaction.token;
    state.later(async () => {
      let done = 0;
      for (const review of reviews) {
        const c = panel();
        addText(c, `**${review.authorTag}**`);
        addText(c, `-# <t:${Math.floor(review.timestamp / 1e3)}:f>`);
        addDivider(c);
        if (review.content) addText(c, review.content);
        const links = (review.attachments ?? []).map((a) => `[${a.name}](${a.url})`).join("\n");
        if (links) addText(c, links);
        addDivider(c);
        addText(c, "-# \uBCF5\uAD6C\uB41C \uD6C4\uAE30");
        await state.api.sendMessage(channelId, { components: [c], flags: V2 });
        done++;
        await sleep(700);
      }
      await state.api.followUp(token, { content: `\uD6C4\uAE30 ${done}\uAC1C \uBCF5\uAD6C \uC644\uB8CC` });
    });
    return replyText(`\uD6C4\uAE30 ${reviews.length}\uAC1C \uBCF5\uAD6C\uB97C \uC2DC\uC791\uD569\uB2C8\uB2E4. \uC644\uB8CC\uAE4C\uC9C0 \uC2DC\uAC04\uC774 \uAC78\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`, false);
  }
  return null;
}
__name(handleCommand, "handleCommand");
async function handleComponent(interaction, state) {
  const { customId } = interaction;
  const me = interaction.user;
  if (customId.startsWith("role_toggle_")) return handleRoleToggle(interaction, state);
  if (customId.startsWith("lb_prev_") || customId.startsWith("lb_next_")) return handleLeaderboardButton(interaction, state);
  if (customId === "list_proxy") return handleListingProxySelect(interaction, state);
  if (["list_cat", "list_owner", "list_capes"].includes(customId)) return handleListingSelect(interaction, state);
  if (customId.startsWith("list_")) return handleListingButton(interaction, state);
  if (customId === "shop_buy_raffle") {
    const user = state.getUser(me.id);
    if (user.balance < SHOP_TICKET_COST) {
      const c2 = panel();
      addText(c2, "## \uD3EC\uC778\uD2B8 \uBD80\uC871");
      addDivider(c2);
      addText(c2, `\uCD9C\uC11D \uD3EC\uC778\uD2B8\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.
\uD604\uC7AC ${pts(user.balance)} \xB7 \uD544\uC694 ${pts(SHOP_TICKET_COST)}`);
      return v2Reply(c2, true);
    }
    user.balance -= SHOP_TICKET_COST;
    const prize = drawShopPrize();
    if (prize?.points) user.balance += prize.points;
    state.markDirty();
    const result = {
      kind: "att_result",
      name: displayName(me).slice(0, 20),
      avatar: avatarUrl(me),
      prize: prize ? prize.name : null,
      pkind: prize ? prize.kind : "none",
      cost: SHOP_TICKET_COST,
      balance: user.balance,
      time: kstStamp()
    };
    const image = await botImageUrl(state, result);
    const c = panel();
    if (image) addGif(c, image);
    else addGif(c, await resultGifUrl(state, `raffle-${prize?.gif ?? "none"}`));
    if (prize) {
      addText(c, `## ${prize.name} 당첨!`);
      addText(c, prize.points ? `출석 포인트 **${pts(prize.points)}** 가 바로 지급됐어요.` : "관리자에게 티켓으로 문의하면 전달해 드려요.");
    } else {
      addText(c, "## 꽝...");
      addText(c, "아쉽게도 당첨되지 않았어요. 다음 기회에!");
    }
    addDivider(c);
    addText(c, `-# 사용 ${pts(SHOP_TICKET_COST)}  \xB7  남은 포인트 ${pts(user.balance)}`);
    addButtonRow(c, button({ customId: "shop_buy_raffle", label: `한 장 더 (${SHOP_TICKET_COST}P)`, style: ButtonStyle.Primary }));
    // 채널에는 뽑기 로그 (이미지) — 실패해도 결과는 그대로
    if (interaction.channelId && state.api) {
      try {
        const log = panel();
        const logImage = await botImageUrl(state, { ...result, log: true });
        if (logImage) addGif(log, logImage);
        addText(log, `-# ${mention(me.id)} 님 출석 상점 뽑기 \xB7 ${prize ? `**${prize.name}** 당첨` : "꽝"}`);
        await state.api.sendMessage(interaction.channelId, { flags: V2, components: [log], allowed_mentions: { parse: [] } });
      } catch {
      }
    }
    return v2Reply(c, true);
  }
  if (customId.startsWith("event_join_")) {
    const event = state.data.events[customId.slice("event_join_".length)];
    if (!event || event.ended) return v2Reply(addText(panel(), "\uC774\uBCA4\uD2B8\uAC00 \uC885\uB8CC\uB418\uC5C8\uAC70\uB098 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."), true);
    if (event.participants.includes(me.id)) return v2Reply(addText(panel(), "\uC774\uBBF8 \uCC38\uC5EC\uD558\uC168\uC2B5\uB2C8\uB2E4."), true);
    event.participants.push(me.id);
    state.markDirty();
    const c = panel();
    addText(c, "## \u2705 \uCC38\uC5EC \uC644\uB8CC");
    addDivider(c);
    addText(c, `**${event.prize}** \uC774\uBCA4\uD2B8\uC5D0 \uCC38\uC5EC\uD588\uC2B5\uB2C8\uB2E4.`);
    return v2Reply(c, true);
  }
  if (customId.startsWith("event_bet_")) {
    const eventId = customId.slice("event_bet_".length);
    const event = state.data.events[eventId];
    if (!event || event.ended) return v2Reply(addText(panel(), "\uC774\uBCA4\uD2B8\uAC00 \uC885\uB8CC\uB418\uC5C8\uAC70\uB098 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."), true);
    return modal(`event_bet_modal_${eventId}`, "\uC774\uBCA4\uD2B8 \uBC30\uD305", [{
      custom_id: "bet_amount",
      label: "\uBCA0\uD305\uD560 \uD3EC\uC778\uD2B8",
      placeholder: "\uC608: 100"
    }]);
  }
  return null;
}
__name(handleComponent, "handleComponent");
function handleModal(interaction, state) {
  const { customId } = interaction;
  const me = interaction.user;
  if (customId === "say_modal") return handleSayModal(interaction, state);
  if (customId.startsWith("list_modal_")) return handleListingModal(interaction, state);
  if (!customId.startsWith("event_bet_modal_")) return null;
  const event = state.data.events[customId.slice("event_bet_modal_".length)];
  if (!event || event.ended) return v2Reply(addText(panel(), "\uC774\uBCA4\uD2B8\uAC00 \uC885\uB8CC\uB418\uC5C8\uAC70\uB098 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."), true);
  const amount = parseInt(interaction.field("bet_amount"), 10);
  if (isNaN(amount) || amount < 1) return v2Reply(addText(panel(), "\uC62C\uBC14\uB978 \uD3EC\uC778\uD2B8\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694."), true);
  const user = state.getUser(me.id);
  if (user.balance < amount) {
    const c2 = panel();
    addText(c2, "## \uD3EC\uC778\uD2B8 \uBD80\uC871");
    addDivider(c2);
    addText(c2, `\uD3EC\uC778\uD2B8\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4. (\uD604\uC7AC ${pts(user.balance)})`);
    return v2Reply(c2, true);
  }
  user.balance -= amount;
  event.bets[me.id] = (event.bets[me.id] ?? 0) + amount;
  state.markDirty();
  const chancePct = amount / 100 * 0.1;
  const c = panel();
  addText(c, "## <:does_coin:1572032062137831624> \uBC30\uD305 \uC644\uB8CC");
  addDivider(c);
  addText(
    c,
    `**${event.prize}** \uC774\uBCA4\uD2B8\uC5D0 **${pts(amount)}** \uBC30\uD305\uD588\uC2B5\uB2C8\uB2E4.
\uC608\uC0C1 \uB2F9\uCCA8 \uAC00\uC911\uCE58: ${chancePct.toFixed(2)}%  \xB7  \uB0A8\uC740 \uD3EC\uC778\uD2B8 ${pts(user.balance)}`
  );
  return v2Reply(c, true);
}
__name(handleModal, "handleModal");
async function endEvent(state, eventId) {
  const event = state.data.events[eventId];
  if (!event || event.ended) return;
  event.ended = true;
  state.markDirty();
  const weights = event.participants.map((userId) => ({ userId, weight: 1 }));
  for (const [userId, amount] of Object.entries(event.bets)) {
    const existing = weights.find((w) => w.userId === userId);
    if (existing) existing.weight += amount;
    else weights.push({ userId, weight: amount });
  }
  const c = panel();
  if (weights.length === 0) {
    addText(c, "## \uC774\uBCA4\uD2B8 \uC885\uB8CC");
    addDivider(c);
    addText(c, `**${event.prize}** \uC774\uBCA4\uD2B8\uAC00 \uC885\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.
\uCC38\uC5EC\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`);
  } else {
    const total = weights.reduce((s, w) => s + w.weight, 0);
    let roll = Math.random() * total;
    let winner = weights[0];
    for (const w of weights) {
      roll -= w.weight;
      if (roll <= 0) {
        winner = w;
        break;
      }
    }
    addText(c, "## <:does_party:1572044096548118690> \uC774\uBCA4\uD2B8 \uC885\uB8CC");
    addDivider(c, true);
    addText(
      c,
      `\uC0C1\uD488 **${event.prize}**
\uB2F9\uCCA8\uC790 ${mention(winner.userId)}
\uCC38\uC5EC ${event.participants.length}\uBA85 \xB7 \uBC30\uD305 ${Object.keys(event.bets).length}\uBA85`
    );
  }
  delete state.data.events[eventId];
  await state.api.sendMessage(event.channelId, { components: [c], flags: V2 }).catch((err) => console.error("\uC774\uBCA4\uD2B8 \uC885\uB8CC \uBA54\uC2DC\uC9C0 \uC804\uC1A1 \uC2E4\uD328:", err));
}
__name(endEvent, "endEvent");

// worker/src/state.js
var DEFAULT_DATA = {
  users: {},
  reviews: [],
  settings: {},
  numberGames: {},
  events: {},
  deals: [],
  listings: {},
  vouchers: {}
};
var BotState = class extends DurableObject {
  static {
    __name(this, "BotState");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.api = new DiscordApi(env.DISCORD_TOKEN, env.DISCORD_APPLICATION_ID);
    this.dirty = false;
    ctx.blockConcurrencyWhile(() => this.load());
  }
  async load() {
    let data = await this.ctx.storage.get("data");
    if (!data) {
      const legacy = await this.env.BOT_DB?.get("database.json");
      data = legacy ? JSON.parse(legacy) : structuredClone(DEFAULT_DATA);
      await this.ctx.storage.put("data", data);
    }
    for (const key of Object.keys(DEFAULT_DATA)) {
      if (data[key] === void 0) data[key] = structuredClone(DEFAULT_DATA[key]);
    }
    this.data = data;
    this.temp = await this.ctx.storage.get("temp") ?? { drafts: {}, sayPending: {} };
  }
  markDirty() {
    this.dirty = true;
  }
  async flush() {
    if (!this.dirty) return;
    this.dirty = false;
    await this.ctx.storage.put({ data: this.data, temp: this.temp });
  }
  // 응답을 먼저 보내고 이어서 처리할 작업 (리더보드 갱신, DM 등)
  later(fn) {
    const task = (async () => {
      try {
        await fn();
      } catch (err) {
        console.error("\uD6C4\uC18D \uC791\uC5C5 \uC624\uB958:", err);
      } finally {
        await this.flush();
      }
    })();
    this.ctx.waitUntil?.(task);
  }
  async handle(raw) {
    const interaction = new Interaction(raw);
    try {
      return await route(interaction, this) ?? replyText("\uC54C \uC218 \uC5C6\uB294 \uC694\uCCAD\uC785\uB2C8\uB2E4.");
    } catch (err) {
      console.error("\uC778\uD130\uB799\uC158 \uCC98\uB9AC \uC624\uB958:", err);
      return replyText("\uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      await this.flush();
    }
  }
  async exportData() {
    return this.data;
  }
  // \uC0C1\uC810(vendix) \uAD6C\uB9E4 \uD569\uACC4 \u2014 \uBC14\uB010 \uACBD\uC6B0\uC5D0\uB9CC \uB9AC\uB354\uBCF4\uB4DC\uB97C \uACE0\uCE5C\uB2E4
  async setShopTotals(guildId, totals) {
    const next = {};
    for (const k of Object.keys(totals || {}).sort()) {
      const v = Math.round(Number(totals[k]));
      if (/^\d{15,22}$/.test(k) && Number.isFinite(v) && v > 0) next[k] = v;
    }
    this.data.shopTotals ??= {};
    if (JSON.stringify(this.data.shopTotals[guildId] ?? {}) === JSON.stringify(next)) return { ok: true, changed: false };
    this.data.shopTotals[guildId] = next;
    this.markDirty();
    try {
      await refreshLeaderboard(this, guildId);
    } catch (err) {
      console.error("shop totals leaderboard:", err);
    } finally {
      await this.flush();
    }
    return { ok: true, changed: true, users: Object.keys(next).length };
  }
  // ---------- 이벤트 종료 예약 (Durable Object 알람) ----------
  async scheduleEvents() {
    const pending = Object.values(this.data.events).filter((e) => !e.ended).map((e) => e.endsAt);
    if (pending.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Math.min(...pending), Date.now() + 1e3));
  }
  async alarm() {
    const now = Date.now();
    for (const [eventId, event] of Object.entries(this.data.events)) {
      if (!event.ended && event.endsAt <= now) {
        await endEvent(this, eventId).catch((err) => console.error("\uC774\uBCA4\uD2B8 \uC885\uB8CC \uC624\uB958:", err));
      }
    }
    await this.flush();
    await this.scheduleEvents();
  }
  // ---------- 데이터 헬퍼 (기존 db.js 와 동일) ----------
  getUser(userId) {
    const users = this.data.users;
    if (!users[userId]) {
      users[userId] = {
        balance: 0,
        totalPurchase: 0,
        purchases: [],
        reviewCount: 0,
        lastCheckin: null,
        streak: 0,
        checkinCount: 0,
        jackpotCount: 0,
        dealHidden: false
      };
      this.markDirty();
    }
    users[userId].jackpotCount ??= 0;
    users[userId].dealHidden ??= false;
    return users[userId];
  }
  getGuildSettings(guildId) {
    const settings = this.data.settings;
    if (!settings[guildId]) {
      settings[guildId] = { owners: [], hiddenDealUsers: [] };
      this.markDirty();
    }
    const s = settings[guildId];
    s.owners ??= [];
    s.hiddenDealUsers ??= [];
    return s;
  }
  getVoucherData(guildId) {
    const vouchers = this.data.vouchers;
    if (!vouchers[guildId]) {
      vouchers[guildId] = { channelId: null, counts: {} };
      this.markDirty();
    }
    vouchers[guildId].counts ??= {};
    return vouchers[guildId];
  }
  getDealTotals(guildId) {
    const totals = {};
    for (const deal of this.data.deals) {
      if (deal.guildId !== guildId || deal.cancelled) continue;
      totals[deal.userId] = (totals[deal.userId] ?? 0) + Math.round(deal.amount * USD_KRW);
    }
    for (const [userId, amount] of Object.entries(this.data.shopTotals?.[guildId] ?? {})) {
      totals[userId] = (totals[userId] ?? 0) + amount;
    }
    return totals;
  }
  getListingByChannel(channelId) {
    return Object.values(this.data.listings).find((l) => l.channelId === channelId) ?? null;
  }
  getGuildListings(guildId, { ownerId = null, includeHidden = true } = {}) {
    return Object.entries(this.data.listings).filter(([, l]) => {
      if (l.guildId !== guildId) return false;
      if (ownerId && l.ownerId !== ownerId) return false;
      if (!includeHidden && l.hidden) return false;
      return true;
    }).map(([id, l]) => ({ id, ...l }));
  }
  getDraft(userId) {
    this.temp.drafts[userId] ??= { capes: [] };
    this.markDirty();
    return this.temp.drafts[userId];
  }
  clearDraft(userId) {
    delete this.temp.drafts[userId];
    this.markDirty();
  }
};

// worker/src/index.js
var hexToBytes = /* @__PURE__ */ __name((hex) => new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16))), "hexToBytes");
var VENDIX_NAMES = /* @__PURE__ */ new Set([
  "\uBC84\uD2BC",
  "\uC6F9\uD328\uB110",
  "\uC11C\uBC84\uC815\uBCF4",
  "\uAC1C\uC778\uBD07\uC124\uC815",
  "\uAC1C\uC778\uBD07",
  "\uC218\uB3D9\uCDA9\uC804",
  "\uC790\uD310\uAE30",
  "\uC5F0\uB3D9",
  "\uCDA9\uC804",
  "\uC790\uD310\uAE30\uC124\uC815",
  "\uC124\uC815",
  "\uB4F1\uB85D",
  "\uC778\uC99D",
  "\uC778\uC99D\uBCF5\uAD6C",
  "\uBCF5\uAD6C",
  "\uD1B5\uACC4",
  "\uCC28\uB2E8\uCD94\uAC00",
  "\uCC28\uB2E8\uD574\uC81C"
]);
var PUBLIC_VENDIX = /* @__PURE__ */ new Set(["\uC790\uD310\uAE30", "\uC778\uC99D"]);
var DISCORD_API = "https://discord.com/api/v10";
var cachedKey;
async function verifySignature(publicKeyHex, signatureHex, timestamp, body) {
  cachedKey ??= await crypto.subtle.importKey("raw", hexToBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", cachedKey, hexToBytes(signatureHex), new TextEncoder().encode(timestamp + body));
}
__name(verifySignature, "verifySignature");
function isVendixCommand(interaction) {
  const name = interaction.data?.name;
  if (!name || !VENDIX_NAMES.has(name)) return false;
  if (name === "\uC124\uC815" || name === "\uBCF5\uAD6C") {
    const opts = interaction.data.options;
    const sub = Array.isArray(opts) && opts.some((o) => o && (o.type === 1 || o.name === "\uD6C4\uAE30\uCC44\uB110" || o.name === "\uAC1C\uC218"));
    if (sub) return false;
  }
  return true;
}
__name(isVendixCommand, "isVendixCommand");
function needsModal(interaction) {
  const name = interaction.data?.name;
  if (name === "\uBC84\uD2BC") return true;
  if (name === "\uCDA9\uC804") {
    const opts = interaction.data?.options;
    const amount = Array.isArray(opts) ? opts.find((o) => o?.name === "\uAE08\uC561")?.value : void 0;
    return amount === void 0 || amount === null || amount === "";
  }
  return false;
}
__name(needsModal, "needsModal");
function defer(ephemeral) {
  return Response.json({
    type: 5,
    data: ephemeral ? { flags: 64 } : {}
  });
}
__name(defer, "defer");
async function editOriginal(interaction, data) {
  const v2 = typeof data.flags === "number" && (data.flags & 1 << 15) === 1 << 15;
  const body = v2 ? {
    flags: data.flags,
    components: Array.isArray(data.components) ? data.components : []
  } : {
    content: data.content ?? null,
    embeds: Array.isArray(data.embeds) ? data.embeds : [],
    components: Array.isArray(data.components) ? data.components : [],
    ...typeof data.flags === "number" ? { flags: data.flags } : {}
  };
  const res = await fetch(
    `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[does-forward] edit original", res.status, text.slice(0, 200));
  }
}
__name(editOriginal, "editOriginal");
async function callVendix(env, interaction) {
  const payload = structuredClone(interaction);
  if (payload.data?.name === "\uC790\uD310\uAE30\uC124\uC815") payload.data.name = "\uC124\uC815";
  if (payload.data?.name === "\uC778\uC99D\uBCF5\uAD6C") payload.data.name = "\uBCF5\uAD6C";
  const res = await fetch("https://vendix.team/api/discord/internal", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-does-forward": env.DOES_FORWARD_KEY,
      origin: "https://vendix.team"
    },
    body: JSON.stringify(payload)
  });
  return res.json().catch(() => null);
}
__name(callVendix, "callVendix");
var BOT_COMMANDS = /* @__PURE__ */ new Set([
  "deal", "list", "offer", "bin", "edit", "say", "roles",
  "\uBC14\uC6B0\uCC98", "\uB9D0\uD558\uAE30", "\uCD9C\uC11D", "\uCD9C\uC11D\uC0C1\uC810", "\uB3C4\uBC15",
  "\uC22B\uC790", "\uB9DE\uCD94\uAE30", "\uC774\uBCA4\uD2B8", "\uC794\uC561", "\uC794\uC561\uAD00\uB9AC",
  "\uAD6C\uB9E4\uAE30\uB85D", "\uB0B4\uC815\uBCF4", "\uBC31\uC5C5"
]);
function ownedByBot(interaction) {
  if (interaction.type === 2 || interaction.type === 4) {
    return BOT_COMMANDS.has(interaction.data?.name) && !isVendixCommand(interaction);
  }
  if (interaction.type === 3 || interaction.type === 5) {
    const id = interaction.data?.custom_id || "";
    return !(id.startsWith("vx|") || id.startsWith("tk|"));
  }
  return true;
}
__name(ownedByBot, "ownedByBot");
async function proxyToVendix(signature, timestamp, body) {
  const res = await fetch("https://vendix.team/api/discord/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp
    },
    body
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" }
  });
}
__name(proxyToVendix, "proxyToVendix");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/internal/shop-totals") {
      if (!env.DOES_FORWARD_KEY || request.headers.get("x-does-forward") !== env.DOES_FORWARD_KEY) {
        return new Response("forbidden", { status: 403 });
      }
      const body = await request.json().catch(() => null);
      if (!body || typeof body.guildId !== "string" || !/^\d{15,22}$/.test(body.guildId) || !body.totals || typeof body.totals !== "object") {
        return new Response("bad request", { status: 400 });
      }
      const state3 = env.BOT_STATE.getByName("main");
      return Response.json(await state3.setShopTotals(body.guildId, body.totals));
    }
    if (request.method === "POST" && url.pathname === "/internal") {
      if (!env.DOES_FORWARD_KEY || request.headers.get("x-does-forward") !== env.DOES_FORWARD_KEY) {
        return new Response("forbidden", { status: 403 });
      }
      const raw = await request.json();
      const state2 = env.BOT_STATE.getByName("main");
      return Response.json(await state2.handle(raw));
    }
    if (request.method !== "POST") {
      return new Response("discord-shop-bot is running");
    }
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    const body = await request.text();
    const valid = signature && timestamp && /^[0-9a-f]+$/i.test(signature) && await verifySignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, body).catch(() => false);
    if (!valid) return new Response("invalid request signature", { status: 401 });
    const interaction = JSON.parse(body);
    if (interaction.type === 1) return Response.json({ type: 1 });
    if (interaction.type === 2 && isVendixCommand(interaction) && env.DOES_FORWARD_KEY) {
      if (needsModal(interaction)) {
        const json = await callVendix(env, interaction);
        if (json) return Response.json(json);
      } else {
        ctx.waitUntil((async () => {
          try {
            const json = await callVendix(env, interaction);
            if (!json) {
              await editOriginal(interaction, { content: "\uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", flags: 64 });
              return;
            }
            if (json.type === 5) return;
            if (json.type === 9) {
              await editOriginal(interaction, { content: "\uBAA8\uB2EC\uC774 \uD544\uC694\uD574\uC694. \uBA85\uB839\uC5B4\uB97C \uB2E4\uC2DC \uC785\uB825\uD574 \uC8FC\uC138\uC694.", flags: 64 });
              return;
            }
            if (json.data) {
              await editOriginal(interaction, json.data);
              return;
            }
            const err = json.error || json.message || "\uC751\uB2F5\uC774 \uBE44\uC5B4 \uC788\uC5B4\uC694.";
            await editOriginal(interaction, { content: String(err), flags: 64 });
          } catch (err) {
            console.error("[does-forward]", err);
            await editOriginal(interaction, { content: "\uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uB0AC\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.", flags: 64 });
          }
        })());
        return defer(!PUBLIC_VENDIX.has(interaction.data?.name));
      }
    }
    if (!ownedByBot(interaction)) {
      try {
        return await proxyToVendix(signature, timestamp, body);
      } catch (err) {
        console.error("[does-proxy]", err);
      }
    }
    const state = env.BOT_STATE.getByName("main");
    const result = await state.handle(interaction);
    // /출석 · /도박: '여는 중…' 을 5초 보여 준 뒤 결과로 바꾼다 (결과 그림이 있는 응답만)
    const cmdName = interaction.type === 2 ? interaction.data?.name : "";
    const SUSPENSE = { "\uCD9C\uC11D": ["<a:does_gift:1572041087290183740> \uCD9C\uC11D \uC0C1\uC790\uB97C \uC5EC\uB294 \uC911\u2026", "https://doesmc.xyz/brand/suspense-checkin-3d.gif"], "\uB3C4\uBC15": ["<a:does_jackpot:1572041094919884830> \uC2AC\uB86F\uC744 \uB3CC\uB9AC\uB294 \uC911\u2026", "https://doesmc.xyz/brand/suspense-gamble-3d.gif"] };
    const sus = SUSPENSE[cmdName];
    if (sus && result?.type === 4 && result.data && JSON.stringify(result.data.components ?? []).includes('"type":12')) {
      ctx.waitUntil((async () => {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          await editOriginal(interaction, result.data);
        } catch (err) {
          console.error("[suspense] edit failed", err);
        }
      })());
      return Response.json({
        type: 4,
        data: {
          flags: result.data.flags ?? 1 << 15,
          components: [{ type: 17, accent_color: 11032055, components: [{ type: 12, items: [{ media: { url: sus[1] } }] }, { type: 10, content: `## ${sus[0]}` }, { type: 10, content: "-# 5\uCD08 \uB4A4\uC5D0 \uACB0\uACFC\uAC00 \uB098\uC640\uC694" }] }]
        }
      });
    }
    return Response.json(result);
  }
};
export {
  BotState,
  index_default as default
};
//# sourceMappingURL=index.js.map