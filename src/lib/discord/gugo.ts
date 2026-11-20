/**
 * /구해드림 — 원하는 계정을 조건 · 예산 · 기한으로 주문 (선금 30%).
 * 패널 [구해드림 신청] → 입력 창 → 선금 차감 · 접수 → 관리자 채널 카드 [수락] [납품] [거절]
 * 납품(최종가 · 계정 정보) → 손님 DM [잔금 결제하고 받기] → 결제하면 계정 정보 공개
 * 기한이 지나면 선금 자동 환불 (크론)
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
  acceptGugo,
  cancelGugo,
  createGugo,
  depositFor,
  getGugo,
  GUGO_DEADLINES,
  GUGO_DEPOSIT_PERCENT,
  GUGO_MAX_BUDGET,
  GUGO_MIN_BUDGET,
  listGugo,
  offerGugo,
  payGugo,
  rejectGugo,
  setGugoAdminCard,
  type GugoRequest,
} from "@/lib/gugo";
import { getShopById, getShopBySlug, getShopSettings, getUserByDiscordId, persistAsync, updateShopSettings } from "@/lib/store";

const ACCENT = 0xf59e0b;
const won = (n: number) => `${Math.max(0, Math.round(n)).toLocaleString("ko-KR")}원`;
const ts = (iso: string, f = "R") => `<t:${Math.floor(Date.parse(iso) / 1000)}:${f}>`;

const STATUS_KO: Record<GugoRequest["status"], string> = {
  open: "접수됨",
  accepted: "구하는 중",
  offered: "구했어요 · 잔금 대기",
  fulfilled: "완료",
  refunded: "환불됨",
  cancelled: "취소됨",
  expired: "잔금 미결제 · 만료",
};

function btn(customId: string, label: string, style: number, emoji?: string) {
  const m = emoji ? /^<(a?):(\w+):(\d+)>$/.exec(emoji) : null;
  return {
    type: ComponentType.BUTTON,
    style,
    label,
    custom_id: customId.slice(0, 100),
    ...(emoji ? { emoji: m ? { id: m[3], name: m[2], animated: Boolean(m[1]) } : { name: emoji } } : {}),
  };
}

/* ───────────── 패널 ───────────── */

function panelMessage(shopSlug: string) {
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          textDisplay(`## ${appEmoji("does_sparkles")} 구해드림`),
          textDisplay("원하는 계정이 재고에 없나요? **조건 · 예산 · 기한**을 적어 주면 DOES가 구해 드려요."),
          textDisplay(
            [
              `> ${appEmoji("does_coin")} 신청할 때 **선금 ${GUGO_DEPOSIT_PERCENT}%** · 구해 오면 남은 금액만 결제`,
              `> ${appEmoji("does_clock")} 기한 ${GUGO_DEADLINES.join(" · ")}일 중 선택 · **기한 안에 못 구하면 선금 자동 환불**`,
              `> ${appEmoji("does_shield")} 수락 전에는 언제든 취소 가능 (선금 환불)`,
            ].join("\n"),
          ),
          textDisplay(`-# 예) 15주년 망토 · 베드워즈 1000성 이상 · 검정 플러스(MVP+) · 예산 ${won(150_000)}`),
          actionRow(
            btn(cid(shopSlug, "gg_new"), "구해드림 신청", ButtonStyle.SUCCESS, appEmoji("does_sparkles")),
            btn(cid(shopSlug, "gg_mine"), "내 구해드림", ButtonStyle.SECONDARY, appEmoji("does_chart")),
          ),
        ],
        ACCENT,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

/** /구해드림 (관리자) — 패널을 이 채널에 올린다 */
export async function handleGugoCommand(shopSlug: string, roles: string[], permissions: string | undefined, channelId: string | undefined, adminChannelId: string | null) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) return errorPanel("관리자만 올릴 수 있어요.", "권한 없음");
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const adminCh = adminChannelId || settings.gugoAdminChannelId || settings.coinAdminChannelId || null;
  if (!adminCh) return errorPanel("주문 카드를 받을 관리자 채널을 `승인채널` 옵션으로 한 번 지정해 주세요.");
  const posted = await postChannelMessage(channelId, panelMessage(shop.slug), shop.id);
  if (!posted.ok) return errorPanel("패널을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  updateShopSettings(shop.id, { gugoAdminChannelId: adminCh });
  await persistAsync();
  return plainEphemeral(`구해드림 패널을 올렸어요. 주문 카드는 <#${adminCh}> 채널로 갑니다.`);
}

/* ───────────── 손님 ───────────── */

