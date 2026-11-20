/**
 * 계정 매입 · 보상판매 — 관리자 디스코드 카드 + 손님 DM · /매입 패널
 * 카드 버튼: [매입가 제시] [로그인 정보 보기] [완료] [반려]
 * 손님 DM: 제시가 → [수락] [거절] (수락하면 사이트에서 로그인 정보 제출)
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
  v2Ephemeral,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { sendDiscordDm } from "@/lib/discord/dm";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import {
  completeBuyback,
  getBuyback,
  listBuybacks,
  offerBuyback,
  rejectBuyback,
  respondBuyback,
  revealBuyback,
  setBuybackAdminCard,
  TRADEIN_BONUS_PERCENT,
  type Buyback,
} from "@/lib/buyback";
import { getProductById, getShopBySlug, getShopSettings, getUserByDiscordId, persistAsync, updateShopSettings } from "@/lib/store";

const ACCENT = 0x8b5cf6;
const won = (n: number | null | undefined) => (n ? `${Math.round(n).toLocaleString("ko-KR")}원` : "—");
const STATUS_KO: Record<Buyback["status"], string> = {
  submitted: "신청됨 · 검수 대기",
  offered: "매입가 제시 · 손님 응답 대기",
  accepted: "손님 수락 · 로그인 정보 대기",
  handover: "로그인 정보 받음 · 확인 후 완료",
  completed: "완료",
  rejected: "반려",
  cancelled: "취소",
};

function btn(customId: string, label: string, style: number, emoji?: string) {
  const m = emoji ? /^<(a?):(\w+):(\d+)>$/.exec(emoji) : null;
  return { type: ComponentType.BUTTON, style, label, custom_id: customId.slice(0, 100), ...(emoji ? { emoji: m ? { id: m[3], name: m[2], animated: Boolean(m[1]) } : { name: emoji } } : {}) };
}
const link = (url: string, label: string) => ({ type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url });

/** /매입 (관리자) — 안내 패널 */
export async function handleBuybackCommand(shopSlug: string, roles: string[], permissions: string | undefined, channelId: string | undefined, adminChannelId: string | null) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) return errorPanel("관리자만 올릴 수 있어요.", "권한 없음");
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const adminCh = adminChannelId || settings.buybackAdminChannelId || settings.gugoAdminChannelId || settings.coinAdminChannelId || null;
  if (!adminCh) return errorPanel("신청 카드를 받을 관리자 채널을 `승인채널` 옵션으로 한 번 지정해 주세요.");
  const body = {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          textDisplay(`## ${appEmoji("does_coin")} 계정 매입 · 보상판매`),
          textDisplay("안 쓰는 마인크래프트 계정, **DOES가 사요.** 닉네임만 넣으면 예상 매입가를 바로 알려 드려요."),
          textDisplay(
            [
              `> ${appEmoji("does_chart")} **자동 시세 조회** — 망토 · 하이픽셀 · 계정 차트 시세 기준`,
              `> ${appEmoji("does_check")} **매입** — 검수 후 포인트 즉시 지급 또는 현금 송금`,
              `> ${appEmoji("does_rocket")} **보상판매** — 내 계정 + 차액으로 더 좋은 계정 · 매입가 **+${TRADEIN_BONUS_PERCENT}%**`,
            ].join("\n"),
          ),
          actionRow(link(shopUrl(shop.slug, "/dashboard?tab=buyback"), "시세 조회 · 신청하기"), btn(cid(shop.slug, "bb_mine"), "내 신청", ButtonStyle.SECONDARY, appEmoji("does_chart"))),
          textDisplay("-# 도난 · 회수 위험 계정은 매입하지 않아요 · 본인인증이 필요할 수 있어요"),
        ],
        ACCENT,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
  const posted = await postChannelMessage(channelId, body, shop.id);
  if (!posted.ok) return errorPanel("패널을 올리지 못했어요.");
  updateShopSettings(shop.id, { buybackAdminChannelId: adminCh });
  await persistAsync();
  return plainEphemeral(`매입 패널을 올렸어요. 신청 카드는 <#${adminCh}> 채널로 갑니다.`);
}

