/** /템플릿 — 이용약관 · 업체소개 같은 안내 패널을 채널에 올린다 (관리자) */
import {
  button,
  container,
  errorPanel,
  section,
  separator,
  textDisplay,
  v2Public,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { getShopBySlug, getShopSettings } from "@/lib/store";

function origin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

function cleanUrl(raw: string | undefined, fallback: string) {
  const v = (raw ?? "").trim();
  return /^https?:\/\/\S+$/i.test(v) ? v : fallback;
}

export function handleTemplateCommand(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  opts: { kind?: string; link1?: string; link2?: string },
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) {
    return errorPanel("템플릿 패널은 관리자만 올릴 수 있어요.", "권한 없음");
  }
  const name = shop.name || "DOES";
  const home = origin();

  const kids: unknown[] =
    opts.kind === "intro"
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

  const panel = v2Public([container(kids)]);
  return { ...panel, data: { ...panel.data, allowed_mentions: { parse: [] } } };
}
