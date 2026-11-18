#!/usr/bin/env node
/**
 * DOES 홍보 메시지 (Discord Components V2) 전송
 *
 * 구성: 배너 이미지 → 소개 문구 → 구분선 → [웹사이트 바로가기] [디스코드 입당하기]
 *
 * 사용법 (둘 중 하나):
 *   1) 웹훅
 *      DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
 *      DOES_INVITE_URL="https://discord.gg/xxxx" node scripts/send-does-promo.mjs
 *
 *   2) 봇 토큰 + 채널
 *      DISCORD_BOT_TOKEN="..." DISCORD_CHANNEL_ID="123..." \
 *      DOES_INVITE_URL="https://discord.gg/xxxx" node scripts/send-does-promo.mjs
 *
 *   --dry  : 전송하지 않고 payload JSON만 출력
 */

const SITE_URL = process.env.DOES_SITE_URL || "https://doesmc.xyz";
const BANNER_URL = process.env.DOES_BANNER_URL || "https://doesmc.xyz/brand/does-banner.png";
const INVITE_URL = process.env.DOES_INVITE_URL || "";

const IS_COMPONENTS_V2 = 1 << 15;
const C = { ACTION_ROW: 1, BUTTON: 2, TEXT: 10, MEDIA_GALLERY: 12, SEPARATOR: 14, CONTAINER: 17 };
const LINK = 5;

export function buildPayload({ siteUrl = SITE_URL, inviteUrl = INVITE_URL, bannerUrl = BANNER_URL } = {}) {
  return {
    flags: IS_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: C.CONTAINER,
        accent_color: 0x7c7cff,
        components: [
          { type: C.MEDIA_GALLERY, items: [{ media: { url: bannerUrl }, description: "DOES 마인크래프트 상점" }] },
          {
            type: C.TEXT,
            content:
              "## DOES · 마인크래프트 정품 계정 샵\n" +
              "자동 자판기 · 16자리 코드 안전 전달 · 30일 보증\n" +
              "-# 계좌이체 / 코인 / 컬쳐랜드 자동 입금",
          },
          { type: C.SEPARATOR, divider: true, spacing: 1 },
          {
            type: C.ACTION_ROW,
            components: [
              { type: C.BUTTON, style: LINK, label: "웹사이트 바로가기", emoji: { name: "🌐" }, url: siteUrl },
              { type: C.BUTTON, style: LINK, label: "디스코드 입당하기", emoji: { name: "💬" }, url: inviteUrl },
            ],
          },
        ],
      },
    ],
  };
}

async function main() {
  const dry = process.argv.includes("--dry");
  if (!INVITE_URL && !dry) {
    console.error("DOES_INVITE_URL (디스코드 초대 링크)이 필요합니다.");
    process.exit(1);
  }
  const payload = buildPayload({ inviteUrl: INVITE_URL || "https://discord.gg/INVITE" });
  if (dry) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = process.env.DISCORD_CHANNEL_ID;
  let url, headers = { "Content-Type": "application/json" };
  if (webhook) {
    const u = new URL(webhook);
    u.searchParams.set("wait", "true");
    u.searchParams.set("with_components", "true");
    url = u.toString();
  } else if (token && channel) {
    url = `https://discord.com/api/v10/channels/${channel}/messages`;
    headers.Authorization = `Bot ${token}`;
  } else {
    console.error("DISCORD_WEBHOOK_URL 또는 DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID 가 필요합니다.");
    process.exit(1);
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) {
    console.error(`전송 실패 (${res.status}): ${text}`);
    process.exit(1);
  }
  const msg = JSON.parse(text);
  console.log(`전송 완료: 채널 ${msg.channel_id} / 메시지 ${msg.id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
