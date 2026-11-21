/**
 * /도스플랜 — 프리미엄 플랜(BASIC PASS · DOES PASS+)을 이미지로 보여주고 포인트로 바로 구독 · 라이선스 키 입력
 * 공개 옵션(관리자)이면 채널에 패널로 올린다. 패널 버튼은 누른 사람에게만 보이는 창으로 답한다.
 */
import { appEmoji } from "@/lib/discord/app-emojis";
import {
  actionRow,
  ButtonStyle,
  cid,
  ComponentType,
  container,
  errorPanel,
  mediaGallery,
  MessageFlags,
  modalFieldValue,
  plainEphemeral,
  showModal,
  textDisplay,
  textInput,
  v2Ephemeral,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { signedDataImageUrl } from "@/lib/discord/rank-image";
import { postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import { buyPremiumWithPoints, PREMIUM_PLANS, redeemPremiumKey, type PremiumPlanId } from "@/lib/premium";
import { getShopBySlug, getShopSettings, getUserByDiscordId, userPremiumPlan } from "@/lib/store";
import type { ShopUser } from "@/lib/types";

const P = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}P`;
function btn(customId: string, label: string, style: number, disabled = false) {
  return { type: ComponentType.BUTTON, style, label, custom_id: customId.slice(0, 100), ...(disabled ? { disabled: true } : {}) };
}

function planOf(user: ShopUser | null) {
  if (!user) return null;
  const plan = userPremiumPlan(user);
  const exp = user.premium?.expiresAt ? Date.parse(user.premium.expiresAt) : NaN;
  return { plan, left: plan && Number.isFinite(exp) ? Math.max(0, Math.ceil((exp - Date.now()) / 86_400_000)) : undefined };
}

async function body(shopSlug: string, user: ShopUser | null, forPanel: boolean, note?: string) {
  const plans = (["basic", "plus"] as PremiumPlanId[]).map((id) => {
    const p = PREMIUM_PLANS[id];
    return { id, name: p.name, price: p.price, tag: p.tagline, perks: p.perks.slice(0, 7) };
  });
  const me = forPanel ? null : planOf(user);
  const url = await signedDataImageUrl(shopSlug, { kind: "plan_panel", ...(me ? { me } : forPanel ? {} : { me: { plan: null } }), plans }).catch(() => null);
  const kids: unknown[] = [];
  if (url) kids.push(mediaGallery([url]));
  else {
    kids.push(textDisplay(`## ${appEmoji("does_crown")} 도스플랜`));
    for (const p of plans) kids.push(textDisplay(`### ${p.name} · ${p.price.toLocaleString("ko-KR")}원 / 30일\n${p.perks.map((x) => `· ${x}`).join("\n")}`));
  }
  if (note) kids.push(textDisplay(`> ${note}`));
  if (!forPanel && user) kids.push(textDisplay(`내 포인트 ${P(user.points)}${me?.plan ? ` · ${PREMIUM_PLANS[me.plan].name} ${me.left ?? 0}일 남음 (구독하면 기간이 이어져요)` : ""}`));
  kids.push(
    actionRow(
      btn(cid(shopSlug, "pl_buy", "basic"), `BASIC 구독 · ${P(PREMIUM_PLANS.basic.price)}`, ButtonStyle.PRIMARY),
      btn(cid(shopSlug, "pl_buy", "plus"), `PASS+ 구독 · ${P(PREMIUM_PLANS.plus.price)}`, ButtonStyle.SUCCESS),
      btn(cid(shopSlug, "pl_key"), "라이선스 키 입력", ButtonStyle.SECONDARY),
      { type: ComponentType.BUTTON, style: ButtonStyle.LINK, label: "웹에서 보기", url: shopUrl(shopSlug, "/dashboard?tab=premium") },
    ),
  );
  kids.push(textDisplay("-# 포인트로 30일씩 구독 · 이미 구독 중이면 남은 기간에 이어서 늘어나요 · 혜택은 바로 적용돼요"));
  return [container(kids, 0xf59e0b)];
}

