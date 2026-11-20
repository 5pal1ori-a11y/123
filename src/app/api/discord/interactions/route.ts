import { NextResponse } from "next/server";
import { ensureAppEmojis, plainEmoji } from "@/lib/discord/app-emojis";
import {
  DISCORD_API,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  parseCid,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { handleDiscordInteraction } from "@/lib/discord/router";
import {
  cleanDiscordPublicKey,
  discordEnvAsync,
  verifyDiscordRequest,
} from "@/lib/discord/verify";
import { DOES_PUBLIC_KEY } from "@/lib/discord/does-env";
import { syncDoesCommandsOnce } from "@/lib/discord/sync-mfa-does";
import { findShopByGuildIdLoose } from "@/lib/discord/admin-commands";
import { findShopByDiscordGuildId, getShopSettings, getUserByDiscordId, initStore, listShops } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ShopKey = { key: string; slug: string; applicationId: string | null; guildId: string | null };

async function collectShopPublicKeys() {
  const keys: ShopKey[] = [];
  try {
    await initStore({ force: true });
    for (const shop of listShops()) {
      const settings = getShopSettings(shop.id);
      const key = cleanDiscordPublicKey(settings.discordPublicKey);
      if (key) {
        keys.push({
          key,
          slug: shop.slug,
          applicationId: settings.discordApplicationId?.trim() || null,
          guildId: settings.discordGuildId?.trim() || null,
        });
      }
    }
  } catch {
    /* platform only */
  }
  return keys;
}

/** 상점이 직접 등록한 공개키로 서명된 요청은 그 상점 자신의 봇 · 서버 · 버튼일 때만 받는다 */
function belongsToShop(body: string, shop: ShopKey) {
  let parsed: DiscordInteraction;
  try {
    parsed = JSON.parse(body) as DiscordInteraction;
  } catch {
    return false;
  }
  if (shop.applicationId && parsed.application_id !== shop.applicationId) return false;
  const cid = parseCid(parsed.data?.custom_id ?? "");
  if (cid && cid.shopSlug !== shop.slug) return false;
  if (parsed.guild_id) return Boolean(shop.guildId) && parsed.guild_id === shop.guildId;
  return Boolean(cid);
}

function isDiscordPingBody(body: string) {
  try {
    const parsed = JSON.parse(body) as { type?: number };
    return parsed?.type === InteractionType.PING;
  } catch {
    return false;
  }
}

async function verifyInteraction(
  platformKey: string,
  signature: string | null,
  timestamp: string | null,
  body: string,
) {
  // Missing headers → fail fast (Discord portal / scrapers)
  if (!signature || !timestamp) return false;

  const platform = cleanDiscordPublicKey(platformKey);
  // Fast path: platform bot key — no KV read
  if (platform && (await verifyDiscordRequest(platform, signature, timestamp, body))) {
    return true;
  }
  // DOES 봇(discord-shop-bot)이 자기가 모르는 명령 · 버튼을 서명째로 넘겨준다
  if (DOES_PUBLIC_KEY !== platform && (await verifyDiscordRequest(DOES_PUBLIC_KEY, signature, timestamp, body))) {
    return true;
  }

  // Endpoint URL validation is always a PING for this application.
  // Never hit KV here — shop key scan can exceed Discord's verify timeout.
  if (isDiscordPingBody(body)) return false;

  // Slow path: per-shop custom bots (real interactions only)
  const shopKeys = await collectShopPublicKeys();
  for (const shop of shopKeys) {
    if (shop.key === platform || shop.key === DOES_PUBLIC_KEY) continue;
    if (await verifyDiscordRequest(shop.key, signature, timestamp, body)) return belongsToShop(body, shop);
  }
  return false;
}

function needsSyncModalResponse(interaction: DiscordInteraction) {
  // 자동완성은 미룰 수 없다
  if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) return true;
  if (interaction.type === InteractionType.MESSAGE_COMPONENT && /^tk\|[^|]*\|close\|/.test(interaction.data?.custom_id ?? "")) {
    return true;
  }
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    if (interaction.data?.name === "버튼") return true;
    // /충전 (금액 없음) → 모달 즉시 오픈
    if (interaction.data?.name === "충전") {
      const opts = interaction.data.options;
      const amountOpt = Array.isArray(opts)
        ? opts.find((o) => o && typeof o === "object" && (o as { name?: string }).name === "금액")
        : null;
      const val = amountOpt && typeof amountOpt === "object" ? (amountOpt as { value?: unknown }).value : undefined;
      return val === undefined || val === null || val === "";
    }
    return false;
  }
  if (interaction.type !== InteractionType.MESSAGE_COMPONENT) return false;
  const parsed = parseCid(interaction.data?.custom_id ?? "");
  const action = parsed?.action;
  return (
    // 재고 요청 '직접 적어서 요청' 은 입력 창(모달)을 바로 열어야 한다
    action === "sr_custom" ||
    // 프록시 등록하기 · 승인 · 거절 → 입력 창(모달)
    action === "px_reg" ||
    action === "px_ok" ||
    action === "px_no" ||
    // 코인대행 구매 · 송금 · 거절 → 입력 창(모달)
    action === "cn_buy" ||
    action === "cn_pick" ||
    action === "cn_rev" ||
    // 구해드림 신청 · 납품 · 거절 → 입력 창(모달)
    action === "gg_new" ||
    action === "gg_off" ||
    action === "gg_rej" ||
    // 매입가 제시 · 반려 → 입력 창(모달)
    action === "bb_off" ||
    action === "bb_rej" ||
    // 케어 보상 승인 · 거절 → 입력 창(모달)
    action === "cr_ok" ||
    action === "cr_no" ||
    // 렌탈 상품 등록 · 반납 완료 → 입력 창(모달)
    action === "rt_add" ||
    action === "rt_done" ||
    action === "cn_send" ||
    action === "cn_rej" ||
    action === "chg_custom" ||
    action === "menu_charge" ||
    action === "menu_coupon" ||
    action === "buy_select" ||
    action === "rev_write" ||
    action === "chg_ok" ||
    action === "chg_no" ||
    action === "ext_lic" ||
    action === "pbot_token" ||
    action === "emb_pick" ||
    action === "tk_topic_add"
  );
}

