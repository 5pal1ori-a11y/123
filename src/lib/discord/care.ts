/**
 * DOES 케어 — 보상 신청 관리자 카드 · 손님 DM · 자동 갱신 알림 · /케어 패널
 */
import { appEmoji, plainEmoji } from "@/lib/discord/app-emojis";
import {
  actionRow,
  ButtonStyle,
  cid,
  ComponentType,
  container,
  errorPanel,
  MessageFlags,
  modalFieldValue,
  plainEphemeral,
  separator,
  showModal,
  textDisplay,
  textInput,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { sendDiscordDm } from "@/lib/discord/dm";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import { CARE_PLANS, CARE_WAIT_DAYS, CLAIM_TYPES, decideClaim, getCareDb, renewCare, setClaimCard, type CareClaim, type CareSub } from "@/lib/care";
import { getShopById, getShopBySlug, getShopSettings, persistAsync, updateShopSettings } from "@/lib/store";

const ACCENT = 0x0ea5e9;
const won = (n: number | null | undefined) => `${Math.round(n ?? 0).toLocaleString("ko-KR")}원`;

function btn(customId: string, label: string, style: number) {
  return { type: ComponentType.BUTTON, style, label, custom_id: customId.slice(0, 100) };
}
const link = (url: string, label: string) => ({ type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url });

/** /케어 (관리자) — 안내 패널 */
export async function handleCareCommand(shopSlug: string, roles: string[], permissions: string | undefined, channelId: string | undefined, adminChannelId: string | null) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const s = getShopSettings(shop.id);
  if (!isDiscordAdmin(s, roles, permissions)) return errorPanel("관리자만 올릴 수 있어요.", "권한 없음");
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const adminCh = adminChannelId || s.careAdminChannelId || s.buybackAdminChannelId || s.coinAdminChannelId || null;
  if (!adminCh) return errorPanel("보상 신청 카드를 받을 관리자 채널을 `승인채널` 옵션으로 한 번 지정해 주세요.");
  const b = CARE_PLANS.basic;
  const p = CARE_PLANS.plus;
  const body = {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          textDisplay(`## ${appEmoji("does_shield")} DOES 케어`),
          textDisplay("**계정이 잠기거나 · 도난(회수) · 정지돼도, 보상받으세요.**\nDOES에서 산 계정에 문제가 생기면 케어가 대신 책임져요."),
          textDisplay(
            [
              `> ${appEmoji("does_check")} **베이직** 월 ${won(b.price)} · 한 번 최대 **${won(b.maxPayout)}** 보상`,
              `> ${appEmoji("does_crown")} **플러스** 월 ${won(p.price)} · 한 번 최대 **${won(p.maxPayout)}** 보상`,
              `> ${appEmoji("does_clock")} 포인트로 매달 자동 갱신 · 언제든 해지 (남은 기간은 보장)`,
            ].join("\n"),
          ),
          actionRow(link(shopUrl(shop.slug, "/dashboard?tab=care"), "케어 가입 · 보상 신청")),
          textDisplay(`-# 가입 후 ${CARE_WAIT_DAYS}일 뒤부터 생긴 문제를 보상해요 · 보상은 30일에 한 번 · 심사 후 지급`),
        ],
        ACCENT,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
  const posted = await postChannelMessage(channelId, body, shop.id);
  if (!posted.ok) return errorPanel("패널을 올리지 못했어요.");
  updateShopSettings(shop.id, { careAdminChannelId: adminCh });
  await persistAsync();
  return plainEphemeral(`케어 패널을 올렸어요. 보상 신청 카드는 <#${adminCh}> 채널로 갑니다.`);
}

function claimCard(shopSlug: string, c: CareClaim, note?: string) {
  const plan = CARE_PLANS[c.plan];
  const cap = Math.min(plan.maxPayout, c.paidAmount || plan.maxPayout);
  const color = c.status === "approved" ? 0x22c55e : c.status === "rejected" ? 0x64748b : ACCENT;
  const kids: unknown[] = [
    textDisplay(`## ${plainEmoji("does_shield")} 케어 보상 신청 · ${c.status === "pending" ? "심사 대기" : c.status === "approved" ? "승인" : "거절"}`),
    textDisplay(
      [
        `**신청자** ${c.discordId ? `<@${c.discordId}>` : c.userId} · ${plan.name}`,
        `**계정** ${c.productName} (산 가격 ${won(c.paidAmount)}) · 주문 \`${c.orderId.slice(0, 8)}\``,
        `**사유** ${CLAIM_TYPES[c.type]}`,
        `**설명** ${c.description}`,
        `**보상 한도** ${won(cap)}`,
        c.payout ? `**지급** ${won(c.payout)}` : "",
        c.reason ? `**메모** ${c.reason}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ];
  if (note) kids.push(textDisplay(`> ${note}`));
  if (c.status === "pending") kids.push(actionRow(btn(cid(shopSlug, "cr_ok", c.id), "승인 · 지급", ButtonStyle.SUCCESS), btn(cid(shopSlug, "cr_no", c.id), "거절", ButtonStyle.DANGER)));
  kids.push(textDisplay(`-# 신청 ${c.id}`));
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, color)], allowed_mentions: { parse: [] as string[] } };
}