export function handleGugoNewButton(shopSlug: string) {
  return showModal({
    customId: cid(shopSlug, "gg_modal"),
    title: "구해드림 신청",
    inputs: [
      textInput({ customId: "wish", label: "원하는 계정 조건", placeholder: "예) 15주년 망토, 베드워즈 1000성 이상, MVP+", style: 2, required: true, minLength: 4, maxLength: 300 }),
      textInput({ customId: "budget", label: `예산 (원) · 선금 ${GUGO_DEPOSIT_PERCENT}% 바로 차감`, placeholder: "150000", required: true, maxLength: 9 }),
      textInput({ customId: "days", label: `기한 (${GUGO_DEADLINES.join(" / ")}일 중)`, placeholder: "7", required: true, maxLength: 2 }),
    ],
  });
}

export async function handleGugoSubmit(shopSlug: string, discordId: string, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return plainEphemeral(`구해드림은 포인트로 선금을 내서 사이트 계정이 필요해요. 사이트에서 디스코드로 로그인해 주세요: ${shopUrl(shop.slug, "/dashboard")}`);
  const budget = Number(modalFieldValue(interaction, "budget").replace(/[,\s원₩P]/gi, ""));
  const days = Number(modalFieldValue(interaction, "days").replace(/[^\d]/g, ""));
  let r: GugoRequest & { balance: number };
  try {
    r = await createGugo(shop.id, { id: user.id, discordId }, { wish: modalFieldValue(interaction, "wish"), budget, deadlineDays: days });
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "신청하지 못했어요.");
  }
  await persistAsync();
  await postAdminCard(shop.id, shop.slug, r);
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${plainEmoji("does_check")} 구해드림 접수 완료`),
        textDisplay(
          [
            `**조건** ${r.wish}`,
            `**예산** ${won(r.budget)} · **선금** ${won(r.deposit)} (남은 포인트 ${r.balance.toLocaleString("ko-KR")}P)`,
            `**기한** ${ts(r.deadline, "f")} 까지 · 못 구하면 선금 자동 환불`,
          ].join("\n"),
        ),
        actionRow(btn(cid(shopSlug, "gg_cancel", r.id), "취소하고 선금 환불", ButtonStyle.SECONDARY)),
        textDisplay(`-# 주문 ${r.id} · 관리자가 수락하기 전까지만 취소할 수 있어요`),
      ],
      ACCENT,
    ),
  ]);
}

export async function handleGugoCancel(shopSlug: string, discordId: string, id: string) {
  const shop = getShopBySlug(shopSlug);
  const user = shop ? getUserByDiscordId(shop.id, discordId) : null;
  if (!shop || !user) return plainEphemeral("주문을 찾을 수 없어요.");
  try {
    const r = await cancelGugo(shop.id, id, user.id);
    await persistAsync();
    await patchAdminCard(shop.id, shop.slug, r);
    return v2Update([container([textDisplay("## 구해드림을 취소했어요"), textDisplay(`선금 **${won(r.deposit)}** 를 돌려드렸어요.`)], 0x64748b)]);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "취소하지 못했어요.");
  }
}

export async function handleGugoMine(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  const mine = user ? (await listGugo(shop.id)).filter((r) => r.userId === user.id).slice(0, 8) : [];
  const lines = mine.map((r) => `· **${STATUS_KO[r.status]}** — ${r.wish.slice(0, 50)} · 예산 ${won(r.budget)}${r.status === "offered" && r.finalPrice ? ` · 잔금 ${won(r.finalPrice - r.deposit)}` : ""}`);
  const payRows = mine
    .filter((r) => r.status === "offered")
    .slice(0, 5)
    .map((r) => btn(cid(shopSlug, "gg_pay", r.id), `잔금 결제 · ${won(Math.max(0, (r.finalPrice ?? 0) - r.deposit))}`, ButtonStyle.SUCCESS));
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${plainEmoji("does_chart")} 내 구해드림`),
        textDisplay(lines.length ? lines.join("\n") : user ? "아직 신청한 구해드림이 없어요." : "사이트 계정이 연결돼 있지 않아요."),
        ...(payRows.length ? [actionRow(...payRows)] : []),
        textDisplay(`-# 사이트 대시보드의 「구해드림」 탭에서도 볼 수 있어요`),
      ],
      ACCENT,
    ),
  ]);
}

