/**
 * /프록시등록 — 디스코드에서 대리판매(프록시) 신청을 받는 패널.
 *
 * 패널: 현황 이미지(등록자 · 판매 중 · 판매 완료 · 누적 판매액) + [프록시 등록하기] [내 프록시 현황]
 * 등록하기 → 모달(닉네임 · 가격 · 계정 설명 · 정산 계좌) → 관리자 채널에 승인/거절 카드
 * 승인 → 상점 「대리판매」 탭에 상품으로 올라감 (lib/resale-actions) · 결과·판매 완료는 신청자 DM
 * 내 프록시 현황 → 나만 보이는 이미지 카드
 */
import { appEmoji, plainEmoji } from "@/lib/discord/app-emojis";
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
  separator,
  showModal,
  textDisplay,
  textInput,
  v2Ephemeral,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import { premiumBenefits } from "@/lib/premium";
import { createResaleRequest, listResaleRequests, resalePayout, validateResaleInput, type ResaleRequest } from "@/lib/resale";
import { approveResaleRequest, getResaleRequest, rejectResaleRequest, resaleShownName } from "@/lib/resale-actions";
import { getShopById, getShopBySlug, getShopSettings, getStoreForRead, getUserByDiscordId, persistAsync, updateShopSettings } from "@/lib/store";
import { pushAdminNotification } from "@/lib/store-ext";

const COUNTED = new Set(["dispensed", "paid", "awaiting_fulfillment"]);
const DISCORD_ACCOUNT_TYPE = "일반 계정";
const won = (n: number) => `${Math.max(0, Math.round(n)).toLocaleString("ko-KR")}원`;

/** 버튼 색(초록·빨강)은 공용 button() 이 회색으로 고정이라 직접 만든다 */
function styledButton(customId: string, label: string, style: number, emoji?: string) {
  const m = emoji ? /^<(a?):(\w+):(\d+)>$/.exec(emoji) : null;
  return {
    type: ComponentType.BUTTON,
    style,
    label,
    custom_id: customId.slice(0, 100),
    ...(emoji ? { emoji: m ? { id: m[3], name: m[2], animated: Boolean(m[1]) } : { name: emoji } } : {}),
  };
}

/** 판매 여부는 실제 주문으로 판단한다 (상품이 팔렸으면 판매 완료) */
function soldProductIds(shopId: string, productIds: Set<string>) {
  const sold = new Map<string, number>();
  for (const o of getStoreForRead().orders) {
    if (o.shopId !== shopId || !o.productId || !productIds.has(o.productId) || !COUNTED.has(o.status)) continue;
    sold.set(o.productId, (sold.get(o.productId) ?? 0) + (o.amount || 0));
  }
  return sold;
}

function rowStatus(r: ResaleRequest, sold: Map<string, number>) {
  if (r.status === "approved") return r.soldAt || (r.productId && sold.has(r.productId)) ? "sold" : "selling";
  return r.status;
}

export async function proxyStats(shopId: string) {
  const list = await listResaleRequests(shopId);
  const approved = list.filter((r) => r.status === "approved");
  const sold = soldProductIds(shopId, new Set(approved.map((r) => r.productId).filter((x): x is string => Boolean(x))));
  const soldRows = approved.filter((r) => rowStatus(r, sold) === "sold");
  return {
    registrants: new Set(approved.map((r) => r.userId)).size,
    selling: approved.length - soldRows.length,
    sold: soldRows.length,
    soldAmount: soldRows.reduce((n, r) => n + (r.productId && sold.get(r.productId) ? sold.get(r.productId)! : r.price), 0),
    pending: list.filter((r) => r.status === "pending").length,
  };
}

