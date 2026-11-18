/** /템플릿 — 이용약관 · 업체소개 같은 안내 패널을 채널에 올린다 (관리자) */
import {
  button,
  container,
  errorPanel,
  section,
  separator,
  MessageFlags,
  plainEphemeral,
  textDisplay,
} from "@/lib/discord/components";
import { postChannelMessage } from "@/lib/discord/rest";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { getShopBySlug, getShopSettings, getStoreForRead } from "@/lib/store";

function origin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

/** 등급(누적 충전액 기준)별 할인 — 상점 등급 설정을 그대로 읽어 역할 멘션으로 보여 준다 */
function tierBenefitKids(shopId: string) {
  const tiers = getStoreForRead()
    .tiers.filter((t) => t.shopId === shopId)
    .sort((a, b) => a.minTotalCharged - b.minTotalCharged);
  const won = (n: number) => `₩${Math.max(0, Math.round(n)).toLocaleString("ko-KR")}`;
  const line = (t: (typeof tiers)[number]) => {
    const who = t.discordRoleId ? `<@&${t.discordRoleId}>` : `**${t.name}**`;
    const perk = t.discountPercent > 0 ? `모든 상품 **${t.discountPercent}% 할인**` : "기본 등급";
    return `${who} — ${perk}\n-# 누적 충전 ${won(t.minTotalCharged)} 이상`;
  };
  return [
    textDisplay("## 역할별 혜택"),
    textDisplay("누적 충전 금액에 따라 등급 역할이 자동으로 지급되고,\n보유 등급에 따라 모든 상품 할인 혜택을 받을 수 있어요."),
    separator(true, 1),
    textDisplay(tiers.length ? tiers.map(line).join("\n") : "아직 등록된 등급이 없어요. 관리자 페이지 → 등급에서 추가해 주세요."),
    separator(true, 1),
    textDisplay("할인은 웹사이트 계정의 현재 등급 하나를 기준으로 결제할 때 자동 적용돼요."),
  ];
}

function cleanUrl(raw: string | undefined, fallback: string) {
  const v = (raw ?? "").trim();
  return /^https?:\/\/\S+$/i.test(v) ? v : fallback;
}

export async function handleTemplateCommand(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  opts: { kind?: string; link1?: string; link2?: string; channelId?: string },
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) {
    return errorPanel("템플릿 패널은 관리자만 올릴 수 있어요.", "권한 없음");
  }
  const name = shop.name || "DOES";
  const home = origin();

  const kids: unknown[] =
    opts.kind === "tiers"
      ? tierBenefitKids(shop.id)
      : opts.kind === "intro"
      ? [
          textDisplay(`## ${name} 업체 소개`),
          separator(true, 1),
          textDisplay(
            [
              "마인크래프트 계정 · 망토 · 디지털 상품을 판매하는 온라인 샵입니다.",
              "구매는 웹에서 진행하고, 결제 후 바로 지급돼요.",
            ].join("\n"),
          ),
          textDisplay(["> · 마인크래프트 계정 · 망토 판매", "> · 상품 자동 지급", "> · 디스코드 티켓 고객지원"].join("\n")),
          separator(true, 1),
          section({
            text: "누구나 안전하게\n상품을 구매할 수 있는 샵입니다.",
            accessory: button({ label: "사이트 바로가기", url: cleanUrl(opts.link1, home) }),
          }),
          separator(true, 1),
          textDisplay("-# Minecraft · Account · Cape"),
        ]
      : [
          textDisplay(`## ${name} 이용약관`),
          separator(true, 1),
          section({
            text: "서비스 이용약관",
            accessory: button({ label: "바로가기", url: cleanUrl(opts.link1, `${home}/terms`) }),
          }),
          separator(true, 1),
          section({
            text: "개인정보처리방침",
            accessory: button({ label: "바로가기", url: cleanUrl(opts.link2, `${home}/privacy`) }),
          }),
        ];

  if (!opts.channelId) return errorPanel("채널에서 다시 써 주세요.");
  const posted = await postChannelMessage(
    opts.channelId,
    // 등급혜택은 노란 띠 (예시 이미지와 같게) · 역할 멘션은 표시만 하고 알림은 보내지 않는다
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [opts.kind === "tiers" ? container(kids, 0xfacc15) : container(kids)],
      allowed_mentions: { parse: [] },
    },
    shop.id,
  );
  if (!posted.ok) return errorPanel("템플릿을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  return plainEphemeral("템플릿을 생성했습니다.");
}