export async function handleBuybackMine(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  const mine = user ? (await listBuybacks(shop.id)).filter((b) => b.userId === user.id).slice(0, 8) : [];
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${plainEmoji("does_chart")} 내 매입 신청`),
        textDisplay(
          mine.length
            ? mine.map((b) => `· **${b.appraisal.nickname}** (${b.kind === "tradein" ? "보상판매" : "매입"}) — ${STATUS_KO[b.status]}${b.offerPrice ? ` · ${won(b.offerPrice)}` : ""}`).join("\n")
            : user
              ? "아직 신청이 없어요."
              : "사이트 계정이 연결돼 있지 않아요.",
        ),
        actionRow(link(shopUrl(shopSlug, "/dashboard?tab=buyback"), "사이트에서 보기")),
      ],
      ACCENT,
    ),
  ]);
}

/* ───────────── 관리자 카드 ───────────── */

function cardBody(shopSlug: string, b: Buyback, note?: string) {
  const a = b.appraisal;
  const target = b.targetProductId ? getProductById(b.targetProductId) : null;
  const done = ["completed", "rejected", "cancelled"].includes(b.status);
  const color = b.status === "completed" ? 0x22c55e : done ? 0x64748b : b.status === "handover" ? 0x38bdf8 : ACCENT;
  const kids: unknown[] = [
    textDisplay(`## ${plainEmoji("does_coin")} ${b.kind === "tradein" ? "보상판매" : "계정 매입"} · ${STATUS_KO[b.status]}`),
    textDisplay(
      [
        `**신청자** ${b.discordId ? `<@${b.discordId}>` : b.userId}`,
        `**계정** \`${a.nickname}\` · 망토 ${a.capes.length ? a.capes.map((c) => c.title).join(", ") : "없음"}`,
        a.hypixel ? `**하이픽셀** ${a.hypixel.rank ?? "일반"} · Lv.${Math.floor(a.hypixel.level)} · 베드워즈 ${a.hypixel.bedwarsStars}성` : "**하이픽셀** 기록 없음",
        `**자동 감정** ${a.low ? `${won(a.low)} ~ ${won(a.high)}` : "시세 부족"}${a.basis.length ? ` (${a.basis.slice(0, 3).join(" · ")})` : ""}`,
        `**받는 방법** ${b.payout === "points" ? "포인트" : "현금 송금"}${target ? ` · **바꿀 계정** ${target.name} (${won(target.price)})` : ""}`,
        b.offerPrice ? `**제시가** ${won(b.offerPrice)}${b.kind === "tradein" ? ` → 보너스 포함 ${won(Math.round(b.offerPrice * (1 + TRADEIN_BONUS_PERCENT / 100)))}` : ""}` : "",
        b.note ? `**손님 메모** ${b.note}` : "",
        b.result ? `**결과** ${b.result}` : "",
        b.closedReason ? `**사유** ${b.closedReason}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ];
  if (note) kids.push(textDisplay(`> ${note}`));
  if (!done) {
    const row: unknown[] = [];
    if (["submitted", "offered"].includes(b.status)) row.push(btn(cid(shopSlug, "bb_off", b.id), b.status === "offered" ? "매입가 다시 제시" : "매입가 제시", ButtonStyle.PRIMARY));
    if (b.status === "handover") {
      row.push(btn(cid(shopSlug, "bb_view", b.id), "로그인 정보 보기", ButtonStyle.SECONDARY));
      row.push(btn(cid(shopSlug, "bb_done", b.id), b.payout === "cash" ? "송금했어요 · 완료" : "완료 · 지급", ButtonStyle.SUCCESS));
    }
    row.push(btn(cid(shopSlug, "bb_rej", b.id), "반려", ButtonStyle.DANGER));
    kids.push(actionRow(...row));
  }
  kids.push(textDisplay(`-# 신청 ${b.id}`));
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, color)], allowed_mentions: { parse: [] as string[] } };
}

