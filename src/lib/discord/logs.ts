import {
  actionRow,
  button,
  ButtonStyle,
  cid,
  container,
  mediaGallery,
  MessageFlags,
  sectionText,
  separator,
  textDisplay,
  thumbnail,
} from "@/lib/discord/components";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import { shopUrl } from "@/lib/domain";
import { randomBoxGifUrl } from "@/lib/random-box-gif";
import { getShopById, getShopSettings, MFA_SHOP_SLUG } from "@/lib/store";

const DOES_PURCHASE_BANNER = "https://doesmc.xyz/brand/does-purchase-banner.jpg";
import { formatKRW } from "@/lib/utils";

export type DiscordLogKind =
  | "purchase"
  | "charge"
  | "charge_complete"
  | "admin"
  | "review"
  | "restock"
  | "random_box";

const CHANNEL_KEY: Record<DiscordLogKind, keyof ReturnType<typeof getShopSettings> | null> = {
  purchase: "discordPurchaseLogChannelId",
  charge: "discordChargeLogChannelId",
  charge_complete: "discordChargeLogChannelId",
  admin: "discordAdminLogChannelId",
  review: "discordReviewLogChannelId",
  restock: "discordRestockLogChannelId",
  random_box: "discordRandomBoxLogChannelId",
};

type LogExtras = {
  /** 컨테이너 위에 따로 띄울 컴포넌트 (역할 멘션 등) */
  before?: unknown[];
  mentionRoles?: string[];
};

function v2Payload(kids: unknown[], extras?: LogExtras) {
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [...(extras?.before ?? []), container(kids)],
    ...(extras?.mentionRoles ? { allowed_mentions: { parse: ["users"], roles: extras.mentionRoles } } : {}),
  };
}

async function postV2Log(
  shopId: string,
  kind: DiscordLogKind,
  kids: unknown[],
  extras?: LogExtras,
) {
  const settings = getShopSettings(shopId);
  if (!settings.discordBotEnabled) {
    return { ok: false as const, skipped: true as const, reason: "bot_disabled" };
  }
  const key = CHANNEL_KEY[kind];
  const channelId = key ? (settings[key] as string | null) : null;
  if (!channelId) {
    return { ok: false as const, skipped: true as const, reason: "no_channel" };
  }

  const result = await postChannelMessage(channelId, v2Payload(kids, extras), shopId);
  if (!result.ok) {
    console.error("[discord-log]", kind, channelId, result.status, result.json);
  }
  return result;
}

function scheduleLog(shopId: string, kind: DiscordLogKind, kids: unknown[], extras?: LogExtras) {
  const task = postV2Log(shopId, kind, kids, extras).catch((err) => {
    console.error("[discord-log] failed", kind, err);
    return { ok: false as const, status: 0, json: null };
  });
  scheduleDiscordBackground(task);
  return task;
}

/** 버튼자판기 ## 구매 로그 */
export function postPurchaseLog(
  shopId: string,
  input: {
    buyerMention: string;
    productName: string;
    quantity: number;
    /** 이 제품의 누적 판매 개수 (이번 구매 포함) */
    totalSold: number;
  },
) {
  const kids: unknown[] = [];
  if (getShopById(shopId)?.slug === MFA_SHOP_SLUG) kids.push(mediaGallery([DOES_PURCHASE_BANNER]));
  kids.push(
    textDisplay("## 구매 로그"),
    separator(true, 1),
    textDisplay(`${input.buyerMention} 님 **${input.productName}** **${input.quantity}개** 구매 감사드립니다!`),
    separator(true, 1),
    textDisplay(`누적판매 **${input.totalSold.toLocaleString("ko-KR")}개**  ·  <t:${Math.floor(Date.now() / 1000)}:f>`),
  );
  return scheduleLog(shopId, "purchase", kids);
}

export function postRandomBoxLog(
  shopId: string,
  input: {
    mention: string;
    name: string;
    amount: number;
    jackpot: boolean;
    already: boolean;
  },
) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const amount = `${input.amount.toLocaleString("ko-KR")}원`;
  return scheduleLog(shopId, "random_box", [
    mediaGallery([randomBoxGifUrl(input.amount)]),
    textDisplay(input.jackpot ? "## 랜덤박스 잭팟" : "## 랜덤박스"),
    separator(true, 1),
    textDisplay(`**당첨자**\n${input.mention} (${input.name})`),
    textDisplay(`**금액**\n${input.jackpot ? `🎰 ${amount}` : amount}`),
    ...(input.already ? [textDisplay("-# 오늘은 이미 열어 본 상자예요.")] : []),
    separator(true, 1),
    textDisplay(`-# ${ts}`),
  ]);
}

async function discordAvatarUrl(shopId: string, discordId: string) {
  const res = await discordRest("GET", `/users/${discordId}`, undefined, shopId).catch(() => null);
  const avatar = res?.ok ? (res.json as { avatar?: string | null } | null)?.avatar : null;
  if (avatar) return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=128`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(discordId) >> BigInt(22)) % BigInt(6))}.png`;
}