/** /도스플랜 [공개] */
export async function handlePlanCommand(shopSlug: string, discordId: string, roles: string[], permissions: string | undefined, channelId: string | undefined, publicPanel: boolean) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (publicPanel) {
    if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return errorPanel("공개 패널은 관리자만 올릴 수 있어요. `공개` 없이 쓰면 나만 볼 수 있어요.", "권한 없음");
    if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
    const posted = await postChannelMessage(channelId, { flags: MessageFlags.IS_COMPONENTS_V2, components: await body(shop.slug, null, true), allowed_mentions: { parse: [] as string[] } }, shop.id);
    return plainEphemeral(posted.ok ? "도스플랜 패널을 올렸어요." : "패널을 올리지 못했어요. 봇 권한을 확인해 주세요.");
  }
  return v2Ephemeral(await body(shop.slug, getUserByDiscordId(shop.id, discordId), false));
}

function needLink(shopSlug: string) {
  return v2Ephemeral([
    container([
      textDisplay("## 먼저 사이트 계정을 연결해 주세요"),
      textDisplay("도스플랜은 사이트 포인트로 구독해요. 사이트에서 **디스코드로 로그인**하면 자동으로 연결돼요."),
      actionRow({ type: ComponentType.BUTTON, style: ButtonStyle.LINK, label: "사이트에서 로그인", url: shopUrl(shopSlug, "/dashboard?tab=premium") }),
    ]),
  ]);
}

/** [구독] → 나만 보이는 확인 창 */
export function handlePlanBuyButton(shopSlug: string, discordId: string, planId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return needLink(shop.slug);
  const p = PREMIUM_PLANS[planId as PremiumPlanId];
  if (!p) return plainEphemeral("없는 플랜이에요.");
  const cur = planOf(user);
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${p.name} 구독`),
        textDisplay(`**${P(p.price)}** · 30일\n내 포인트 ${P(user.points)}${cur?.plan ? `\n지금 ${PREMIUM_PLANS[cur.plan].name} ${cur.left ?? 0}일 남음` : ""}`),
        actionRow(btn(cid(shopSlug, "pl_ok", p.id), "포인트로 구독하기", ButtonStyle.SUCCESS, user.points < p.price), { type: ComponentType.BUTTON, style: ButtonStyle.LINK, label: "포인트 충전", url: shopUrl(shopSlug, "/dashboard?tab=charge") }),
        ...(user.points < p.price ? [textDisplay(`-# 포인트가 ${P(p.price - user.points)} 부족해요.`)] : []),
      ],
      0xf59e0b,
    ),
  ]);
}

export async function handlePlanConfirm(shopSlug: string, discordId: string, planId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return needLink(shop.slug);
  try {
    const r = await buyPremiumWithPoints(shop.id, user.id, planId as PremiumPlanId);
    return v2Update([container([textDisplay(`## ${appEmoji("does_crown")} ${r.plan.name} 구독 완료!`), textDisplay(`${new Date(r.premium.expiresAt).toLocaleDateString("ko-KR")}까지 혜택이 적용돼요. 디스코드 역할도 곧 붙어요.`)], 0x22c55e)]);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "구독하지 못했어요.");
  }
}

export function handlePlanKeyButton(shopSlug: string) {
  return showModal({
    customId: cid(shopSlug, "pl_keym"),
    title: "도스플랜 라이선스 키",
    inputs: [textInput({ customId: "key", label: "라이선스 키", placeholder: "XXXX-XXXX-XXXX-XXXX", required: true, minLength: 16, maxLength: 24 })],
  });
}

export async function handlePlanKeySubmit(shopSlug: string, discordId: string, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return needLink(shop.slug);
  try {
    const r = await redeemPremiumKey(shop.id, user.id, modalFieldValue(interaction, "key"));
    return plainEphemeral(`${r.plan.name} 키를 적용했어요! ${new Date(r.premium.expiresAt).toLocaleDateString("ko-KR")}까지 혜택이 적용돼요.`);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "키를 적용하지 못했어요.");
  }
}