/** 잔금 결제 → 계정 정보 공개 */
export async function handleGugoPay(shopSlug: string, discordId: string, id: string) {
  const shop = getShopBySlug(shopSlug);
  const user = shop ? getUserByDiscordId(shop.id, discordId) : null;
  if (!shop || !user) return plainEphemeral("사이트 계정이 연결돼 있지 않아요.");
  let r: GugoRequest & { rest: number };
  try {
    r = await payGugo(shop.id, id, user.id);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "결제하지 못했어요.");
  }
  await persistAsync();
  await patchAdminCard(shop.id, shop.slug, r);
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${plainEmoji("does_check")} 구해드림 완료!`),
        textDisplay(`**결제** 잔금 ${won(r.rest)} (총 ${won(r.finalPrice ?? 0)})`),
        separator(true, 1),
        textDisplay(`**계정 정보**\n\`\`\`\n${r.delivery ?? ""}\n\`\`\``),
        textDisplay("-# 받은 뒤 바로 비밀번호 · 보안 정보를 바꿔 주세요 · 사이트 「구해드림」 탭에서도 다시 볼 수 있어요"),
      ],
      0x22c55e,
    ),
  ]);
}

/* ───────────── 관리자 ───────────── */

function adminCardBody(shopSlug: string, r: GugoRequest, note?: string) {
  const color = r.status === "fulfilled" ? 0x22c55e : r.status === "offered" ? 0x38bdf8 : ["refunded", "cancelled", "expired"].includes(r.status) ? 0x64748b : ACCENT;
  const kids: unknown[] = [
    textDisplay(`## ${plainEmoji("does_sparkles")} 구해드림 · ${STATUS_KO[r.status]}`),
    textDisplay(
      [
        `**주문자** ${r.discordId ? `<@${r.discordId}>` : r.userId}`,
        `**조건** ${r.wish}`,
        `**예산** ${won(r.budget)} · **선금** ${won(r.deposit)} 받음`,
        `**기한** ${ts(r.deadline, "f")} (${ts(r.deadline)})`,
        r.finalPrice !== null ? `**최종가** ${won(r.finalPrice)} · 잔금 ${won(Math.max(0, r.finalPrice - r.deposit))}` : "",
        r.closedReason ? `**사유** ${r.closedReason}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ];
  if (note) kids.push(textDisplay(`> ${note}`));
  if (["open", "accepted"].includes(r.status)) {
    kids.push(
      actionRow(
        ...(r.status === "open" ? [btn(cid(shopSlug, "gg_acc", r.id), "수락", ButtonStyle.PRIMARY)] : []),
        btn(cid(shopSlug, "gg_off", r.id), "납품 (구했어요)", ButtonStyle.SUCCESS),
        btn(cid(shopSlug, "gg_rej", r.id), "거절 · 환불", ButtonStyle.DANGER),
      ),
    );
  }
  kids.push(textDisplay(`-# 주문 ${r.id}`));
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, color)], allowed_mentions: { parse: [] as string[] } };
}

export async function postAdminCard(shopId: string, shopSlug: string, r: GugoRequest) {
  const ch = getShopSettings(shopId).gugoAdminChannelId || getShopSettings(shopId).coinAdminChannelId;
  if (!ch) return;
  const posted = await postChannelMessage(ch, adminCardBody(shopSlug, r), shopId).catch(() => null);
  const messageId = (posted?.json as { id?: string } | null)?.id;
  if (messageId) await setGugoAdminCard(shopId, r.id, { channelId: ch, messageId }).catch(() => null);
}

export async function patchAdminCard(shopId: string, shopSlug: string, r: GugoRequest, note?: string) {
  const cur = r.adminCard ?? (await getGugo(shopId, r.id))?.adminCard;
  if (!cur) return;
  const body = adminCardBody(shopSlug, r, note);
  await discordRest("PATCH", `/channels/${cur.channelId}/messages/${cur.messageId}`, { components: body.components, flags: body.flags }, shopId).catch(() => null);
}

function guard(shopSlug: string, roles: string[], permissions: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return { error: plainEphemeral("상점을 찾을 수 없어요.") };
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return { error: plainEphemeral("관리자만 처리할 수 있어요.") };
  return { shop };
}

