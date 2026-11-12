import { randomBytes } from "crypto";
import { shopUrl } from "@/lib/domain";
import {
  actionRow,
  button,
  ButtonStyle,
  cid,
  container,
  errorPanel,
  fieldEmbed,
  InteractionResponseType,
  MessageFlags,
  separator,
  showModal,
  textDisplay,
  textInput,
} from "@/lib/discord/components";
import { sendDiscordDm } from "@/lib/discord/dm";
import { fetchDiscordGuildOwnerId, postChannelMessage } from "@/lib/discord/rest";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import type { LicensePlan, ShopSettings } from "@/lib/types";
import { planFeatureError } from "@/lib/plans";
import {
  activateShop,
  creditUserPoints,
  extendShopByLicenseKey,
  findShopByDiscordGuildId,
  getLicenseByKey,
  getShopSettings,
  getShopSubscriptionStatus,
  getUserByDiscordId,
  issueLicenses,
  listShops,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";

function isPlatformDiscordAdmin(discordId: string) {
  const raw = process.env.PLATFORM_DISCORD_ADMIN_IDS?.trim() || "";
  if (!raw) return false;
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(discordId);
}

function isGuildAdmin(permissions?: string) {
  if (!permissions) return false;
  try {
    const p = BigInt(permissions);
    return (p & BigInt(0x8)) === BigInt(0x8) || (p & BigInt(0x20)) === BigInt(0x20);
  } catch {
    return false;
  }
}

function isShopDiscordAdmin(
  settings: ShopSettings,
  roles: string[],
  permissions?: string,
) {
  if (isGuildAdmin(permissions)) return true;
  if (settings.discordAdminRoleId && roles.includes(settings.discordAdminRoleId)) return true;
  return false;
}

function remainingTimeText(expiresAt: string | null | undefined) {
  if (!expiresAt) return "알 수 없음";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "알 수 없음";
  if (ms <= 0) return "만료됨";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}일 ${hours}시간`;
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}시간 ${mins}분`;
}

function planFromDays(days: number): LicensePlan {
  if (days <= 7) return "free";
  if (days <= 30) return "lite";
  if (days <= 90) return "pro";
  return "pro_max";
}

function slugifyGuild(name: string, guildId: string) {
  let base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  if (base.length < 2) base = `g${guildId.slice(-8)}`;
  const taken = new Set(listShops().map((s) => s.slug));
  if (!taken.has(base)) return base;
  for (let i = 0; i < 30; i++) {
    const cand = `${base.slice(0, 12)}-${(guildId + i).slice(-5)}`.replace(/[^a-z0-9-]/g, "").slice(0, 24);
    if (cand.length >= 2 && !taken.has(cand)) return cand;
  }
  return `s-${guildId.slice(-10)}`;
}

function randomPassword(len = 16) {
  return randomBytes(Math.ceil(len / 2))
    .toString("hex")
    .slice(0, len);
}

export function findShopByGuildIdLoose(guildId: string) {
  const linked = findShopByDiscordGuildId(guildId);
  if (linked) return linked;
  for (const shop of listShops()) {
    if (getShopSettings(shop.id).discordGuildId === guildId) return shop;
  }
  return null;
}

export async function handleLicenseCreateCommand(
  discordId: string,
  days: number,
  count: number,
) {
  if (!isPlatformDiscordAdmin(discordId)) {
    return errorPanel(
      "관리자 권한이 필요합니다.\n(PLATFORM_DISCORD_ADMIN_IDS에 Discord 유저 ID를 등록하세요)",
    );
  }
  if (!Number.isFinite(days) || days < 1) return errorPanel("기간은 1 이상이어야 합니다.");
  const qty = Math.min(20, Math.max(1, Math.floor(count || 1)));
  const plan = planFromDays(days);
  const licenses = issueLicenses({
    plan,
    count: qty,
    issuedBy: `discord:${discordId}`,
    buyerEmail: "issued@vendix.team",
  });
  await persistAsync();
  return fieldEmbed({
    title: "완료",
    description: `라이센스 ${qty}개 생성이 완료되었습니다. (기간: ${days}일 → ${plan})\n\n${licenses
      .map((l) => `\`${l.key}\``)
      .join("\n")}`,
    fields: [],
  });
}

export async function handlePersonalBotLicenseCommand(
  discordId: string,
  days: number,
  count: number,
) {
  if (!isPlatformDiscordAdmin(discordId)) {
    return errorPanel(
      "관리자 권한이 필요합니다.\n(PLATFORM_DISCORD_ADMIN_IDS에 Discord 유저 ID를 등록하세요)",
    );
  }
  if (!Number.isFinite(days) || days < 1) return errorPanel("일수는 1 이상이어야 합니다.");
  const qty = Math.min(20, Math.max(1, Math.floor(count || 1)));
  // 개인봇은 항상 PRO MAX
  const plan: LicensePlan = "pro_max";
  const licenses = issueLicenses({
    plan,
    count: qty,
    issuedBy: `personal_bot:${discordId}`,
    buyerEmail: "personal-bot@vendix.team",
  });
  await persistAsync();
  return fieldEmbed({
    title: "완료",
    description: `개인봇 라이센스 ${qty}개 생성이 완료되었습니다. (기간: ${days}일 · PRO MAX)\n\n${licenses
      .map((l) => `\`${l.key}\``)
      .join(
        "\n",
      )}\n\n이 라이센스로 웹에서 상점을 등록한 뒤 Discord Guild를 연동하고 \`/개인봇설정\`으로 자체 봇 토큰을 넣으세요.`,
    fields: [],
  });
}