export async function postBuybackCard(shopId: string, shopSlug: string, b: Buyback) {
  const s = getShopSettings(shopId);
  const ch = s.buybackAdminChannelId || s.gugoAdminChannelId || s.coinAdminChannelId;
  if (!ch) return;
  const posted = await postChannelMessage(ch, cardBody(shopSlug, b), shopId).catch(() => null);
  const messageId = (posted?.json as { id?: string } | null)?.id;
  if (messageId) await setBuybackAdminCard(shopId, b.id, { channelId: ch, messageId }).catch(() => null);
}

export async function patchBuybackCard(shopId: string, shopSlug: string, b: Buyback, note?: string) {
  const cur = b.adminCard ?? (await getBuyback(shopId, b.id))?.adminCard;
  if (!cur) return;
  const body = cardBody(shopSlug, b, note);
  await discordRest("PATCH", `/channels/${cur.channelId}/messages/${cur.messageId}`, { components: body.components, flags: body.flags }, shopId).catch(() => null);
}

function guard(shopSlug: string, roles: string[], permissions: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return { error: plainEphemeral("상점을 찾을 수 없어요.") };
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return { error: plainEphemeral("관리자만 처리할 수 있어요.") };
  return { shop };
}

export async function handleBuybackOfferButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const b = await getBuyback(g.shop.id, id);
  if (!b) return plainEphemeral("신청을 찾을 수 없어요.");
  return showModal({
    customId: cid(shopSlug, "bb_offm", id),
    title: "매입가 제시",
    inputs: [
      textInput({ customId: "price", label: `매입가 (원) · 자동 감정 ${b.appraisal.low ? `${b.appraisal.low}~${b.appraisal.high}` : "없음"}`.slice(0, 45), placeholder: String(b.appraisal.high ?? ""), required: true, maxLength: 9 }),
      textInput({ customId: "note", label: "손님에게 보낼 설명 (선택)", style: 2, required: false, maxLength: 300 }),
    ],
  });
}

export async function handleBuybackOfferSubmit(shopSlug: string, id: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  try {
    const b = await offerBuyback(g.shop.id, id, Number(modalFieldValue(interaction, "price").replace(/[,\s원₩P]/gi, "")), modalFieldValue(interaction, "note"));
    const bonus = b.kind === "tradein" && b.offerPrice ? Math.round(b.offerPrice * (1 + TRADEIN_BONUS_PERCENT / 100)) : null;
    await dm(
      b,
      `${plainEmoji("does_coin")} 매입가가 나왔어요`,
      [
        `**계정** \`${b.appraisal.nickname}\``,
        `**매입가** ${won(b.offerPrice)}${bonus ? ` → 보상판매 보너스 포함 **${won(bonus)}**` : ""}`,
        b.offerNote ? `> ${b.offerNote}` : "",
        "수락하면 사이트에서 로그인 정보를 내 주세요. 확인 후 바로 지급해 드려요.",
      ],
      ACCENT,
      [btn(cid(shopSlug, "bb_yes", b.id), "수락", ButtonStyle.SUCCESS), btn(cid(shopSlug, "bb_no", b.id), "거절", ButtonStyle.SECONDARY)],
    );
    return v2Update(cardBody(shopSlug, b, "제시가를 손님에게 보냈어요").components);
  } catch (e) {
    const cur = await getBuyback(g.shop.id, id);
    return cur ? v2Update(cardBody(shopSlug, cur, e instanceof Error ? e.message : "처리하지 못했어요.").components) : plainEphemeral("처리하지 못했어요.");
  }
}