function kst() {
  const t = new Date(Date.now() + 9 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

async function signedImage(shopId: string, data: { kind: string } & Record<string, unknown>) {
  const slug = getShopById(shopId)?.slug;
  if (!slug) return null;
  return import("@/lib/discord/rank-image").then((m) => m.signedDataImageUrl(slug, data)).catch(() => null);
}

async function panelMessage(shopId: string, shopSlug: string) {
  const s = await proxyStats(shopId);
  const image = await signedImage(shopId, { kind: "proxy_panel", ...s, time: kst() });
  const kids: unknown[] = [
    ...(image ? [mediaGallery([image])] : []),
    textDisplay(`## ${plainEmoji("does_gem")} 도스마켓`),
    textDisplay(
      [
        "내 마인크래프트 계정을 DOES가 대신 안전하게 팔아 드려요. 구매자 돈은 DOES가 보관했다가 정산해요.",
        "> 판매 등록 → 관리자 확인 → 마켓 공개 → 구매 · 자동 전달 → 구매자 보호 24시간 → 수수료 빼고 정산",
      ].join("\n"),
    ),
    ...(image
      ? []
      : [textDisplay(`판매자 **${s.registrants}명** · 판매 중 **${s.selling}개** · 판매 완료 **${s.sold}개** · 누적 **${won(s.soldAmount)}**`)]),
    separator(true, 1),
    actionRow(
      styledButton(cid(shopSlug, "px_reg"), "판매 등록", ButtonStyle.PRIMARY, appEmoji("does_plus")),
      styledButton(cid(shopSlug, "px_mine"), "내 판매", ButtonStyle.SECONDARY, appEmoji("does_chart")),
      styledButton(cid(shopSlug, "dm_list"), "매물 보기", ButtonStyle.SECONDARY),
      styledButton(cid(shopSlug, "dm_buys"), "내가 산 계정", ButtonStyle.SECONDARY),
    ),
    actionRow(styledButton(cid(shopSlug, "sx_new"), "안전거래 링크 만들기", ButtonStyle.SUCCESS)),
    textDisplay("-# 등록 · 판매 · 정산 소식은 DM으로 알려 드려요 · 안전거래 링크는 DOES 밖에서 만난 거래에 써요"),
  ];
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, 0x6366f1)], allowed_mentions: { parse: [] as string[] } };
}

/** /프록시등록 (관리자) — 패널을 채널에 올리고 위치를 기억한다 */
export async function handleProxyCommand(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  channelId: string | undefined,
  adminChannelId: string | null,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) return errorPanel("도스마켓 패널은 관리자만 올릴 수 있어요.", "권한 없음");
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const adminCh = adminChannelId || settings.proxyAdminChannelId || settings.stockRequestChannelId || null;
  if (!adminCh) return errorPanel("신청을 받을 관리자 채널을 `승인채널` 옵션으로 한 번 지정해 주세요.");

  const posted = await postChannelMessage(channelId, await panelMessage(shop.id, shop.slug), shop.id);
  const messageId = (posted.json as { id?: string } | null)?.id;
  if (!posted.ok || !messageId) return errorPanel("패널을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  updateShopSettings(shop.id, { proxyAdminChannelId: adminCh, proxyPanel: { channelId, messageId } });
  await persistAsync();
  return plainEphemeral(`도스마켓 패널을 올렸어요. 판매 신청 · 정산 · 신고 카드는 <#${adminCh}> 채널로 갑니다.`);
}

/** 숫자가 바뀌면 패널을 다시 그린다 (등록 · 승인 · 거절 · 판매 때) */
export async function refreshProxyPanel(shopId: string) {
  const at = getShopSettings(shopId).proxyPanel;
  const slug = getShopById(shopId)?.slug;
  if (!at || !slug) return;
  const body = await panelMessage(shopId, slug);
  const r = await discordRest("PATCH", `/channels/${at.channelId}/messages/${at.messageId}`, { components: body.components, flags: body.flags }, shopId);
  if (r.status === 404) {
    updateShopSettings(shopId, { proxyPanel: null });
    await persistAsync();
  }
}

