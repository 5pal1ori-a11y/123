/**
 * 디스코드 Component Embed — 사이트 링크를 붙여넣으면 기본 미리보기 대신 보이는 V2 카드.
 * 루트 레이아웃 <head>에 <script id="discord:component-embed" type="application/json"> 로 들어간다.
 * 봇 없이 DM·서버 어디서나 동작한다.
 *
 * 규칙: https://github.com/discord/discord-api-docs/blob/main/developers/link-previews/component-embeds.mdx
 * - 최상위는 Container 하나, 컴포넌트 최대 40개, JSON 3,000바이트 이하
 * - 버튼은 링크 스타일(5)만, 키는 id/type/url/style/label/emoji/disabled 만 (다른 키가 있으면 통째로 무시됨)
 * - 실패하면 Open Graph 미리보기로 대체되므로 layout 의 openGraph 메타는 유지한다
 */

const SITE_URL = "https://doesmc.xyz";
const INVITE_URL = "https://discord.gg/doesmc";
const BANNER_URL = "https://doesmc.xyz/brand/does-banner.png";

export const DOES_COMPONENT_EMBED = {
  component: {
    type: 17,
    accent_color: 0x6366f1,
    components: [
      { type: 12, items: [{ media: { url: BANNER_URL }, description: "DOES 마인크래프트 상점" }] },
      {
        type: 10,
        content:
          "## DOES · 마인크래프트 정품 계정 샵\n" +
          "자동 자판기 · 16자리 코드 안전 전달 · 30일 보증 · 계좌이체/코인/컬쳐랜드 자동 입금",
      },
      { type: 14, divider: true, spacing: 1 },
      {
        type: 1,
        components: [
          { type: 2, style: 5, url: SITE_URL, label: "웹사이트 바로가기" },
          { type: 2, style: 5, url: INVITE_URL, label: "디스코드 입당하기" },
        ],
      },
    ],
  },
} as const;

/** <script> 안에 넣을 JSON 문자열. `<` 는 이스케이프해 스크립트 태그가 깨지지 않게 한다. */
export function componentEmbedJson(): string {
  return JSON.stringify(DOES_COMPONENT_EMBED).replace(/</g, "\\u003c");
}
