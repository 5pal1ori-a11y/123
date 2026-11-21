/**
 * /vip — 내 VIP 등급 · 다음 등급까지 · 전용 채널 열기 · 맞춤 요청 /  /vip설정 — 카테고리 · 매니저 역할 (관리자)
 */
import { appEmoji } from "@/lib/discord/app-emojis";
import {
  actionRow,
  ButtonStyle,
  cid,
  ComponentType,
  container,
  errorPanel,
  modalFieldValue,
  plainEphemeral,
  showModal,
  textDisplay,
  textInput,
  v2Ephemeral,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { shopUrl } from "@/lib/domain";
import { getShopBySlug, getShopSettings, getUserByDiscordId } from "@/lib/store";
import { openVipChannel, requestConcierge, setVipSettings, VIP_TIERS, vipStatus } from "@/lib/vip";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
function btn(customId: string, label: string, style: number, disabled = false) {
  return { type: ComponentType.BUTTON, style, label, custom_id: customId.slice(0, 100), ...(disabled ? { disabled: true } : {}) };
}

export async function handleVipCommand(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return plainEphemeral("사이트 계정이 연결돼 있지 않아요. 사이트에서 디스코드로 로그인해 주세요.");
  const st = await vipStatus(shop.id, user.id);
  const tier = VIP_TIERS.find((t) => t.id === st.tier?.id);
  const gold = tier && tier.id !== "silver";
  const bar = st.next ? Math.min(10, Math.floor(((st.spent - (tier?.min ?? 0)) / (st.next.min - (tier?.min ?? 0))) * 10)) : 10;
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${appEmoji("does_crown")} ${tier ? tier.name : "VIP 아님"}`),
        textDisplay(
          [
            `누적 구매 **${won(st.spent)}**`,
            st.next ? `${"▰".repeat(Math.max(0, bar))}${"▱".repeat(10 - Math.max(0, bar))}  **${st.next.name}**까지 ${won(st.next.remaining)}` : "최고 등급이에요!",
          ].join("\n"),
        ),
        textDisplay(tier ? tier.perks.map((p) => `${appEmoji("does_check")} ${p}`).join("\n") : VIP_TIERS.map((t) => `**${t.name}** 누적 ${won(t.min)} ↑ — ${t.perks.slice(-1)[0]}`).join("\n")),
        actionRow(
          btn(cid(shopSlug, "vp_ch"), st.channelId ? "전용 채널 다시 열기" : "전용 채널 열기", ButtonStyle.PRIMARY, !gold),
          btn(cid(shopSlug, "vp_req"), "맞춤 계정 요청", ButtonStyle.SUCCESS, !gold),
          { type: ComponentType.BUTTON, style: ButtonStyle.LINK, label: "매물 보기", url: shopUrl(shop.slug, "/dashboard?tab=products") },
        ),
        textDisplay(`-# 등급은 실제 구매 금액으로 자동 계산돼요 · 전용 채널 · 맞춤 요청은 GOLD부터${st.channelId ? ` · 내 채널 <#${st.channelId}>` : ""}`),
      ],
      tier?.color ?? 0x64748b,
    ),
  ]);
}

export async function handleVipChannelButton(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  const user = shop ? getUserByDiscordId(shop.id, discordId) : null;
  if (!shop || !user) return plainEphemeral("사이트 계정이 연결돼 있지 않아요.");
  try {
    const r = await openVipChannel(shop.id, user.id);
    return plainEphemeral(r.created ? `전용 채널을 만들었어요 → <#${r.channelId}>` : `이미 있는 전용 채널이에요 → <#${r.channelId}>`);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "채널을 열지 못했어요.");
  }
}

export function handleVipRequestButton(shopSlug: string) {
  return showModal({
    customId: cid(shopSlug, "vp_reqm"),
    title: "VIP 맞춤 계정 요청",
    inputs: [
      textInput({ customId: "text", label: "원하는 계정 조건", style: 2, placeholder: "예: 마인콘 2016 망토 · 이메일 변경 가능 · 하이픽셀 MVP+", required: true, minLength: 5, maxLength: 800 }),
      textInput({ customId: "budget", label: "예산 (원 · 선택)", placeholder: "예: 150000", required: false, maxLength: 9 }),
    ],
  });
}

export async function handleVipRequestSubmit(shopSlug: string, discordId: string, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  const user = shop ? getUserByDiscordId(shop.id, discordId) : null;
  if (!shop || !user) return plainEphemeral("사이트 계정이 연결돼 있지 않아요.");
  try {
    const budget = Number(modalFieldValue(interaction, "budget").replace(/[^\d]/g, "")) || null;
    await requestConcierge(shop.id, user.id, modalFieldValue(interaction, "text"), budget);
    return plainEphemeral("맞춤 요청을 보냈어요. 매니저가 확인하고 전용 채널이나 DM으로 연락드려요.");
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "요청하지 못했어요.");
  }
}

/** /vip설정 카테고리 매니저역할 (관리자) */
export async function handleVipSettingsCommand(shopSlug: string, roles: string[], permissions: string | undefined, categoryId: string | null, roleId: string | null) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return errorPanel("관리자만 설정할 수 있어요.", "권한 없음");
  const patch: { vipCategoryId?: string | null; vipManagerRoleId?: string | null } = {};
  if (categoryId) patch.vipCategoryId = categoryId;
  if (roleId) patch.vipManagerRoleId = roleId;
  if (Object.keys(patch).length) await setVipSettings(shop.id, patch);
  const s = getShopSettings(shop.id);
  return plainEphemeral(
    [
      "**VIP 설정**",
      `전용 채널 카테고리: ${s.vipCategoryId ? `<#${s.vipCategoryId}>` : "없음 (서버 맨 아래에 만들어져요)"}`,
      `매니저 역할: ${s.vipManagerRoleId ? `<@&${s.vipManagerRoleId}>` : "없음 (전용 채널에 관리자 역할이 자동으로 안 들어가요)"}`,
      `등급: ${VIP_TIERS.map((t) => `${t.name} ${won(t.min)}↑`).join(" · ")}`,
      "-# 봇에 '채널 관리' 권한이 있어야 전용 채널을 만들 수 있어요.",
    ].join("\n"),
  );
}