/** 손님 DM [수락] [거절] */
export async function handleBuybackRespond(shopSlug: string, discordId: string, id: string, accept: boolean) {
  const shop = getShopBySlug(shopSlug);
  const user = shop ? getUserByDiscordId(shop.id, discordId) : null;
  if (!shop || !user) return plainEphemeral("사이트 계정이 연결돼 있지 않아요.");
  try {
    const b = await respondBuyback(shop.id, id, user.id, accept);
    await patchBuybackCard(shop.id, shop.slug, b);
    return v2Update([
      container(
        accept
          ? [
              textDisplay(`## ${plainEmoji("does_check")} 수락했어요`),
              textDisplay("이제 사이트에서 계정 로그인 정보를 내 주세요. 정보는 암호화해서 관리자만 보고, 끝나면 지워요."),
              actionRow(link(shopUrl(shop.slug, "/dashboard?tab=buyback"), "로그인 정보 내러 가기")),
            ]
          : [textDisplay("## 매입을 거절했어요"), textDisplay("신청이 취소됐어요. 언제든 다시 신청할 수 있어요.")],
        accept ? 0x22c55e : 0x64748b,
      ),
    ]);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
}

/** 관리자 — 로그인 정보 · 계좌 보기 (나에게만) */
export async function handleBuybackView(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const b = await getBuyback(g.shop.id, id);
  if (!b) return plainEphemeral("신청을 찾을 수 없어요.");
  const { cred, bank } = revealBuyback(b);
  return v2Ephemeral([
    container(
      [
        textDisplay(`## 🔒 ${b.appraisal.nickname} 로그인 정보`),
        textDisplay(cred ? `**이메일** \`${cred.email}\`\n**비밀번호** ||${cred.password}||${cred.extra ? `\n**추가** ${cred.extra}` : ""}` : "아직 제출되지 않았어요."),
        ...(bank ? [separator(true, 1), textDisplay(`**송금 계좌** ${bank.name} ${bank.account} (${bank.holder})`)] : []),
        textDisplay("-# 이 메시지는 나에게만 보여요 · 완료하면 서버에서 지워져요"),
      ],
      0x0ea5e9,
    ),
  ]);
}

export async function handleBuybackDone(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  try {
    const b = await completeBuyback(g.shop.id, id);
    await persistAsync();
    await dm(b, `${plainEmoji("does_check")} 매입이 완료됐어요`, [`**계정** \`${b.appraisal.nickname}\``, `**결과** ${b.result ?? ""}`, "이용해 주셔서 감사해요!"], 0x22c55e);
    return v2Update(cardBody(shopSlug, b).components);
  } catch (e) {
    const cur = await getBuyback(g.shop.id, id);
    return cur ? v2Update(cardBody(shopSlug, cur, e instanceof Error ? e.message : "처리하지 못했어요.").components) : plainEphemeral("처리하지 못했어요.");
  }
}

export async function handleBuybackRejectButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  return showModal({ customId: cid(shopSlug, "bb_rejm", id), title: "매입 반려", inputs: [textInput({ customId: "reason", label: "반려 사유 (손님에게 DM)", style: 2, required: false, maxLength: 300 })] });
}

export async function handleBuybackRejectSubmit(shopSlug: string, id: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  try {
    const b = await rejectBuyback(g.shop.id, id, modalFieldValue(interaction, "reason"));
    await dm(b, "매입 신청이 반려됐어요", [`**계정** \`${b.appraisal.nickname}\``, `**사유** ${b.closedReason ?? ""}`], 0x64748b);
    return v2Update(cardBody(shopSlug, b).components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
}

async function dm(b: Buyback, title: string, lines: string[], color: number, buttons: unknown[] = []) {
  if (!b.discordId) return;
  await sendDiscordDm(
    b.discordId,
    { flags: MessageFlags.IS_COMPONENTS_V2, components: [container([textDisplay(`## ${title}`), separator(true, 1), textDisplay(lines.filter(Boolean).join("\n")), ...(buttons.length ? [actionRow(...buttons)] : [])], color)] },
    b.shopId,
  ).catch(() => null);
}