/** [프록시 등록하기] → 모달 */
export function handleProxyRegisterButton(shopSlug: string) {
  return showModal({
    customId: cid(shopSlug, "px_modal"),
    title: "도스마켓 판매 등록",
    inputs: [
      textInput({ customId: "ign", label: "마인크래프트 닉네임", placeholder: "영문·숫자·_ 3~16자", required: true, minLength: 3, maxLength: 16 }),
      textInput({ customId: "price", label: "희망 판매 가격 (원)", placeholder: "예: 30000", required: true, maxLength: 9 }),
      textInput({ customId: "desc", label: "계정 설명", style: 2, placeholder: "망토 · 랭크 · 하이픽셀 기록 · 특이사항 등", required: false, maxLength: 1000 }),
      textInput({ customId: "account", label: "정산 — '포인트' 또는 계좌(은행·번호·예금주)", placeholder: "포인트  /  카카오뱅크 3333-00-0000000 홍길동", required: true, minLength: 3, maxLength: 100 }),
      textInput({ customId: "login", label: "계정 로그인 정보 (암호화 보관 · 구매자에게만 전달)", style: 2, placeholder: "1줄: 이메일\n2줄: 비밀번호\n3줄~: 복구 이메일 등 추가 정보", required: false, maxLength: 800 }),
    ],
  });
}

function maskAccount(acc: string) {
  return acc.replace(/\d(?=[\d-]{4})/g, "•");
}

/** 모달 제출 → 신청 저장 · 관리자 채널에 승인/거절 카드 */
export async function handleProxyRegisterSubmit(shopSlug: string, discordUser: { id: string; name: string }, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordUser.id);
  if (!user) {
    return v2Ephemeral([
      container([
        textDisplay("## 먼저 사이트 계정을 연결해 주세요"),
        textDisplay("도스마켓 판매는 정산 때문에 사이트 계정이 필요해요.\n사이트에서 **디스코드로 로그인**하면 자동으로 연결돼요. 연결한 뒤 다시 눌러 주세요."),
        actionRow(styledLink(shopUrl(shop.slug, "/dashboard"), "사이트에서 로그인")),
      ]),
    ]);
  }

  const ign = modalFieldValue(interaction, "ign").trim();
  const price = Number(modalFieldValue(interaction, "price").replace(/[,\s원₩]/g, ""));
  const description = modalFieldValue(interaction, "desc").trim();
  const accountRaw = modalFieldValue(interaction, "account").trim();
  const payByPoints = /^(포인트|point|points|p)$/i.test(accountRaw.replace(/\s/g, ""));
  const payoutAccount = payByPoints ? "포인트 자동 정산" : accountRaw;
  const loginLines = modalFieldValue(interaction, "login")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(이메일|email|아이디|id|비밀번호|비번|password|pw)\s*[:：]\s*/i, "").trim())
    .filter(Boolean);
  const cred = loginLines.length >= 2 ? { email: loginLines[0]!, password: loginLines[1]!, extra: loginLines.slice(2).join("\n") } : null;
  if (loginLines.length === 1) return plainEphemeral("로그인 정보는 1줄에 이메일, 2줄에 비밀번호를 적어 주세요.");
  const input = { accountType: DISCORD_ACCOUNT_TYPE, ign, showName: false, capes: [] as string[], description, price, payoutAccount };
  const err = validateResaleInput(input);
  if (err) return plainEphemeral(err);

  const fee = (await premiumBenefits(shop.id, user.id)).resaleFeePercent;
  let req: ResaleRequest;
  try {
    req = await createResaleRequest(shop.id, { id: user.id, name: user.name || discordUser.name, discordId: discordUser.id }, input, fee, "discord");
    const { attachSellerInfo } = await import("@/lib/dosmarket");
    req = await attachSellerInfo(shop.id, req.id, { cred, payoutMethod: payByPoints ? "points" : "bank", payoutAccount: payByPoints ? null : payoutAccount });
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "신청하지 못했어요.");
  }
  pushAdminNotification(shop.id, "resale_request", "도스마켓 판매 신청 (디스코드)", `${req.userName} · ${req.ign} · ${won(req.price)}`);
  await persistAsync();

  const adminCh = getShopSettings(shop.id).proxyAdminChannelId || getShopSettings(shop.id).stockRequestChannelId;
  if (adminCh) await postChannelMessage(adminCh, adminCard(shop.slug, req), shop.id).catch(() => null);
  void refreshProxyPanel(shop.id);

  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${plainEmoji("does_check")} 프록시 등록 신청 완료`),
        textDisplay(
          [
            `**계정** ${req.ign}`,
            `**판매 가격** ${won(req.price)} · 수수료 ${req.feePercent}% → **정산 ${won(req.payout)}**`,
            `**정산 계좌** ${maskAccount(req.payoutAccount ?? "")}`,
          ].join("\n"),
        ),
        textDisplay("-# 관리자가 확인하면 DM 으로 알려 드려요 · 이 메시지는 나에게만 보여요"),
      ],
      0x6366f1,
    ),
  ]);
}

function styledLink(url: string, label: string) {
  return { type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url };
}

function adminCard(shopSlug: string, r: ResaleRequest, result?: { by: string; text: string; color: number }) {
  const kids: unknown[] = [
    textDisplay(`## ${plainEmoji("does_inbox")} 도스마켓 판매 신청`),
    textDisplay(
      [
        `**신청자** ${r.discordId ? `<@${r.discordId}>` : r.userName} · ${r.source === "discord" ? "디스코드" : "웹"}`,
        `**닉네임** ${r.ign}`,
        `**희망 가격** ${won(r.price)} · 수수료 ${r.feePercent}% · 정산 ${won(r.payout)}`,
        `**정산** ${(r.payoutMethod ?? "bank") === "points" ? "포인트 자동" : `계좌 · ${r.payoutAccount || "-"}`}`,
        `**로그인 정보** ${r.hasCred ? "제출됨 (승인하면 구매자에게 자동 전달)" : "없음 — 승인 창에서 지급 코드를 직접 넣어야 해요"}`,
      ].join("\n"),
    ),
    ...(r.description ? [textDisplay(`> ${r.description.slice(0, 900).replace(/\n/g, "\n> ")}`)] : []),
    separator(true, 1),
  ];
  if (result) {
    kids.push(textDisplay(`${result.text} · <@${result.by}> · <t:${Math.floor(Date.now() / 1000)}:R>`));
  } else {
    kids.push(
      actionRow(
        styledButton(cid(shopSlug, "px_ok", r.id), "승인", ButtonStyle.SUCCESS),
        styledButton(cid(shopSlug, "px_no", r.id), "거절", ButtonStyle.DANGER),
        ...(r.hasCred ? [styledButton(cid(shopSlug, "dm_cred", r.id), "로그인 정보 확인", ButtonStyle.SECONDARY)] : []),
      ),
    );
    kids.push(textDisplay(`-# 신청 ${r.id} · 승인하면 가격·계정 정보를 확인하는 창이 떠요`));
  }
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [container(kids, result?.color ?? 0xfacc15)],
    allowed_mentions: { parse: [] as string[] },
  };
}