export async function handleGuildRegisterCommand(input: {
  guildId: string;
  guildName: string;
  licenseKey: string;
  discordId: string;
  roles: string[];
  permissions?: string;
}) {
  const ownerId = await fetchDiscordGuildOwnerId(input.guildId);
  if (!ownerId || ownerId !== input.discordId) {
    return errorPanel("서버 소유자만 상점을 등록할 수 있습니다.");
  }
  if (findShopByGuildIdLoose(input.guildId)) {
    return errorPanel("이미 이 서버에 등록된 상점이 있습니다.");
  }

  const key = input.licenseKey.trim();
  const lic = getLicenseByKey(key);
  if (!lic) return errorPanel("존재하지 않는 라이센스입니다.");
  const isPersonal = lic.buyerEmail === "personal-bot@vendix.team";

  const password = randomPassword(16);
  const slug = slugifyGuild(input.guildName, input.guildId);
  const result = activateShop({
    licenseKey: key,
    slug,
    name: (input.guildName || slug).slice(0, 40),
    ownerEmail: `${input.discordId}@discord.vendix.local`,
    adminPassword: password,
    tagline: "자판기 서비스 이용을 환영합니다.",
  });
  if (!result.ok) return errorPanel(result.error);

  updateShopSettings(result.shop.id, {
    discordGuildId: input.guildId,
    discordBotEnabled: true,
    discordOwnerId: input.discordId,
    discordEmbedTitle: input.guildName.slice(0, 100) || result.shop.name,
    discordEmbedDescription: "자판기 서비스 이용을 환영합니다.",
  });
  await persistAsync();

  const panelUrl = `https://${result.shop.slug}.vendix.team/admin`;
  const kids: unknown[] = [
    textDisplay("## 성공"),
    separator(true, 1),
    textDisplay("정상 등록되었습니다."),
    textDisplay(`**상점 주소**\n\`${result.shop.slug}\``),
    textDisplay(`**웹패널**\n${panelUrl}`),
    textDisplay("**아이디**\n`admin`"),
    textDisplay(`**비밀번호**\n||\`${password}\`||`),
  ];
  if (isPersonal) {
    kids.push(
      separator(true, 1),
      textDisplay(
        "개인봇 라이센스입니다. 아래 버튼을 눌러 자신의 봇 토큰을 설정해주세요.\n토큰을 설정하면 그 봇으로 명령어를 사용할 수 있습니다.",
      ),
      separator(true, 2),
      actionRow(
        button({
          customId: cid(result.shop.slug, "pbot_token"),
          label: "봇 토큰 설정",
          style: ButtonStyle.SUCCESS,
        }),
      ),
    );
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.EPHEMERAL | MessageFlags.IS_COMPONENTS_V2,
      components: [container(kids)],
    },
  };
}

export function handleServerInfoCommand(shopSlug: string) {
  const shop = listShops().find((s) => s.slug === shopSlug);
  if (!shop) return errorPanel("서버가 등록되지 않았습니다.");
  const expire = shop.expiresAt
    ? new Date(shop.expiresAt).toLocaleString("ko-KR", { hour12: false })
    : "알 수 없음";

  return fieldEmbed({
    title: "서버 정보",
    fields: [
      { name: "라이센스 만료일", value: expire, fence: false },
      { name: "남은 기간", value: remainingTimeText(shop.expiresAt), fence: false },
      { name: "플랜", value: shop.plan, fence: false },
      { name: "상태", value: getShopSubscriptionStatus(shop), fence: false },
    ],
    components: [
      actionRow(
        button({
          customId: cid(shop.slug, "ext_lic"),
          label: "라이센스 연장",
          style: ButtonStyle.PRIMARY,
        }),
      ),
    ],
  });
}

export function handleExtendLicenseModal(shopSlug: string) {
  return showModal({
    customId: cid(shopSlug, "ext_modal"),
    title: "라이센스 연장",
    inputs: [
      textInput({
        customId: "license",
        label: "연장용 라이센스",
        placeholder: "관리자에게 발급받은 라이센스를 입력해주세요",
        required: true,
        minLength: 1,
        maxLength: 64,
      }),
    ],
  });
}