/** /충전 금액 — 입금자명을 아직 안 정한 이용자는 모달을 바로 띄워야 한다 */
async function chargeNeedsDepositorModal(interaction: DiscordInteraction) {
  if (interaction.type !== InteractionType.APPLICATION_COMMAND || interaction.data?.name !== "충전") return false;
  const guildId = interaction.guild_id;
  const discordId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!guildId || !discordId) return false;
  try {
    await initStore();
    const shop = findShopByGuildIdLoose(guildId) ?? findShopByDiscordGuildId(guildId);
    if (!shop) return false;
    const user = getUserByDiscordId(shop.id, discordId);
    return Boolean(user && !user.bankDepositorName?.trim());
  } catch {
    return false;
  }
}

/** 누른 메시지를 그 자리에서 고쳐 쓰는 동작 — 나머지는 버튼자판기처럼 새 ephemeral 응답 */
const UPDATE_IN_PLACE = new Set([
  // 렌탈: 기간 확인 · 결제 · 연장 · 반납 → 그 창을, 관리자 버튼 · 반납 모달 → 카드를 그 자리에서 바꾼다
  "rt_day",
  "rt_go",
  "rt_x",
  "rt_ext",
  "rt_ret",
  "rt_hide",
  "rt_del",
  "rt_donem",
  // 시즌패스 ◀ ▶ · 보상 받기 · 패스 구매
  "sp_pg",
  "sp_claim",
  "sp_buy",
  // 프록시 승인·거절 모달 → 관리자 채널의 신청 카드를 그 자리에서 결과로 바꾼다
  "px_okm",
  "px_nom",
  // 코인대행: 견적 확정·취소 → 견적 메시지를, 송금·거절 모달 → 관리자 카드를 그 자리에서 바꾼다
  "cn_ok",
  "cn_cancel",
  "cn_sendm",
  "cn_rejm",
  "emb_modal",
  "emb_send",
  "emb_back",
  "emb_reset",
  "emb_ch",
  "stock_refresh",
  "stock_pg",
  "tk_cat",
  "tk_roles",
  "tk_log",
  "tk_topic_del",
  "tk_topic_modal",
  "tk_post",
  "tk_ai",
]);