export async function postClaimCard(shopId: string, shopSlug: string, c: CareClaim) {
  const s = getShopSettings(shopId);
  const ch = s.careAdminChannelId || s.buybackAdminChannelId || s.coinAdminChannelId;
  if (!ch) return;
  const posted = await postChannelMessage(ch, claimCard(shopSlug, c), shopId).catch(() => null);
  const messageId = (posted?.json as { id?: string } | null)?.id;
  if (messageId) await setClaimCard(shopId, c.id, { channelId: ch, messageId }).catch(() => null);
}

function guard(shopSlug: string, roles: string[], permissions: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return { error: plainEphemeral("상점을 찾을 수 없어요.") };
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return { error: plainEphemeral("관리자만 처리할 수 있어요.") };
  return { shop };
}

export async function handleClaimButton(shopSlug: string, id: string, approve: boolean, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const c = (await getCareDb(g.shop.id)).claims.find((x) => x.id === id);
  if (!c || c.status !== "pending") return plainEphemeral("이미 처리된 신청이에요.");
  const cap = Math.min(CARE_PLANS[c.plan].maxPayout, c.paidAmount || CARE_PLANS[c.plan].maxPayout);
  return showModal({
    customId: cid(shopSlug, approve ? "cr_okm" : "cr_nom", id),
    title: approve ? "케어 보상 승인" : "케어 보상 거절",
    inputs: approve
      ? [
          textInput({ customId: "amount", label: `지급할 포인트 (최대 ${cap.toLocaleString("ko-KR")})`, placeholder: String(cap), required: true, maxLength: 9 }),
          textInput({ customId: "reason", label: "손님에게 보낼 메모 (선택)", style: 2, required: false, maxLength: 300 }),
        ]
      : [textInput({ customId: "reason", label: "거절 사유 (손님에게 DM)", style: 2, required: true, maxLength: 300 })],
  });
}

export async function handleClaimSubmit(shopSlug: string, id: string, approve: boolean, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  try {
    const amount = approve ? Number(modalFieldValue(interaction, "amount").replace(/[,\s원₩P]/gi, "")) : null;
    const c = await decideClaim(g.shop.id, id, approve, amount, modalFieldValue(interaction, "reason"));
    await persistAsync();
    await dm(
      c.discordId,
      g.shop.id,
      approve ? `${plainEmoji("does_check")} 케어 보상이 지급됐어요` : "케어 보상 신청이 거절됐어요",
      approve
        ? [`**계정** ${c.productName}`, `**지급** ${won(c.payout)} 포인트`, c.reason ? `> ${c.reason}` : ""]
        : [`**계정** ${c.productName}`, `**사유** ${c.reason ?? ""}`],
      approve ? 0x22c55e : 0x64748b,
    );
    return v2Update(claimCard(shopSlug, c).components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
}

async function dm(discordId: string | null, shopId: string, title: string, lines: string[], color: number, buttons: unknown[] = []) {
  if (!discordId) return;
  await sendDiscordDm(
    discordId,
    { flags: MessageFlags.IS_COMPONENTS_V2, components: [container([textDisplay(`## ${title}`), separator(true, 1), textDisplay(lines.filter(Boolean).join("\n")), ...(buttons.length ? [actionRow(...buttons)] : [])], color)] },
    shopId,
  ).catch(() => null);
}

/** 크론 — 갱신 · 종료 알림 */
export async function runCareRenew(shopId: string) {
  const events = await renewCare(shopId);
  if (!events.length) return;
  await persistAsync();
  const slug = getShopById(shopId)?.slug;
  for (const { sub, result } of events as { sub: CareSub; result: string }[]) {
    const plan = CARE_PLANS[sub.plan];
    if (result === "renewed") {
      await dm(sub.discordId, shopId, `${plainEmoji("does_shield")} DOES 케어가 갱신됐어요`, [`**${plan.name}** · ${won(plan.price)} 포인트 결제`, `다음 갱신 <t:${Math.floor(Date.parse(sub.periodEnd) / 1000)}:D>`], ACCENT);
    } else if (result === "lapsed") {
      await dm(
        sub.discordId,
        shopId,
        "DOES 케어 갱신에 실패했어요",
        [`포인트가 모자라 **${plan.name}** 갱신을 못 했어요. 보장이 끝났어요.`, "다시 가입하면 그때부터 7일 대기 후 보장돼요."],
        0xef4444,
        slug ? [link(shopUrl(slug, "/dashboard?tab=care"), "다시 가입하기")] : [],
      );
    } else {
      await dm(sub.discordId, shopId, "DOES 케어 보장이 끝났어요", [`해지하신 **${plan.name}** 의 보장 기간이 끝났어요. 이용해 주셔서 감사해요.`], 0x64748b);
    }
  }
}