function adminGuard(shopSlug: string, roles: string[], permissions: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return { error: plainEphemeral("상점을 찾을 수 없어요.") };
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return { error: plainEphemeral("관리자만 처리할 수 있어요.") };
  return { shop };
}

/** [승인] → 가격 확인 · 구매자에게 줄 계정 정보(선택) 모달 */
export async function handleProxyApproveButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = adminGuard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const r = await getResaleRequest(g.shop.id, id);
  if (!r) return plainEphemeral("신청을 찾을 수 없어요.");
  if (r.status !== "pending") return plainEphemeral("이미 처리된 신청이에요.");
  return showModal({
    customId: cid(shopSlug, "px_okm", id),
    title: `승인 · ${r.ign}`.slice(0, 45),
    inputs: [
      textInput({ customId: "price", label: "판매 가격 (원)", value: String(r.price), required: true, maxLength: 9 }),
      textInput({
        customId: "code",
        label: r.hasCred ? "구매자에게 줄 계정 정보 (비우면 판매자 제출본)" : "구매자에게 줄 계정 정보 (비우면 수동 지급)",
        style: 2,
        placeholder: r.hasCred ? "비워 두면 판매자가 낸 로그인 정보가 결제 즉시 자동 지급돼요" : "이메일 | 비밀번호 … 적으면 결제 즉시 자동 지급",
        required: false,
        maxLength: 2000,
      }),
    ],
  });
}