function shouldDeferUpdate(interaction: DiscordInteraction) {
  if (interaction.type !== InteractionType.MESSAGE_COMPONENT && interaction.type !== InteractionType.MODAL_SUBMIT) {
    return false;
  }
  return UPDATE_IN_PLACE.has(parseCid(interaction.data?.custom_id ?? "")?.action ?? "");
}

function deferredEphemeral(interaction: DiscordInteraction) {
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    // /자판기 is public Components V2
    const publicCommands = ["자판기", "island", "추천인", "재고요청", "인증", "인증하기", "출석상점"];
    if (publicCommands.includes(interaction.data?.name ?? "")) return false;
  }
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    const action = parseCid(interaction.data?.custom_id ?? "")?.action;
    // /버튼 모달 제출 → 공개 패널
    // (재고 요청 접수 안내는 요청한 사람에게만 보여야 해서 여기서 빼지 않는다)
    if (action === "btn_modal") return false;
  }
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const action = parseCid(interaction.data?.custom_id ?? "")?.action;
    if (action === "refresh") return false;
  }
  return true;
}

async function getCfWaitUntil(): Promise<((p: Promise<unknown>) => void) | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    if (ctx && typeof ctx.waitUntil === "function") {
      return (p) => ctx.waitUntil(p);
    }
  } catch {
    /* local / non-CF */
  }
  return null;
}

async function editOriginalInteraction(
  applicationId: string,
  token: string,
  data: Record<string, unknown>,
) {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${applicationId}/${token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[discord] followup edit failed", res.status, text.slice(0, 300));
  }
}

/** 결과를 바로 보여 주지 않고 '여는 중…' 을 5초 보여 준 뒤 공개하는 동작 */
function suspenseFor(interaction: DiscordInteraction): { title: string; gif: string } | null {
  const origin = "https://doesmc.xyz";
  if (interaction.type === 2) {
    const name = interaction.data?.name ?? "";
    if (name === "출석") return { title: `${plainEmoji("does_gift")} 출석 상자를 여는 중…`, gif: `${origin}/brand/suspense-checkin-3d.gif` };
    if (name === "도박") return { title: `${plainEmoji("does_jackpot")} 슬롯을 돌리는 중…`, gif: `${origin}/brand/suspense-gamble-3d.gif` };
    return null;
  }
  const parsed = parseCid(interaction.data?.custom_id ?? "");
  if (parsed?.action === "gacha_draw") return { title: `${plainEmoji("does_gift")} 뽑는 중…`, gif: `${origin}/brand/gacha3d2-idle.gif` };
  if (parsed?.action === "rbox_open" || parsed?.action === "mine_paid") return { title: `${plainEmoji("does_pickaxe")} 곡괭이질 하는 중…`, gif: `${origin}/api/discord/rbox/idle-3d2.gif` };
  return null;
}

const SUSPENSE_MS = 5000;