export async function handleExtendLicenseSubmit(shopSlug: string, licenseKey: string) {
  const shop = listShops().find((s) => s.slug === shopSlug);
  if (!shop) return errorPanel("서버가 등록되지 않았습니다.");
  const result = extendShopByLicenseKey(shop.id, licenseKey.trim());
  if (!result.ok) return errorPanel(result.error);
  await persistAsync();
  return fieldEmbed({
    title: "연장 완료",
    fields: [
      {
        name: "새 만료일",
        value: new Date(result.shop.expiresAt).toLocaleString("ko-KR", { hour12: false }),
        fence: false,
      },
      { name: "남은 기간", value: remainingTimeText(result.shop.expiresAt), fence: false },
    ],
  });
}

export function handlePersonalBotSettingsCommand(
  shopSlug: string,
  roles: string[],
  permissions?: string,
) {
  const shop = listShops().find((s) => s.slug === shopSlug);
  if (!shop) return errorPanel("서버가 등록되지 않았습니다.");
  const settings = getShopSettings(shop.id);
  if (!isShopDiscordAdmin(settings, roles, permissions)) {
    return errorPanel("관리자 권한이 필요합니다.");
  }
  const planErr = planFeatureError(shop.plan, "personal_bot");
  if (planErr) return errorPanel(planErr);

  return fieldEmbed({
    title: "개인봇 설정",
    description:
      "PRO MAX 전용 · 자체 Discord 봇 토큰을 쓰면 DOES 메인 봇 대신 개인봇으로 응답합니다.",
    fields: [
      {
        name: "봇 상태",
        value: settings.discordBotEnabled ? "시작됨" : "정지됨",
        fence: false,
      },
      {
        name: "커스텀 토큰",
        value: settings.discordBotToken?.trim() ? "설정됨 (개인봇)" : "미설정 (메인 봇 사용 중)",
        fence: false,
      },
    ],
    components: [
      actionRow(
        button({
          customId: cid(shopSlug, "pbot_token"),
          label: "토큰 변경",
          style: ButtonStyle.SECONDARY,
        }),
        button({
          customId: cid(shopSlug, "pbot_on"),
          label: "시작",
          style: ButtonStyle.SUCCESS,
        }),
        button({
          customId: cid(shopSlug, "pbot_off"),
          label: "정지",
          style: ButtonStyle.DANGER,
        }),
        button({
          customId: cid(shopSlug, "ext_lic"),
          label: "연장",
          style: ButtonStyle.PRIMARY,
        }),
      ),
    ],
  });
}

export function handlePersonalBotTokenModal(shopSlug: string) {
  const shop = listShops().find((s) => s.slug === shopSlug);
  if (!shop) return errorPanel("서버가 등록되지 않았습니다.");
  const planErr = planFeatureError(shop.plan, "personal_bot");
  if (planErr) return errorPanel(planErr);

  return showModal({
    customId: cid(shopSlug, "pbot_modal"),
    title: "개인봇 토큰 설정",
    inputs: [
      textInput({
        customId: "bot_token",
        label: "디스코드 봇 토큰",
        placeholder: "Bot 토큰을 입력해주세요",
        required: true,
        minLength: 50,
        maxLength: 120,
      }),
      textInput({
        customId: "app_id",
        label: "Application ID (선택)",
        placeholder: "숫자 Application ID",
        required: false,
        maxLength: 32,
      }),
      textInput({
        customId: "public_key",
        label: "Public Key (선택)",
        placeholder: "Interactions Public Key",
        required: false,
        maxLength: 80,
      }),
    ],
  });
}

export async function handlePersonalBotTokenSubmit(
  shopSlug: string,
  token: string,
  appId: string,
  publicKey: string,
  roles: string[],
  permissions?: string,
) {
  const shop = listShops().find((s) => s.slug === shopSlug);
  if (!shop) return errorPanel("서버가 등록되지 않았습니다.");
  const settings = getShopSettings(shop.id);
  if (!isShopDiscordAdmin(settings, roles, permissions)) {
    return errorPanel("관리자 권한이 필요합니다.");
  }
  const planErr = planFeatureError(shop.plan, "personal_bot");
  if (planErr) return errorPanel(planErr);
  updateShopSettings(shop.id, {
    discordBotToken: token.trim(),
    discordBotEnabled: true,
    ...(appId.trim() ? { discordApplicationId: appId.trim() } : {}),
    ...(publicKey.trim() ? { discordPublicKey: publicKey.trim() } : {}),
  });
  await persistAsync();
  return fieldEmbed({
    title: "완료",
    description: "봇 토큰이 저장되었습니다. 봇이 시작 상태로 설정됐어요.",
    fields: [],
  });
}