export async function handleProxyApproveSubmit(shopSlug: string, id: string, adminId: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = adminGuard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const price = Number(modalFieldValue(interaction, "price").replace(/[,\s원₩]/g, ""));
  if (!Number.isInteger(price) || price < 1000 || price > 10_000_000) return plainEphemeral("판매 가격은 1,000원 ~ 10,000,000원 사이로 적어 주세요.");
  try {
    const { request } = await approveResaleRequest(g.shop.id, id, { price, deliveryCode: modalFieldValue(interaction, "code") });
    const card = adminCard(shopSlug, request, { by: adminId, text: `${plainEmoji("does_check")} **승인됨** · ${won(price)} 으로 상점에 등록`, color: 0x22c55e });
    return v2Update(card.components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "승인하지 못했어요.");
  }
}

/** [거절] → 사유 모달 */
export async function handleProxyRejectButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = adminGuard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const r = await getResaleRequest(g.shop.id, id);
  if (!r) return plainEphemeral("신청을 찾을 수 없어요.");
  if (r.status !== "pending") return plainEphemeral("이미 처리된 신청이에요.");
  return showModal({
    customId: cid(shopSlug, "px_nom", id),
    title: `거절 · ${r.ign}`.slice(0, 45),
    inputs: [textInput({ customId: "reason", label: "거절 사유 (신청자에게 DM 으로 감)", style: 2, required: false, maxLength: 300 })],
  });
}

export async function handleProxyRejectSubmit(shopSlug: string, id: string, adminId: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = adminGuard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const reason = modalFieldValue(interaction, "reason").trim();
  try {
    const r = await rejectResaleRequest(g.shop.id, id, reason);
    const card = adminCard(shopSlug, r, { by: adminId, text: `${plainEmoji("does_cross")} **거절됨**${reason ? ` · ${reason.slice(0, 100)}` : ""}`, color: 0xef4444 });
    return v2Update(card.components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "거절하지 못했어요.");
  }
}

/** [내 프록시 현황] → 나만 보이는 이미지 */
export async function handleProxyMine(shopSlug: string, discordUser: { id: string; name: string; avatar: string | null }) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordUser.id);
  const mine = user ? (await listResaleRequests(shop.id)).filter((r) => r.userId === user.id) : [];
  const approved = mine.filter((r) => r.status === "approved");
  const sold = soldProductIds(shop.id, new Set(approved.map((r) => r.productId).filter((x): x is string => Boolean(x))));
  const rows = mine.slice(0, 6).map((r) => ({ ign: r.ign, price: r.price, payout: r.payout || resalePayout(r.price, r.feePercent), status: rowStatus(r, sold) }));
  const totals = {
    selling: rows.filter((x) => x.status === "selling").length,
    sold: mine.filter((r) => rowStatus(r, sold) === "sold").length,
    payoutDue: mine.filter((r) => rowStatus(r, sold) === "sold").reduce((n, r) => n + r.payout, 0),
  };
  const image = await signedImage(shop.id, { kind: "proxy_status", name: discordUser.name.slice(0, 20), avatar: discordUser.avatar, rows, totals });
  const STATUS_KO: Record<string, string> = { pending: "검토 중", selling: "판매 중", sold: "판매 완료", rejected: "반려", cancelled: "취소" };
  return v2Ephemeral([
    container(
      [
        ...(image ? [mediaGallery([image])] : []),
        ...(image
          ? []
          : [
              textDisplay(`## 내 도스마켓 판매`),
              textDisplay(rows.length ? rows.map((x) => `· ${x.ign} — ${won(x.price)} · ${STATUS_KO[x.status] ?? x.status}`).join("\n") : "아직 등록한 판매가 없어요."),
            ]),
        textDisplay(user ? "-# 이 메시지는 나에게만 보여요" : "-# 사이트 계정이 연결돼 있지 않아요 · 사이트에서 디스코드로 로그인해 주세요"),
      ],
      0x6366f1,
    ),
  ]);
}

export { resaleShownName };
