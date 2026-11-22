/**
 * 디스코드 Component Embed — 사이트 링크를 붙여넣으면 기본 미리보기 대신 보이는 V2 카드.
 * 루트 레이아웃 <head>의 <link rel="discord:component-embed"> 가 /api/discord/component-embed 를 가리키고,
 * 그 API가 실시간 판매 통계를 넣은 JSON을 내려준다. 봇 없이 DM·서버 어디서나 동작한다.
 *
 * 규칙: https://github.com/discord/discord-api-docs/blob/main/developers/link-previews/component-embeds.mdx
 * - 최상위는 Container 하나, 컴포넌트 최대 40개, JSON 3,000바이트 이하
 * - 버튼은 링크 스타일(5)만, 키는 id/type/url/style/label/emoji/disabled 만 (다른 키가 있으면 통째로 무시됨)
 * - 실패하면 Open Graph 미리보기로 대체되므로 layout 의 openGraph 메타는 유지한다
 */
import { MFA_SITE_ORIGIN, ASSET_ORIGIN } from "@/lib/domain";
import type { DbStore } from "@/lib/store";
import { fallbackEmoji, type AppEmojiName } from "@/lib/discord/app-emojis";

export const COMPONENT_EMBED_PATH = "/api/discord/component-embed";
export const COMPONENT_EMBED_URL = `${ASSET_ORIGIN}${COMPONENT_EMBED_PATH}`;

const SITE_URL = `${MFA_SITE_ORIGIN}`;
const INVITE_URL = "https://discord.gg/doesmc";
const BANNER_URL = `${ASSET_ORIGIN}/brand/does-banner.png`;
const MAX_BYTES = 3000;

const COUNTED = new Set(["dispensed", "paid", "awaiting_fulfillment"]);

export type ShopStats = { sold: number; buyers: number; reviews: number; avg: number; since?: string };

export function shopStats(store: DbStore, shopId: string, createdAt?: string): ShopStats {
  const orders = store.orders.filter((o) => o.shopId === shopId && COUNTED.has(o.status));
  const sold = orders.reduce((n, o) => n + (o.quantity || 1), 0);
  const buyers = new Set(orders.map((o) => o.userId).filter(Boolean)).size;
  const reviews = store.reviews.filter((r) => r.shopId === shopId);
  const rated = reviews.filter((r) => r.rating > 0);
  const avg = rated.length ? rated.reduce((n, r) => n + r.rating, 0) / rated.length : 5;
  const d = createdAt ? new Date(createdAt) : null;
  const since = d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}년 ${d.getMonth() + 1}월부터 운영` : undefined;
  return { sold, buyers, reviews: reviews.length, avg, since };
}

const n = (v: number) => v.toLocaleString("ko-KR");

/** 커스텀 이모지 문자열(<:이름:ID>)을 버튼 emoji 객체로 */
function buttonEmojiObj(v: string) {
  const m = /^<(a?):(\w+):(\d+)>$/.exec(v);
  return m ? { id: m[3], name: m[2], ...(m[1] ? { animated: true } : {}) } : { name: v };
}

/**
 * statsImageUrl 이 있으면 통계는 맨 아래 이미지 한 장으로, 없으면(이미지 워커 없음) 글자 한 줄로.
 */
export function buildComponentEmbed(
  stats: ShopStats | null,
  e: (name: AppEmojiName) => string = fallbackEmoji,
  statsImageUrl: string | null = null,
) {
  const head: unknown[] = [
    { type: 12, items: [{ media: { url: BANNER_URL }, description: "DOES 마인크래프트 상점" }] },
    {
      type: 10,
      content: `## ${e("does_gem")} DOES Store`,
    },
  ];
  const statBlock: unknown[] = stats && !statsImageUrl
    ? [
        { type: 14, divider: true, spacing: 1 },
        {
          type: 10,
          content:
            `${e("does_sold")} **판매된 계정 ${n(stats.sold)}개 · 구매자 ${n(stats.buyers)}명 · 후기 ${n(stats.reviews)}개** ${e("does_star")} **${stats.avg.toFixed(1)}**` +
            (stats.since ? `\n-# ${stats.since}` : ""),
        },
      ]
    : [];
  const tail: unknown[] = [
    { type: 14, divider: true, spacing: 1 },
    {
      type: 10,
      content: [
        `${e("does_lightning")} **자동 자판기** — 충전·구매·전달까지 24시간 자동`,
        `${e("does_lock")} **안전 전달** — 구매하면 16자리 코드로 안전하게 전달`,
        `${e("does_coin")} **입금 자동 확인** — 계좌이체 / 코인 / 컬쳐랜드`,
        `${e("does_check")} **30일 보증** — 수령 후 30일 교체·환불 보장`,
      ].join("\n"),
    },
    { type: 14, divider: true, spacing: 1 },
    { type: 10, content: INVITE_URL },
    {
      type: 1,
      components: [
        { type: 2, style: 5, url: SITE_URL, label: "웹사이트 바로가기", emoji: buttonEmojiObj(e("does_cart")) },
        { type: 2, style: 5, url: INVITE_URL, label: "디스코드 입장하기", emoji: buttonEmojiObj(e("does_party")) },
      ],
    },
  ];
  const statsImage: unknown[] = stats && statsImageUrl
    ? [{ type: 12, items: [{ media: { url: statsImageUrl }, description: `판매 ${n(stats.sold)}개 · 구매자 ${n(stats.buyers)}명 · 후기 ${n(stats.reviews)}개 · 평점 ${stats.avg.toFixed(1)}` }] }]
    : [];
  return { component: { type: 17, accent_color: 0x6366f1, components: [...head, ...statBlock, ...tail, ...statsImage] } };
}

/** 3,000바이트를 넘으면 디스코드가 통째로 버리므로, 넘을 때는 통계 없이 보낸다. */
export function componentEmbedJson(
  stats: ShopStats | null,
  e: (name: AppEmojiName) => string = fallbackEmoji,
  statsImageUrl: string | null = null,
): string {
  const fits = (j: string) => new TextEncoder().encode(j).length <= MAX_BYTES;
  for (const [st, em] of [[stats, e], [stats, fallbackEmoji], [null, fallbackEmoji]] as const) {
    const j = JSON.stringify(buildComponentEmbed(st, em, statsImageUrl));
    if (fits(j)) return j;
  }
  return JSON.stringify(buildComponentEmbed(null));
}