export async function handlePersonalBotToggle(
  shopSlug: string,
  enable: boolean,
  roles: string[],
  permissions?: string,
) {
  const shop = listShops().find((s) => s.slug === shopSlug);
  if (!shop) return errorPanel("서버가 등록되지 않았습니다.");
  const settings = getShopSettings(shop.id);
  if (!isShopDiscordAdmin(settings, roles, permissions)) {
    return errorPanel("관리자 권한이 필요합니다.");
  }
  updateShopSettings(shop.id, { discordBotEnabled: enable });
  await persistAsync();
  return fieldEmbed({
    title: enable ? "시작" : "정지",
    description: enable ? "봇을 시작했습니다." : "봇을 정지했습니다.",
    fields: [],
  });
}

export function handleWebPanelCommand(
  shopSlug: string,
  roles: string[],
  permissions?: string,
) {
  const shop = listShops().find((s) => s.slug === shopSlug);
  if (!shop) return errorPanel("서버가 등록되지 않았습니다.");
  const settings = getShopSettings(shop.id);
  if (!isShopDiscordAdmin(settings, roles, permissions)) {
    return errorPanel("관리자 권한이 필요합니다.");
  }

  const loginUrl = shopUrl(shop.slug, "/admin/login");
  const username = shop.adminUsername?.trim() || "admin";

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.EPHEMERAL | MessageFlags.IS_COMPONENTS_V2,
      components: [
        container([
          textDisplay("## 웹패널 안내"),
          separator(true, 1),
          textDisplay(
            `${loginUrl}\n아이디: \`${username}\`\n비밀번호: 관리자 페이지에서 설정한 비밀번호`,
          ),
          actionRow(
            button({
              label: "웹패널 열기",
              style: ButtonStyle.LINK,
              url: loginUrl,
            }),
          ),
        ]),
      ],
    },
  };
}

export async function handleManualChargeCommand(input: {
  shopSlug: string;
  targetDiscordId: string;
  targetName: string;
  amount: number;
  actorId: string;
  actorName: string;
  roles: string[];
  permissions?: string;
}) {
  const shop = listShops().find((s) => s.slug === input.shopSlug);
  if (!shop) return errorPanel("서버가 등록되지 않았습니다.");
  const settings = getShopSettings(shop.id);
  if (!isShopDiscordAdmin(settings, input.roles, input.permissions)) {
    return errorPanel("관리자 권한이 필요합니다.");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return errorPanel("1 이상의 금액을 입력해주세요.");
  }

  const user = getUserByDiscordId(shop.id, input.targetDiscordId);
  if (!user) {
    return errorPanel(
      "대상 유저가 상점 계정과 연동되어 있지 않습니다.\n먼저 `/연동` 후 다시 시도해주세요.",
    );
  }

  const credited = creditUserPoints(shop.id, user.id, Math.floor(input.amount), "Discord 수동 충전");
  if (!credited.ok) return errorPanel(credited.error);
  await persistAsync();

  scheduleDiscordBackground(
    sendDiscordDm(
      input.targetDiscordId,
      {
        flags: MessageFlags.IS_COMPONENTS_V2,
        components: [
          container([
            textDisplay("## 수동 충전 안내"),
            separator(true, 1),
            textDisplay("관리자에 의해 잔액이 수동 충전되었습니다."),
            textDisplay(`**충전 금액**\n${input.amount.toLocaleString()}원`),
            textDisplay(`**현재 잔액**\n${credited.balance.toLocaleString()}원`),
            separator(true, 1),
            textDisplay("자판기에서 바로 사용하실 수 있습니다."),
          ]),
        ],
      },
      shop.id,
    ),
  );

  if (settings.discordChargeLogChannelId) {
    scheduleDiscordBackground(
      postChannelMessage(
        settings.discordChargeLogChannelId,
        {
          flags: MessageFlags.IS_COMPONENTS_V2,
          components: [
            container([
              textDisplay("## 수동 충전 로그"),
              separator(true, 1),
              textDisplay(`**대상**\n<@${input.targetDiscordId}> (${input.targetName})`),
              textDisplay(`**처리자**\n<@${input.actorId}> (${input.actorName})`),
              textDisplay(`**충전 금액**\n${input.amount.toLocaleString()}원`),
              textDisplay(`**현재 잔액**\n${credited.balance.toLocaleString()}원`),
            ]),
          ],
        },
        shop.id,
      ),
    );
  }

  return fieldEmbed({
    title: "수동 충전 완료",
    fields: [
      {
        name: "대상",
        value: `<@${input.targetDiscordId}> (${input.targetName})`,
        fence: false,
      },
      { name: "충전 금액", value: `${input.amount.toLocaleString()}원`, fence: false },
      { name: "현재 잔액", value: `${credited.balance.toLocaleString()}원`, fence: false },
    ],
  });
}
