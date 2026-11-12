import {
  container,
  MessageFlags,
  separator,
  textDisplay,
} from "@/lib/discord/components";
import {
  appendManageAudit,
  appendPartnerSendLog,
  consumeBannerLicense,
  createBannerRecord,
  getBannerById,
  getBannerLicenseByCode,
  getManageGuild,
  initManageStore,
  listBanners,
  listPartnerWebhooks,
  markBannerExpired,
  persistManageStore,
  releaseBannerLicense,
  updateBannerDisplay,
} from "@/lib/manage-bot/store";
import {
  createBannerChannel,
  deleteManageChannel,
  executeDiscordWebhook,
  postManageChannelMessage,
  renameManageChannel,
} from "@/lib/manage-bot/rest";
import { emptyEmbedDraft, embedV2Payload, hasEmbedBody } from "@/lib/manage-bot/embed";
import type { ManageEmbedDraft, ManageEmbedField } from "@/lib/manage-bot/types";

export function sanitizeBannerChannelName(prefix: string, displayName: string) {
  const body = displayName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9가-힣\-『』｜|·•_]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const name = `${prefix || ""}${body || "banner"}`
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 100);
  return name || "banner";
}

export async function redeemBannerLicense(input: {
  guildId: string;
  licenseCode: string;
  displayName: string;
  ownerDiscordId: string;
  ownerUsername: string;
}) {
  await initManageStore({ force: true });
  const guild = getManageGuild(input.guildId);
  if (!guild?.enabled) return { ok: false as const, error: "관리봇이 비활성화되어 있어요." };
  if (!guild.bannerCategoryId) {
    return { ok: false as const, error: "웹패널에서 배너 카테고리를 먼저 설정해 주세요." };
  }

  const lic = getBannerLicenseByCode(input.guildId, input.licenseCode);
  if (!lic) return { ok: false as const, error: "유효하지 않은 라이선스 코드예요." };
  if (lic.redeemedAt) return { ok: false as const, error: "이미 사용된 라이선스예요." };

  const displayName = input.displayName.trim().slice(0, 40);
  if (!displayName) return { ok: false as const, error: "배너명을 입력해 주세요." };

  consumeBannerLicense({ licenseId: lic.id, ownerDiscordId: input.ownerDiscordId });
  await persistManageStore();

  const channelName = sanitizeBannerChannelName(guild.bannerChannelPrefix, displayName);
  const created = await createBannerChannel({
    guildId: input.guildId,
    name: channelName,
    parentId: guild.bannerCategoryId,
    ownerDiscordId: input.ownerDiscordId,
    topic: `상단배너 · ${displayName} · ${lic.days}일`,
  });

  if (!created.ok || !created.json || typeof created.json !== "object") {
    releaseBannerLicense(lic.id);
    await persistManageStore({ skipMerge: true });
    const msg =
      typeof created.json === "object" &&
      created.json &&
      "message" in created.json
        ? String((created.json as { message?: string }).message)
        : `채널 생성 실패 (${created.status})`;
    return { ok: false as const, error: msg };
  }

  const channelId = String((created.json as { id?: string }).id || "");
  if (!channelId) {
    releaseBannerLicense(lic.id);
    await persistManageStore({ skipMerge: true });
    return { ok: false as const, error: "채널 ID를 받지 못했어요." };
  }

  const banner = createBannerRecord({
    guildId: input.guildId,
    licenseId: lic.id,
    channelId,
    channelName,
    displayName,
    ownerDiscordId: input.ownerDiscordId,
    ownerUsername: input.ownerUsername,
    days: lic.days,
  });
  appendManageAudit({
    guildId: input.guildId,
    actor: input.ownerUsername,
    action: "banner_create",
    detail: `${displayName} · <#${channelId}> · ${lic.days}일`,
  });
  await persistManageStore();

  const expiresLabel = new Date(banner.expiresAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  });

  const posted = await postManageChannelMessage(channelId, {
    flags: MessageFlags.IS_COMPONENTS_V2,
    allowed_mentions: { users: [input.ownerDiscordId] },
    components: [
      container([
        textDisplay(`<@${input.ownerDiscordId}>`),
        separator(true, 1),
        textDisplay("## 배너 채널이 생성되었어요"),
        separator(true, 1),
        textDisplay(`**배너명**\n${displayName}`),
        textDisplay(`**생성자**\n<@${input.ownerDiscordId}>`),
        textDisplay(`**유지 기간**\n${lic.days}일`),
        textDisplay(`**만료일 (KST)**\n${expiresLabel}`),
        separator(true, 2),
        textDisplay("만료되면 이 채널은 자동으로 삭제돼요."),
      ]),
    ],
  });

  if (!posted.ok) {
    console.error("[manage-bot] welcome message failed", posted.status, posted.json);
    // Fallback plain mention (still Components V2 container-less)
    await postManageChannelMessage(channelId, {
      content: `<@${input.ownerDiscordId}> 배너 채널이 생성됐어요. 만료: ${expiresLabel}`,
      allowed_mentions: { users: [input.ownerDiscordId] },
    });
  }

  return { ok: true as const, banner, channelId };
}

