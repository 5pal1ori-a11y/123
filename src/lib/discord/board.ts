/**
 * /전광판 — 거래소 전광판 이미지를 채널에 고정하고 5분마다 다시 그린다 · /닉네임 — 마크 닉네임 조회
 */
import { MFA_SITE_ORIGIN } from "@/lib/domain";
import { appEmoji } from "@/lib/discord/app-emojis";
import { actionRow, ButtonStyle, ComponentType, container, errorPanel, mediaGallery, MessageFlags, plainEphemeral, sectionText, textDisplay, thumbnail, v2Ephemeral } from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { signedDataImageUrl } from "@/lib/discord/rank-image";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { boardData } from "@/lib/board";
import { getShopById, getShopBySlug, getShopSettings, persistAsync, updateShopSettings } from "@/lib/store";

const link = (url: string, label: string) => ({ type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url });
const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
function kst() {
  const t = new Date(Date.now() + 9 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

async function boardBody(shopId: string, shopSlug: string) {
  const d = await boardData(shopId);
  const url = await signedDataImageUrl(shopSlug, {
    kind: "board",
    time: kst(),
    k: [d.today.volume, d.today.trades, d.listings, d.allTime.trades],
    vs: d.today.vsYesterdayPct,
    tape: d.tape.slice(0, 7).map((t) => [t.product.slice(0, 22), t.price, t.buyer, ago(t.at)]),
    mv: d.movers.slice(0, 6).map((m) => [m.label.slice(0, 14), m.price, m.changePct]),
  }).catch(() => null);
  const kids: unknown[] = url
    ? [mediaGallery([url])]
    : [
        textDisplay("## DOES 거래소 전광판"),
        textDisplay(`오늘 거래액 **${won(d.today.volume)}** · 체결 **${d.today.trades}건** · 판매 중 **${d.listings}개**`),
        textDisplay(d.tape.slice(0, 7).map((t) => `· ${t.product} — ${won(t.price)} · ${t.buyer} · ${ago(t.at)}`).join("\n") || "아직 체결이 없어요"),
      ];
  kids.push(actionRow(link(`${MFA_SITE_ORIGIN}/board`, "실시간 전광판"), link(`${MFA_SITE_ORIGIN}/dashboard?tab=products`, "매물 보기"), link(`${MFA_SITE_ORIGIN}/dashboard?tab=market`, "계정 차트")));
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, 0x10b981)], allowed_mentions: { parse: [] as string[] } };
}

/** /전광판 (관리자) */
export async function handleBoardCommand(shopSlug: string, roles: string[], permissions: string | undefined, channelId: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return errorPanel("관리자만 올릴 수 있어요.", "권한 없음");
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const posted = await postChannelMessage(channelId, await boardBody(shop.id, shop.slug), shop.id);
  const messageId = (posted.json as { id?: string } | null)?.id;
  if (!posted.ok || !messageId) return errorPanel("전광판을 올리지 못했어요. 봇 권한을 확인해 주세요.");
  updateShopSettings(shop.id, { boardPanel: { channelId, messageId } });
  await persistAsync();
  return plainEphemeral("거래소 전광판을 올렸어요. 5분마다 자동으로 새로 그려요.");
}

/** 크론 — 전광판 다시 그리기 */
export async function refreshBoardPanel(shopId: string) {
  const at = getShopSettings(shopId).boardPanel;
  const slug = getShopById(shopId)?.slug;
  if (!at || !slug) return;
  const body = await boardBody(shopId, slug);
  const r = await discordRest("PATCH", `/channels/${at.channelId}/messages/${at.messageId}`, { components: body.components, flags: body.flags }, shopId);
  if (r.status === 404) {
    updateShopSettings(shopId, { boardPanel: null });
    await persistAsync();
  }
}

/** /닉네임 이름 */
export async function handleNameCommand(name: string) {
  const { isNameOrUuid, lookupPlayer } = await import("@/lib/namemc");
  if (!isNameOrUuid(name)) return plainEphemeral("닉네임(영문 · 숫자 · _ 16자 이하) 또는 UUID를 넣어 주세요.");
  const d = await lookupPlayer(name).catch(() => null);
  if (!d) return plainEphemeral("모장 서버 응답이 늦어요. 잠시 뒤에 다시 해 주세요.");
  if (!d.found) {
    return v2Ephemeral([container([textDisplay(`## '${d.name}' 계정을 찾지 못했어요`), textDisplay(d.available ? "지금 아무도 쓰지 않는 닉네임일 수 있어요. (닉네임 변경 대기 37일에 걸려 있을 수도 있어요)" : "닉네임이나 UUID를 다시 확인해 주세요.")])]);
  }
  const lines = [
    `UUID \`${d.uuid}\``,
    d.hypixel ? `하이픽셀 **${d.hypixel.rank ?? "일반"}** · Lv.${Math.floor(d.hypixel.level)} · 배드워즈 ${d.hypixel.bedwarsStars}★` : "",
    `망토 ${d.capes.length ? d.capes.map((c) => c.title).join(", ") : "없음"}`,
    d.history.names.length > 1 ? `DOES 기록 닉네임 ${d.history.names.map((n) => n.name).join(" ← ")}` : "",
    `스킨 ${d.slim ? "슬림" : "클래식"} · DOES 조회 ${d.history.views}회`,
  ].filter(Boolean);
  return v2Ephemeral([
    container(
      [
        sectionText({ text: `## ${appEmoji("does_chart")} ${d.name}\n${lines.join("\n")}`, accessory: thumbnail(d.headUrl) }),
        mediaGallery([d.renderUrl]),
        actionRow(link(`${MFA_SITE_ORIGIN}/mc/${encodeURIComponent(d.name)}`, "자세히 보기"), link(`${MFA_SITE_ORIGIN}/dashboard?tab=dosmarket&sub=buyback&ign=${encodeURIComponent(d.name)}`, "시세 감정받기")),
      ],
      0x10b981,
    ),
  ]);
}