async function processDeferred(interaction: DiscordInteraction) {
  try {
    await initStore({ force: true });
    await ensureAppEmojis().catch(() => null);
    const suspense = suspenseFor(interaction);
    const started = Date.now();
    if (suspense) {
      await editOriginalInteraction(interaction.application_id, interaction.token, {
        content: null,
        embeds: [],
        flags: MessageFlags.IS_COMPONENTS_V2,
        components: [
          {
            type: 17,
            accent_color: 0xa855f7,
            components: [
              { type: 12, items: [{ media: { url: suspense.gif } }] },
              { type: 10, content: `## ${suspense.title}` },
              { type: 10, content: "-# 5초 뒤에 결과가 나와요" },
            ],
          },
        ],
      }).catch(() => null);
    }
    const response = await handleDiscordInteraction(interaction);
    if (suspense) {
      const wait = SUSPENSE_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    const type = (response as { type?: number }).type;
    const data = (response as { data?: Record<string, unknown> }).data;

    if (type === InteractionResponseType.MODAL) {
      await editOriginalInteraction(interaction.application_id, interaction.token, {
        content: "이 동작은 모달이 필요해서 다시 버튼을 눌러 주세요.",
        flags: MessageFlags.EPHEMERAL,
      });
      return;
    }
    // 핸들러가 직접 후속 메시지를 고쳐 쓰는 경우 — 여기서 덮어쓰지 않는다
    if (
      type === InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE ||
      type === InteractionResponseType.DEFERRED_UPDATE_MESSAGE
    ) {
      return;
    }

    if (data) {
      const isV2 =
        typeof data.flags === "number" &&
        (data.flags & MessageFlags.IS_COMPONENTS_V2) === MessageFlags.IS_COMPONENTS_V2;

      if (isV2) {
        await editOriginalInteraction(interaction.application_id, interaction.token, {
          content: null,
          embeds: [],
          components: Array.isArray(data.components) ? data.components : [],
          flags: data.flags,
          ...(data.allowed_mentions ? { allowed_mentions: data.allowed_mentions } : {}),
        });
        return;
      }

      await editOriginalInteraction(interaction.application_id, interaction.token, {
        content: typeof data.content === "string" && data.content ? data.content : null,
        embeds: Array.isArray(data.embeds) ? data.embeds : [],
        components: Array.isArray(data.components) ? data.components : [],
        ...(typeof data.flags === "number" ? { flags: data.flags } : {}),
        ...(data.allowed_mentions ? { allowed_mentions: data.allowed_mentions } : {}),
      });
      return;
    }

    await editOriginalInteraction(interaction.application_id, interaction.token, {
      content: "응답을 만들지 못했어요.",
      flags: MessageFlags.EPHEMERAL,
    });
  } catch (err) {
    console.error("[discord] deferred interaction error", err);
    try {
      await editOriginalInteraction(interaction.application_id, interaction.token, {
        content: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
        flags: MessageFlags.EPHEMERAL,
      });
    } catch {
      /* ignore */
    }
  }
}

async function handleSync(interaction: DiscordInteraction) {
  await initStore({ force: true });
  return handleDiscordInteraction(interaction);
}

export async function POST(request: Request) {
  const env = await discordEnvAsync();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();

  if (!(await verifyInteraction(env.publicKey, signature, timestamp, body))) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  // Modal open must be a direct type-9 response (cannot defer)
  if (needsSyncModalResponse(interaction) || (await chargeNeedsDepositorModal(interaction))) {
    try {
      return NextResponse.json(await handleSync(interaction));
    } catch (err) {
      console.error("[discord] interaction error", err);
      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
          flags: MessageFlags.EPHEMERAL,
        },
      });
    }
  }

  const waitUntil = await getCfWaitUntil();
  if (waitUntil) {
    const sync = syncDoesCommandsOnce();
    if (sync) waitUntil(sync);
    waitUntil(processDeferred(interaction));
    if (shouldDeferUpdate(interaction)) {
      return NextResponse.json({
        type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
      });
    }
    const ephemeral = deferredEphemeral(interaction);
    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: ephemeral ? { flags: MessageFlags.EPHEMERAL } : {},
    });
  }

  // Local / no waitUntil — respond inline (still benefits from store cache + fast verify)
  try {
    return NextResponse.json(await handleSync(interaction));
  } catch (err) {
    console.error("[discord] interaction error", err);
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
        flags: MessageFlags.EPHEMERAL,
      },
    });
  }
}