export function formatBannerExpiry(expiresAt: string) {
  const expiresMs = new Date(expiresAt).getTime();
  const label = new Date(expiresAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  });
  const remainMs = expiresMs - Date.now();
  const remainDays = Math.max(0, Math.ceil(remainMs / (24 * 60 * 60 * 1000)));
  return { label, remainDays, expired: remainMs <= 0 };
}

export async function renameOwnerBanner(input: {
  bannerId: string;
  ownerDiscordId: string;
  displayName: string;
}) {
  const banner = getBannerById(input.bannerId);
  if (!banner || banner.status !== "active") {
    return { ok: false as const, error: "활성 배너를 찾을 수 없어요." };
  }
  if (banner.ownerDiscordId !== input.ownerDiscordId) {
    return { ok: false as const, error: "배너를 등록한 사람만 설정할 수 있어요." };
  }
  const guild = getManageGuild(banner.guildId);
  if (!guild) return { ok: false as const, error: "서버를 찾을 수 없어요." };

  const displayName = input.displayName.trim().slice(0, 40);
  if (!displayName) return { ok: false as const, error: "배너명을 입력해 주세요." };

  const channelName = sanitizeBannerChannelName(guild.bannerChannelPrefix, displayName);
  const daysLeft = formatBannerExpiry(banner.expiresAt).remainDays;
  const patched = await renameManageChannel(
    banner.channelId,
    channelName,
    `상단배너 · ${displayName} · 만료 ${formatBannerExpiry(banner.expiresAt).label}`,
  );
  if (!patched.ok) {
    const msg =
      typeof patched.json === "object" &&
      patched.json &&
      "message" in patched.json
        ? String((patched.json as { message?: string }).message)
        : `채널명 변경 실패 (${patched.status})`;
    return { ok: false as const, error: msg };
  }

  const updated = updateBannerDisplay({
    bannerId: banner.id,
    displayName,
    channelName,
  });
  if (!updated) return { ok: false as const, error: "배너 정보 저장에 실패했어요." };

  appendManageAudit({
    guildId: banner.guildId,
    actor: input.ownerDiscordId,
    action: "banner_rename",
    detail: `${displayName} · <#${banner.channelId}> · 남은 ${daysLeft}일`,
  });
  await persistManageStore();
  return { ok: true as const, banner: updated };
}