/** 버튼자판기 ## 후기 감사합니다 */
export function postReviewLog(
  shopId: string,
  input: {
    authorMention: string;
    authorDiscordId: string | null;
    productName: string;
    body: string;
  },
) {
  const head = `## 후기 감사합니다\n**${input.productName}**`;
  const task = (async () => {
    const avatar = input.authorDiscordId ? await discordAvatarUrl(shopId, input.authorDiscordId) : null;
    return postV2Log(shopId, "review", [
      avatar ? sectionText({ text: head, accessory: thumbnail(avatar) }) : textDisplay(head),
      separator(true, 1),
      textDisplay("### 후기 내용"),
      separator(true, 1),
      textDisplay(input.body.slice(0, 1800) || "-"),
      separator(true, 1),
      textDisplay(`-# ${input.authorMention} · ${input.productName} · <t:${Math.floor(Date.now() / 1000)}:f>`),
    ]);
  })().catch((err) => {
    console.error("[discord-log] failed", "review", err);
    return { ok: false as const, status: 0, json: null };
  });
  scheduleDiscordBackground(task);
  return task;
}

/** 버튼자판기 ## 충전 완료 (자동/승인 후) */
export function postChargeCompleteLog(
  shopId: string,
  input: {
    userMention: string;
    userName: string;
    depositorName: string;
    amount: number;
    balance: number;
  },
) {
  return scheduleLog(shopId, "charge_complete", [
    textDisplay("## 충전 완료"),
    separator(true, 1),
    textDisplay(`**사용자**\n${input.userMention} (${input.userName})`),
    textDisplay(`**입금자명**\n${input.depositorName}`),
    textDisplay(`**충전 금액**\n${input.amount.toLocaleString()}원`),
    textDisplay(`**현재 잔액**\n${input.balance.toLocaleString()}원`),
  ]);
}

/** ## 입고 알림 — /입고알림 으로 정한 채널에, 정한 역할을 멘션해서 보낸다 */
export function postRestockLog(
  shopId: string,
  input: {
    productName: string;
    addedCount: number;
    newTotal: number;
    price?: number;
  },
) {
  const settings = getShopSettings(shopId);
  const slug = getShopById(shopId)?.slug ?? "shop";
  const roleId = settings.discordRestockRoleId;
  const count = (n: number) => `${n.toLocaleString("ko-KR")}개`;
  return scheduleLog(
    shopId,
    "restock",
    [
      textDisplay("## 입고 알림"),
      textDisplay(`**${input.productName}** 상품이 입고되었어요.`),
      separator(true, 1),
      textDisplay(
        [
          `**추가된 재고** ${count(input.addedCount)}`,
          `**현재 재고** ${count(input.newTotal)}`,
          ...(input.price != null ? [`**가격** ${formatKRW(input.price)}`] : []),
        ].join("\n"),
      ),
      separator(true, 1),
      textDisplay(`-# <t:${Math.floor(Date.now() / 1000)}:f>`),
      actionRow(
        button({ label: "재고현황", customId: cid(slug, "stock_view") }),
        button({ label: "바로 구매하기", url: shopUrl(slug, "/dashboard"), style: ButtonStyle.LINK }),
      ),
    ],
    roleId ? { before: [textDisplay(`<@&${roleId}>`)], mentionRoles: [roleId] } : undefined,
  );
}

/** 수동 충전 로그는 admin-commands에서 직접 전송 — 여기선 일반 관리 로그 */
export function postAdminLog(
  shopId: string,
  input: { title: string; lines: string[] },
) {
  return scheduleLog(shopId, "admin", [
    textDisplay(`## ${input.title}`.slice(0, 200)),
    separator(true, 1),
    ...input.lines.map((l) => textDisplay(l.slice(0, 4000))),
  ]);
}

/**
 * 하위 호환: 예전 embed 호출을 V2 필드로 변환
 * (가능하면 postPurchaseLog / postReviewLog 등을 직접 쓰세요)
 */
export function postShopDiscordLog(
  shopId: string,
  kind: DiscordLogKind | "charge" | "purchase" | "review" | "restock" | "admin",
  opts: {
    description?: string;
    vars?: Record<string, string>;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: string;
  },
) {
  const kids: unknown[] = [
    textDisplay(`## ${kind === "purchase" ? "구매 로그" : kind === "review" ? "새로운 구매 후기" : kind === "restock" ? "입고 알림" : kind === "charge" || kind === "charge_complete" ? "충전 완료" : "관리자 로그"}`),
    separator(true, 1),
  ];
  if (opts.description) {
    kids.push(textDisplay(opts.description.slice(0, 4000)));
  }
  for (const f of opts.fields ?? []) {
    kids.push(textDisplay(`**${f.name}**\n${f.value}`.slice(0, 4000)));
  }
  if (opts.footer) {
    kids.push(separator(true, 1));
    kids.push(textDisplay(`-# ${opts.footer}`.slice(0, 4000)));
  }
  const mapped: DiscordLogKind =
    kind === "charge" ? "charge_complete" : (kind as DiscordLogKind);
  return scheduleLog(shopId, mapped, kids);
}

export type DiscordGuildChannel = {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
};

export function filterTextChannels(raw: unknown): DiscordGuildChannel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((ch): ch is Record<string, unknown> => Boolean(ch) && typeof ch === "object")
    .filter((ch) => ch.type === 0 || ch.type === 5)
    .map((ch) => ({
      id: String(ch.id),
      name: String(ch.name ?? "channel"),
      type: Number(ch.type),
      parentId: ch.parent_id ? String(ch.parent_id) : null,
      position: Number(ch.position ?? 0),
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}