export async function handleGugoAccept(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  try {
    const r = await acceptGugo(g.shop.id, id);
    await dm(r, `${plainEmoji("does_check")} 구해드림을 수락했어요`, [`**조건** ${r.wish}`, `${ts(r.deadline, "f")} 안에 구해 드릴게요. 못 구하면 선금이 자동으로 환불돼요.`], ACCENT);
    return v2Update(adminCardBody(shopSlug, r).components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
}

export async function handleGugoOfferButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const r = await getGugo(g.shop.id, id);
  if (!r || !["open", "accepted"].includes(r.status)) return plainEphemeral("이미 처리된 주문이에요.");
  return showModal({
    customId: cid(shopSlug, "gg_offm", id),
    title: "구해드림 납품",
    inputs: [
      textInput({ customId: "price", label: `최종가 (원) · 예산 ${r.budget.toLocaleString("ko-KR")}`, placeholder: String(r.budget), required: true, maxLength: 9 }),
      textInput({ customId: "delivery", label: "손님에게 줄 계정 정보 (잔금 결제 후 공개)", placeholder: "16자리 코드 또는 로그인 정보", style: 2, required: true, maxLength: 1500 }),
      textInput({ customId: "note", label: "손님에게 보낼 한마디 (선택)", required: false, maxLength: 300 }),
    ],
  });
}

export async function handleGugoOfferSubmit(shopSlug: string, id: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  try {
    const r = await offerGugo(g.shop.id, id, {
      finalPrice: Number(modalFieldValue(interaction, "price").replace(/[,\s원₩P]/gi, "")),
      delivery: modalFieldValue(interaction, "delivery"),
      note: modalFieldValue(interaction, "note"),
    });
    const rest = Math.max(0, (r.finalPrice ?? 0) - r.deposit);
    await dm(
      r,
      `${plainEmoji("does_party")} 원하신 계정을 구했어요!`,
      [
        `**조건** ${r.wish}`,
        `**최종가** ${won(r.finalPrice ?? 0)} · 이미 낸 선금 ${won(r.deposit)} → **잔금 ${won(rest)}**`,
        r.offerNote ? `> ${r.offerNote}` : "",
        `48시간 안에 잔금을 결제하면 바로 계정 정보를 드려요.`,
      ],
      0x38bdf8,
      [btn(cid(shopSlug, "gg_pay", r.id), `잔금 결제하고 받기 · ${won(rest)}`, ButtonStyle.SUCCESS)],
    );
    return v2Update(adminCardBody(shopSlug, r, "납품 완료 · 손님 잔금 결제 대기").components);
  } catch (e) {
    const cur = await getGugo(g.shop.id, id);
    return cur ? v2Update(adminCardBody(shopSlug, cur, e instanceof Error ? e.message : "처리하지 못했어요.").components) : plainEphemeral("처리하지 못했어요.");
  }
}

export async function handleGugoRejectButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  return showModal({
    customId: cid(shopSlug, "gg_rejm", id),
    title: "구해드림 거절 · 선금 환불",
    inputs: [textInput({ customId: "reason", label: "거절 사유 (손님에게 DM)", style: 2, required: false, maxLength: 300 })],
  });
}

export async function handleGugoRejectSubmit(shopSlug: string, id: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  try {
    const r = await rejectGugo(g.shop.id, id, modalFieldValue(interaction, "reason").trim());
    await persistAsync();
    await notifyClosed(r);
    return v2Update(adminCardBody(shopSlug, r).components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
}

/* ───────────── 알림 ───────────── */

async function dm(r: GugoRequest, title: string, lines: string[], color: number, buttons: unknown[] = []) {
  if (!r.discordId) return;
  await sendDiscordDm(
    r.discordId,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [container([textDisplay(`## ${title}`), separator(true, 1), textDisplay(lines.filter(Boolean).join("\n")), ...(buttons.length ? [actionRow(...buttons)] : [])], color)],
    },
    r.shopId,
  ).catch(() => null);
}

export async function notifyClosed(r: GugoRequest) {
  if (r.status === "refunded") {
    await dm(r, "구해드림 선금을 환불했어요", [`**조건** ${r.wish}`, r.closedReason ? `**사유** ${r.closedReason}` : "", `**${won(r.deposit)}** 를 포인트로 돌려드렸어요.`], 0x64748b);
  } else if (r.status === "expired") {
    await dm(r, "구해드림이 만료됐어요", [`**조건** ${r.wish}`, "납품 후 48시간 안에 잔금을 결제하지 않아 주문이 끝났어요. (선금은 돌려드리지 않아요)"], 0x64748b);
  }
}

/** 크론 — 기한 지난 주문 환불 · 만료 후 알림 */
export async function runGugoSweep(shopId: string) {
  const { sweepGugo } = await import("@/lib/gugo");
  const changed = await sweepGugo(shopId);
  if (!changed.length) return;
  await persistAsync();
  const slug = getShopById(shopId)?.slug;
  for (const r of changed) {
    await notifyClosed(r);
    if (slug) await patchAdminCard(shopId, slug, r);
  }
}

export { depositFor, GUGO_MAX_BUDGET, GUGO_MIN_BUDGET };