export async function sendPartnerBroadcast(guildId: string, opts?: { force?: boolean }) {
  const guild = getManageGuild(guildId);
  if (!guild) return { ok: false as const, error: "서버 없음", sent: 0, failed: 0 };
  if (!opts?.force && !guild.partnerEnabled) {
    return { ok: false as const, error: "자동 파트너가 꺼져 있어요.", sent: 0, failed: 0 };
  }
  const message = guild.partnerMessage?.trim();
  if (!message) return { ok: false as const, error: "홍보 문구가 비어 있어요.", sent: 0, failed: 0 };

  const hooks = listPartnerWebhooks(guildId).filter((w) => w.enabled);
  if (!hooks.length) return { ok: false as const, error: "등록된 웹훅이 없어요.", sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const w of hooks) {
    const res = await executeDiscordWebhook(w.url, {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container([
          textDisplay(message.slice(0, 3900)),
        ]),
      ],
      username: guild.partnerWebhookName || undefined,
      avatar_url: guild.partnerWebhookAvatarUrl,
    });
    w.lastSentAt = new Date().toISOString();
    w.lastError = res.ok ? null : res.error;
    appendPartnerSendLog({
      guildId,
      webhookId: w.id,
      webhookLabel: w.label,
      ok: res.ok,
      error: res.ok ? null : res.error,
      sentAt: w.lastSentAt,
    });
    if (res.ok) sent += 1;
    else failed += 1;
  }

  if (opts?.force !== true) {
    // mark day's send for scheduled runs
  }
  await persistManageStore();
  return { ok: true as const, sent, failed };
}

export function kstNowParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export async function expireDueBanners() {
  const { listAllManageGuilds } = await import("@/lib/manage-bot/store");
  const now = Date.now();
  let expired = 0;
  for (const g of listAllManageGuilds()) {
    for (const b of listBanners(g.guildId, "active")) {
      if (new Date(b.expiresAt).getTime() > now) continue;
      await deleteManageChannel(b.channelId, "배너 라이선스 만료");
      markBannerExpired(b.id);
      appendManageAudit({
        guildId: g.guildId,
        actor: "system",
        action: "banner_expire",
        detail: `${b.displayName} · ${b.channelName}`,
      });
      expired += 1;
    }
  }
  if (expired) await persistManageStore();
  return { expired };
}

export async function runScheduledPartnerPosts() {
  const { listAllManageGuilds } = await import("@/lib/manage-bot/store");
  const kst = kstNowParts();
  let ran = 0;
  for (const g of listAllManageGuilds()) {
    if (!g.partnerEnabled) continue;
    if (g.partnerLastSentDateKst === kst.date) continue;
    const scheduledMins = g.partnerHourKst * 60 + g.partnerMinuteKst;
    const nowMins = kst.hour * 60 + kst.minute;
    if (nowMins < scheduledMins) continue;
    if (nowMins - scheduledMins > 30) continue;

    const result = await sendPartnerBroadcast(g.guildId, { force: true });
    if (result.ok || result.sent > 0) {
      const guild = getManageGuild(g.guildId);
      if (guild) {
        guild.partnerLastSentDateKst = kst.date;
        guild.updatedAt = new Date().toISOString();
      }
      await persistManageStore();
      ran += 1;
    }
  }
  return { ran, date: kst.date };
}

export async function sendManageEmbed(input: {
  guildId: string;
  channelId: string;
  actor: string;
  draft: Partial<ManageEmbedDraft> & { fields?: ManageEmbedField[] };
}) {
  const draft: ManageEmbedDraft = {
    ...emptyEmbedDraft({
      id: "web",
      guildId: input.guildId,
      ownerDiscordId: input.actor,
      targetChannelId: input.channelId,
    }),
    ...input.draft,
    fields: input.draft.fields || [],
    targetChannelId: input.channelId,
  };
  if (!hasEmbedBody(draft)) {
    return {
      ok: false as const,
      error: "아직 아무것도 안 적었어요. 제목 / 부제목 / 내용 / 링크 중 하나 이상을 적어 주세요.",
    };
  }
  if (!input.channelId) {
    return { ok: false as const, error: "전송할 채널을 선택해 주세요." };
  }
  const payload = embedV2Payload(draft);
  const posted = await postManageChannelMessage(input.channelId, payload);
  if (!posted.ok) {
    const msg =
      posted.json && typeof posted.json === "object" && "message" in posted.json
        ? String((posted.json as { message?: string }).message)
        : `전송 실패 (${posted.status})`;
    return { ok: false as const, error: msg };
  }
  appendManageAudit({
    guildId: input.guildId,
    actor: input.actor,
    action: "embed_send",
    detail: `<#${input.channelId}> · ${draft.title || "임베드"}`,
  });
  await persistManageStore();
  return { ok: true as const };
}
