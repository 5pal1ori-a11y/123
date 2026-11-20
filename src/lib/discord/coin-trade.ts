/**
 * /코인대행 — 포인트로 LTC · USDT(TRC20) 구매 → 관리자 승인 → 손님 지갑으로 송금.
 *
 * 패널: [LTC 구매] [USDT 구매] [내 주문]
 * 구매 → 모달(금액 · 지갑 주소) → 나만 보이는 견적(실시간 시세 + 수수료, 90초 유효) → [확정] 포인트 차감
 * → 관리자 채널 카드 [송금] [거절]
 *   송금 → 모달: TXID 를 적으면 직접 보낸 것으로 처리, 비우면 NOWPayments 중계 서버로 자동 송금
 *   거절 · 송금 실패 → 포인트 자동 환불 · 손님 DM
 */
import { appEmoji, loadSavedEmojis, plainEmoji } from "@/lib/discord/app-emojis";
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
  stringSelect,
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
  beginCoinAutoSend,
  cancelCoinQuote,
  COIN_FEE_PERCENT,
  COIN_MAX_KRW,
  COIN_MIN_KRW,
  COINS,
  coinRelayConfig,
  coinPayoutMode,
  coinWalletKrw,
  coinWalletBalances,
  fetchKrwRate,
  coinStats,
  confirmCoinOrder,
  createCoinQuote,
  finishCoinAutoSend,
  formatCoin,
  getCoinOrder,
  getVipFeePercent,
  getVipName,
  getVipTier,
  listCoinOrders,
  markCoinOrderSentManually,
  rejectCoinOrder,
  requestRelayPayout,
  setCoinAdminCard,
  updateCoinOrder,
  VIP_TIERS,
  SENDABLE_COINS,
  isSendableCoin,
  type CoinKey,
  type CoinOrder,
} from "@/lib/coin-trade";
import { getShopById, getShopBySlug, getShopSettings, getUserByDiscordId, persistAsync, updateShopSettings } from "@/lib/store";

const won = (n: number) => `${Math.max(0, Math.round(n)).toLocaleString("ko-KR")}원`;
const slugOf = (shopId: string) => getShopById(shopId)?.slug ?? null;

/** 이미지에 쓰는 한국 시각 (11.20 17:12) */
function kstTime() {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date())
    .replace(/\s/g, "")
    .replace(/\.(?=\d{2}:)/, " ")
    .replace(/\.$/, "");
}
const coinNum = (n: number, coin: CoinKey) => n.toLocaleString("en-US", { maximumFractionDigits: COINS[coin].decimals > 6 ? 6 : COINS[coin].decimals });
const coinIcon = (coin: CoinKey) => `https://doesmc.xyz/emoji/does_${coin}.png`;

/** 서명 데이터 이미지 주소 (이미지 워커가 없으면 null) */
async function coinImageUrl(shopSlug: string, data: { kind: string } & Record<string, unknown>) {
  try {
    const { hasRankImage, signedDataImageUrl } = await import("@/lib/discord/rank-image");
    if (!(await hasRankImage())) return null;
    return await signedDataImageUrl(shopSlug, data);
  } catch {
    return null;
  }
}

/** 디스코드 회원 이름 · 프로필 사진 */
async function discordPerson(shopId: string, discordId: string | null) {
  if (!discordId) return { name: "회원", avatar: null as string | null };
  try {
    const [{ resolveNames }, { MFA_DISCORD_GUILD_ID }] = await Promise.all([import("@/lib/discord/rank-image"), import("@/lib/store")]);
    const guildId = getShopSettings(shopId).discordGuildId || MFA_DISCORD_GUILD_ID;
    const who = (await resolveNames(guildId, [discordId]))[discordId];
    return { name: who?.name ?? "회원", avatar: who?.avatar ?? null };
  } catch {
    return { name: "회원", avatar: null as string | null };
  }
}

/** 이미지 한 장짜리 로그 메시지를 채널에 올린다 (이미지 실패 시 글로 대신) */
async function postImageLog(shopId: string, channelId: string, url: string | null, caption: string, fallback: string[], color: number) {
  const kids: unknown[] = url ? [mediaGallery([url]), textDisplay(caption)] : [...fallback.map((t) => textDisplay(t)), textDisplay(caption)];
  await postChannelMessage(channelId, { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, color)], allowed_mentions: { parse: [] as string[] } }, shopId).catch(() => null);
}

const ACCENT = 0x22c55e;
const isCoin = isSendableCoin;
/** 코인별 서버 이모지 */
const COIN_EMOJI: Partial<Record<CoinKey, "does_ltc" | "does_trx">> = { ltc: "does_ltc", trx: "does_trx" };

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

function linkButton(url: string, label: string) {
  return { type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url };
}

function shortAddr(a: string) {
  return a.length > 20 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

const STATUS_KO: Record<string, string> = {
  quote: "견적",
  pending: "승인 대기",
  sending: "송금 중",
  sent: "송금 완료",
  failed: "송금 실패 · 환불",
  rejected: "거절 · 환불",
  cancelled: "취소",
  expired: "견적 만료",
};

/* ───────────── 패널 ───────────── */

/** 김치 프리미엄 — 여러 해외 시세 · 환율 출처를 차례로 시도 (5분 캐시) */
async function kimchiPremium(): Promise<number | null> {
  const { kimchiPremiumInfo } = await import("@/lib/coin-trade");
  return (await kimchiPremiumInfo()).premium;
}

/** 패널 이미지 — 지갑 재고 · 김프 · 누적 이용금액 (전용 coin_panel 템플릿) */
async function coinStatsImageUrl(shopId: string, shopSlug: string) {
  try {
    const { hasRankImage, signedDataImageUrl } = await import("@/lib/discord/rank-image");
    if (!(await hasRankImage())) return null;
    const [s, prem, wallet] = await Promise.all([coinStats(shopId), kimchiPremium(), coinWalletKrw().catch(() => null)]);
    const time = kstTime();
    return await signedDataImageUrl(shopSlug, {
      kind: "coin_panel",
      wallet: wallet === null ? null : Math.floor(wallet),
      premium: prem === null ? null : Math.round(prem * 100) / 100,
      volume: s.volume,
      orders: s.orders,
      coins: SENDABLE_COINS.map((c) => ({ sym: c.toUpperCase(), icon: `https://doesmc.xyz/emoji/does_${c}.png` })),
      time,
    });
  } catch {
    return null;
  }
}

async function panelMessage(shopId: string, shopSlug: string) {
  await loadSavedEmojis().catch(() => null);
  const s = await coinStats(shopId);
  const statsImg = await coinStatsImageUrl(shopId, shopSlug);
  const coinLine = SENDABLE_COINS.map((c) => `${COIN_EMOJI[c] ? appEmoji(COIN_EMOJI[c]!) : ""} **${c.toUpperCase()}**`).join("  ·  ");
  const kids: unknown[] = [
    textDisplay(`## ${appEmoji("does_coin")} 코인대행\n${coinLine}  송금 가능`),
    ...(statsImg
      ? [mediaGallery([statsImg])]
      : [textDisplay(`> 누적 **${s.orders.toLocaleString("ko-KR")}건** 송금 · 누적 **${won(s.volume)}**`)]),
    textDisplay(`-# ${appEmoji("does_lightning")} 결제하면 자동 송금 · 수수료 1~3% (VIP 할인) · 한 번에 ${won(COIN_MIN_KRW)} ~ ${won(COIN_MAX_KRW)}`),
    actionRow(
      styledButton(cid(shopSlug, "cn_choose"), "코인 구매하기", ButtonStyle.SUCCESS, appEmoji("does_coin")),
      styledButton(cid(shopSlug, "cn_mine"), "내 주문", ButtonStyle.SECONDARY, appEmoji("does_chart")),
      styledButton(cid(shopSlug, "cn_vip"), "VIP 혜택", ButtonStyle.SECONDARY, appEmoji("does_gem")),
    ),
    actionRow(
      linkButton(shopUrl(shopSlug, "/coin-calculator"), "계산기"),
      linkButton(shopUrl(shopSlug, "/coin-trade"), "웹에서 구매"),
    ),
  ];
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, ACCENT)], allowed_mentions: { parse: [] as string[] } };
}

/** /코인대행 (관리자) — 패널을 이 채널에 올린다 */
export async function handleCoinCommand(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  channelId: string | undefined,
  adminChannelId: string | null,
  logChannels: { log: string | null; restock: string | null; review: string | null } = { log: null, restock: null, review: null },
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) return errorPanel("코인대행 패널은 관리자만 올릴 수 있어요.", "권한 없음");
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const adminCh = adminChannelId || settings.coinAdminChannelId || null;
  if (!adminCh) return errorPanel("주문을 받을 관리자 채널을 `승인채널` 옵션으로 한 번 지정해 주세요.");

  const posted = await postChannelMessage(channelId, await panelMessage(shop.id, shop.slug), shop.id);
  const messageId = (posted.json as { id?: string } | null)?.id;
  if (!posted.ok || !messageId) return errorPanel("패널을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  updateShopSettings(shop.id, {
    coinAdminChannelId: adminCh,
    coinPanel: { channelId, messageId },
    ...(logChannels.log ? { coinLogChannelId: logChannels.log } : {}),
    ...(logChannels.restock ? { coinRestockChannelId: logChannels.restock } : {}),
    ...(logChannels.review ? { coinReviewChannelId: logChannels.review } : {}),
  });
  await persistAsync();
  const relay = await coinRelayConfig();
  const after = getShopSettings(shop.id);
  return plainEphemeral(
    [
      `코인대행 패널을 올렸어요. 주문 카드는 <#${adminCh}> 채널로 갑니다.`,
      `대행로그: ${after.coinLogChannelId ? `<#${after.coinLogChannelId}>` : "미지정 (충전로그 채널 사용)"} · 입고로그: ${after.coinRestockChannelId ? `<#${after.coinRestockChannelId}>` : "미지정"} · 후기: ${after.coinReviewChannelId ? `<#${after.coinReviewChannelId}>` : "미지정 (후기로그 채널 사용)"}`,
      relay ? "자동 송금: 중계 서버 연결됨" : `자동 송금: ${(await coinPayoutMode()) === "direct" ? "NOWPayments 직접 연결됨" : "미설정 → 관리자가 직접 보내고 TXID 를 적어요"}`,
    ].join("\n"),
  );
}

export async function refreshCoinPanel(shopId: string) {
  const at = getShopSettings(shopId).coinPanel;
  const slug = getShopById(shopId)?.slug;
  if (!at || !slug) return;
  const body = await panelMessage(shopId, slug);
  const r = await discordRest("PATCH", `/channels/${at.channelId}/messages/${at.messageId}`, { components: body.components, flags: body.flags }, shopId);
  if (r.status === 404) {
    updateShopSettings(shopId, { coinPanel: null });
    await persistAsync();
  }
}

/* ───────────── 손님: 구매 ───────────── */

export function handleCoinBuyButton(shopSlug: string, coin: string) {
  if (!isCoin(coin)) return plainEphemeral("코인을 골라 주세요.");
  const c = COINS[coin];
  return showModal({
    customId: cid(shopSlug, "cn_modal", coin),
    title: `${coin.toUpperCase()} 구매 · ${c.network}`.slice(0, 45),
    inputs: [
      textInput({
        customId: "krw",
        label: `사용할 포인트 (${COIN_MIN_KRW.toLocaleString("ko-KR")} ~ ${COIN_MAX_KRW.toLocaleString("ko-KR")})`,
        placeholder: "예: 50000",
        required: true,
        maxLength: 9,
      }),
      textInput({
        customId: "addr",
        label: `받을 지갑 주소 (${c.network})`,
        placeholder: c.addressHint,
        required: true,
        minLength: 26,
        maxLength: 100,
      }),
    ],
  });
}

function quoteView(shopSlug: string, o: CoinOrder, balance: number | null) {
  const c = COINS[o.coin];
  const expires = Math.floor(Date.parse(o.quoteExpiresAt) / 1000);
  return [
    container(
      [
        textDisplay(`## ${plainEmoji("does_coin")} ${o.coin.toUpperCase()} 구매 견적`),
        textDisplay(
          [
            `**받는 수량** ${formatCoin(o.coin, o.coinAmount)}`,
            `**사용 포인트** ${o.krw.toLocaleString("ko-KR")}P${balance !== null ? ` · 보유 ${balance.toLocaleString("ko-KR")}P` : ""}`,
            `**시세** 1 ${o.coin.toUpperCase()} = ${won(o.rate)} (${o.rateSource}) · 수수료 ${o.feePercent}%`,
            `**네트워크** ${c.network}`,
            `**받는 주소** \`${o.address}\``,
          ].join("\n"),
        ),
        textDisplay(`-# 견적은 <t:${expires}:R> 까지 유효해요 · 주소 · 네트워크가 맞는지 꼭 확인하세요 (잘못 보낸 코인은 되찾을 수 없어요)`),
        separator(true, 1),
        actionRow(
          styledButton(cid(shopSlug, "cn_ok", o.id), "확정하고 포인트 결제", ButtonStyle.SUCCESS, appEmoji("does_check")),
          styledButton(cid(shopSlug, "cn_cancel", o.id), "취소", ButtonStyle.SECONDARY),
        ),
      ],
      ACCENT,
    ),
  ];
}

export async function handleCoinBuySubmit(shopSlug: string, discordId: string, coin: string, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  if (!isCoin(coin)) return plainEphemeral("코인을 골라 주세요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) {
    return v2Ephemeral([
      container([
        textDisplay("## 먼저 사이트 계정을 연결해 주세요"),
        textDisplay("코인대행은 포인트로 결제해서 사이트 계정이 필요해요.\n사이트에서 **디스코드로 로그인**하면 자동으로 연결돼요."),
        actionRow(linkButton(shopUrl(shop.slug, "/dashboard"), "사이트에서 로그인")),
      ]),
    ]);
  }
  // 본인인증 게이트 — 켜져 있고 아직 인증 안 했으면 인증 링크 안내
  const { identityVerifyRequired, isUserVerified } = await import("@/lib/identity-verify");
  if (await identityVerifyRequired(shop.id)) {
    if (!(await isUserVerified(shop.id, user.id))) {
      return v2Ephemeral([
        container([
          textDisplay("## 🪪 먼저 본인인증이 필요해요"),
          textDisplay("안전한 거래를 위해 코인대행은 **최초 1회 본인인증**이 필요해요.\n토스 공식 인증 창에서 1분이면 끝나요."),
          actionRow(linkButton(shopUrl(shop.slug, "/verify-identity"), "토스로 본인인증 하기")),
          textDisplay("-# 인증 후 다시 구매를 눌러 주세요 · 이 메시지는 나에게만 보여요"),
        ]),
      ]);
    }
  }
  const krw = Number(modalFieldValue(interaction, "krw").replace(/[,\s원₩P]/gi, ""));
  const addr = modalFieldValue(interaction, "addr").replace(/\s/g, "");
  try {
    const o = await createCoinQuote(shop.id, { id: user.id, discordId, totalCoinSpent: user.totalCoinSpent, vipTier: user.vipTier }, coin, krw, addr);
    if (user.points < o.krw) {
      return plainEphemeral(`포인트가 부족해요. 필요 ${o.krw.toLocaleString("ko-KR")}P · 보유 ${user.points.toLocaleString("ko-KR")}P\n먼저 충전해 주세요.`);
    }
    return v2Ephemeral(quoteView(shop.slug, o, user.points));
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "견적을 만들지 못했어요.");
  }
}

function customerNotice(title: string, lines: string[], color: number) {
  return v2Update([container([textDisplay(`## ${title}`), textDisplay(lines.filter(Boolean).join("\n"))], color)]);
}

/** [확정] — 견적 메시지를 그 자리에서 바꾼다 */
export async function handleCoinConfirm(shopSlug: string, discordId: string, id: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return customerNotice("상점을 찾을 수 없어요", [], 0xef4444);
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return customerNotice("사이트 계정이 연결돼 있지 않아요", [], 0xef4444);
  let o: CoinOrder & { balance: number };
  try {
    o = await confirmCoinOrder(shop.id, id, user.id);
  } catch (e) {
    return customerNotice("주문하지 못했어요", [e instanceof Error ? e.message : "다시 시도해 주세요."], 0xef4444);
  }
  await persistAsync();
  await announceCoinOrder(shop.id, shop.slug, o);
  return customerNotice(
    `${plainEmoji("does_check")} 주문 접수 완료`,
    [
      `**${formatCoin(o.coin, o.coinAmount)}** → \`${shortAddr(o.address)}\``,
      `**결제** ${o.krw.toLocaleString("ko-KR")}P · 남은 포인트 ${o.balance.toLocaleString("ko-KR")}P`,
      `-# 주문 ${o.id} · 관리자가 확인하면 송금하고 DM 으로 알려 드려요`,
    ],
    ACCENT,
  );
}

/** 주문 확정 후 관리자 채널에 승인 카드를 올리고 패널을 갱신한다 (디스코드·웹 공용) */
export async function announceCoinOrder(shopId: string, shopSlug: string, o: CoinOrder) {
  const adminCh = getShopSettings(shopId).coinAdminChannelId;
  if (adminCh) {
    const posted = await postChannelMessage(adminCh, await adminCard(shopSlug, o), shopId).catch(() => null);
    const messageId = (posted?.json as { id?: string } | null)?.id;
    if (messageId) await setCoinAdminCard(shopId, o.id, { channelId: adminCh, messageId }).catch(() => null);
  }
  void refreshCoinPanel(shopId);
}

export async function handleCoinCancel(shopSlug: string, discordId: string, id: string) {
  const shop = getShopBySlug(shopSlug);
  const user = shop ? getUserByDiscordId(shop.id, discordId) : null;
  if (!shop || !user) return customerNotice("주문을 찾을 수 없어요", [], 0xef4444);
  try {
    await cancelCoinQuote(shop.id, id, user.id);
    return customerNotice("주문을 취소했어요", ["-# 포인트는 빠지지 않았어요"], 0x64748b);
  } catch (e) {
    return customerNotice("취소하지 못했어요", [e instanceof Error ? e.message : ""], 0xef4444);
  }
}

export async function handleCoinMine(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  const mine = user ? (await listCoinOrders(shop.id)).filter((o) => o.userId === user.id && o.status !== "quote" && o.status !== "cancelled" && o.status !== "expired").slice(0, 8) : [];
  const lines = mine.map((o) => {
    const when = `<t:${Math.floor(Date.parse(o.createdAt) / 1000)}:d>`;
    const tx = o.txid ? ` · [TX](${COINS[o.coin].explorer(o.txid)})` : "";
    return `· ${when} **${formatCoin(o.coin, o.coinAmount)}** (${o.krw.toLocaleString("ko-KR")}P) — ${STATUS_KO[o.status] ?? o.status}${tx}`;
  });
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${plainEmoji("does_chart")} 내 코인대행 주문`),
        textDisplay(lines.length ? lines.join("\n") : user ? "아직 주문이 없어요." : "사이트 계정이 연결돼 있지 않아요 · 사이트에서 디스코드로 로그인해 주세요"),
        textDisplay("-# 이 메시지는 나에게만 보여요"),
      ],
      ACCENT,
    ),
  ]);
}

export async function handleCoinChooseButton(shopSlug: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  // 떠 있던 인스턴스가 새로 올린 서버 이모지를 모를 수 있어 목록을 다시 읽는다
  await loadSavedEmojis().catch(() => null);
  const options = SENDABLE_COINS.map((k) => ({
    label: `${k.toUpperCase()} · ${COINS[k].name.replace(/\s*\(.*\)$/, "")}`,
    value: k,
    description: `${COINS[k].network} 네트워크 · ${COINS[k].addressHint}`,
    ...(COIN_EMOJI[k] ? { emoji: appEmoji(COIN_EMOJI[k]!) } : {}),
  }));
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${plainEmoji("does_coin")} 어떤 코인을 받을까요?`),
        textDisplay("아래에서 코인을 고르면 금액 · 지갑 주소 입력 창이 열려요."),
        actionRow(stringSelect({ customId: cid(shopSlug, "cn_pick"), placeholder: "받을 코인 선택", options })),
        textDisplay(`-# ${plainEmoji("does_warning")} 네트워크가 다른 주소로 보내면 되찾을 수 없어요 · 이 메시지는 나에게만 보여요`),
      ],
      ACCENT,
    ),
  ]);
}

export async function handleCoinVipButton(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  const vipTier = user?.vipTier ?? getVipTier(user?.totalCoinSpent ?? 0);
  const currentTier = VIP_TIERS.find((v) => v.tier === vipTier) || VIP_TIERS[0];
  const nextTier = VIP_TIERS[vipTier + 1];
  const spent = user?.totalCoinSpent ?? 0;
  const remaining = nextTier ? Math.max(0, nextTier.minSpent - spent) : 0;
  const lines: string[] = [
    `**현재 등급**: ${currentTier.name} (수수료 ${currentTier.feePercent}%)`,
    `**누적 사용액**: ${won(spent)}`,
  ];
  if (nextTier) {
    lines.push(`**다음 등급**: ${nextTier.name} (수수료 ${nextTier.feePercent}%)`);
    lines.push(`**남은 금액**: ${won(remaining)}`);
  } else {
    lines.push("**최고 등급에 도달했어요!**");
  }
  lines.push("");
  lines.push("**VIP 등급표**");
  for (const v of VIP_TIERS) {
    const mark = v.tier === vipTier ? "✓ " : "  ";
    lines.push(`${mark}${v.name.padEnd(8)} · ${won(v.minSpent)} 이상 · ${v.feePercent}% 수수료`);
  }
  return v2Ephemeral([
    container(
      [
        textDisplay(`## ${plainEmoji("does_coin")} VIP 등급 · 혜택`),
        textDisplay(lines.join("\n")),
        textDisplay("-# 누적 지출액에 따라 자동 등급업됩니다 · 이 메시지는 나에게만 보여요"),
      ],
      ACCENT,
    ),
  ]);
}

/* ───────────── 관리자 카드 ───────────── */

async function adminCard(shopSlug: string, o: CoinOrder, note?: string) {
  const c = COINS[o.coin];
  const mode = await coinPayoutMode();
  const auto = mode !== "manual";
  const done = o.status !== "pending";
  const color =
    o.status === "sent" ? 0x22c55e : o.status === "sending" ? 0x38bdf8 : o.status === "pending" ? 0xfacc15 : o.status === "failed" || o.status === "rejected" ? 0xef4444 : 0x64748b;
  const kids: unknown[] = [
    textDisplay(`## ${plainEmoji("does_coin")} 코인대행 주문 · ${STATUS_KO[o.status] ?? o.status}`),
    textDisplay(
      [
        `**주문자** ${o.discordId ? `<@${o.discordId}>` : o.userId}`,
        `**보낼 코인** ${formatCoin(o.coin, o.coinAmount)} · ${c.network}`,
        `**받는 주소** \`${o.address}\``,
        `**결제** ${won(o.krw)} · 시세 ${won(o.rate)} (${o.rateSource}) · 수수료 ${o.feePercent}%`,
      ].join("\n"),
    ),
  ];
  if (o.txid) kids.push(textDisplay(`**TXID** [${shortAddr(o.txid)}](${c.explorer(o.txid)})`));
  if (o.failReason) kids.push(textDisplay(`**사유** ${o.failReason.slice(0, 300)}`));
  if (o.reviewedBy) kids.push(textDisplay(`-# 처리 <@${o.reviewedBy}>${o.reviewedAt ? ` · <t:${Math.floor(Date.parse(o.reviewedAt) / 1000)}:R>` : ""}`));
  if (note) kids.push(textDisplay(`> ${note}`));
  kids.push(separator(true, 1));
  if (!done) {
    kids.push(
      actionRow(
        styledButton(cid(shopSlug, "cn_send", o.id), auto ? "송금 (자동)" : "송금 완료 처리", ButtonStyle.SUCCESS),
        styledButton(cid(shopSlug, "cn_rej", o.id), "거절 · 환불", ButtonStyle.DANGER),
      ),
    );
  } else if (o.status === "sending" && o.payoutId && mode === "direct") {
    kids.push(actionRow(styledButton(cid(shopSlug, "cn_chk", o.id), "상태 확인", ButtonStyle.SECONDARY, appEmoji("does_chart"))));
  }
  kids.push(textDisplay(`-# 주문 ${o.id}${!done ? (auto ? " · 송금을 누르면 바로 보내요 (TXID 를 적으면 직접 보낸 것으로 처리)" : " · 직접 보낸 뒤 TXID 를 적어 주세요") : ""}`));
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, color)], allowed_mentions: { parse: [] as string[] } };
}

function adminGuard(shopSlug: string, roles: string[], permissions: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return { error: plainEphemeral("상점을 찾을 수 없어요.") };
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return { error: plainEphemeral("관리자만 처리할 수 있어요.") };
  return { shop };
}

export async function handleCoinSendButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = adminGuard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const o = await getCoinOrder(g.shop.id, id);
  if (!o) return plainEphemeral("주문을 찾을 수 없어요.");
  if (o.status !== "pending") return plainEphemeral("이미 처리된 주문이에요.");
  const mode = await coinPayoutMode();
  const auto = mode !== "manual";
  return showModal({
    customId: cid(shopSlug, "cn_sendm", id),
    title: `송금 · ${formatCoin(o.coin, o.coinAmount)}`.slice(0, 45),
    inputs: [
      textInput({
        customId: "txid",
        label: auto ? "TXID (비우면 자동 송금)" : "TXID (직접 보낸 거래 해시)",
        placeholder: auto ? "자동 송금이면 비워 두세요" : "블록 탐색기의 거래 해시",
        required: !auto,
        minLength: auto ? 0 : 20,
        maxLength: 120,
      }),
    ],
  });
}

function callbackUrl(shopSlug: string) {
  return `${shopUrl(shopSlug, "/api/webhooks/coin-relay").replace(/\/$/, "")}?shop=${encodeURIComponent(shopSlug)}`;
}

/** 송금 모달 제출 — 관리자 카드를 그 자리에서 바꾼다 (오류도 카드 안에 적는다) */
export async function handleCoinSendSubmit(shopSlug: string, id: string, adminId: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  const current = shop ? await getCoinOrder(shop.id, id) : null;
  if (!shop || !current) return v2Update([container([textDisplay("주문을 찾을 수 없어요.")], 0xef4444)]);
  const show = async (o: CoinOrder, note?: string) => v2Update((await adminCard(shopSlug, o, note)).components);
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return show(current, "관리자만 처리할 수 있어요.");

  const txid = modalFieldValue(interaction, "txid").trim();
  if (txid) {
    if (!/^[0-9a-zA-Z]{20,120}$/.test(txid)) return show(current, "TXID 형식이 아니에요. 거래 해시를 그대로 붙여 넣어 주세요.");
    try {
      const o = await markCoinOrderSentManually(shop.id, id, adminId, txid);
      await notifySent(o);
      void refreshCoinPanel(shop.id);
      return show(o);
    } catch (e) {
      return show(current, e instanceof Error ? e.message : "처리하지 못했어요.");
    }
  }

  const mode = await coinPayoutMode();
  if (mode === "manual") return show(current, "자동 송금이 설정돼 있지 않아서 TXID 를 꼭 적어야 해요.");

  let o: CoinOrder;
  try {
    o = await beginCoinAutoSend(shop.id, id, adminId);
  } catch (e) {
    return show(current, e instanceof Error ? e.message : "처리하지 못했어요.");
  }

  // 릴레이 방식 — 중계 서버가 송금 생성·2FA·상태추적까지 하고 callback 으로 알려 준다
  if (mode === "relay") {
    try {
      const r = await requestRelayPayout(o, callbackUrl(shop.slug));
      if (r.payoutId) {
        const { order } = await finishCoinAutoSendPayoutId(shop.id, id, r.payoutId);
        o = order;
      }
      return show(o, "NOWPayments 송금 요청 완료 · 블록체인 전송이 끝나면 이 카드가 바뀌고 손님에게 DM 이 가요");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "송금 요청 실패";
      const { order } = await finishCoinAutoSend(shop.id, id, { ok: false, error: msg });
      await persistAsync();
      await notifyFailed(order);
      return show(order, "송금 요청이 실패해서 손님 포인트를 돌려줬어요.");
    }
  }

  // 직접 방식 — Worker 가 NOWPayments 송금을 바로 생성·2FA 확인. 상태는 "상태 확인"으로 다시 본다
  try {
    const { createPayoutDirect, checkPayoutStatus } = await import("@/lib/coin-payout-direct");
    const payoutId = await createPayoutDirect({ currency: COINS[o.coin].npCode, amount: o.coinAmount, address: o.address });
    ({ order: o } = await finishCoinAutoSendPayoutId(shop.id, id, payoutId));
    // 즉시 완료되는 경우가 있어 한 번 상태를 본다
    const st = await checkPayoutStatus(payoutId).catch(() => null);
    if (st?.final === "ok") {
      const { order } = await finishCoinAutoSend(shop.id, id, { ok: true, txid: st.txid, payoutId });
      await persistAsync();
      await notifySent(order);
      void refreshCoinPanel(shop.id);
      return show(order);
    }
    if (st?.final === "fail") {
      const { order } = await finishCoinAutoSend(shop.id, id, { ok: false, error: `NOWPayments ${st.status}${st.error ? ` · ${st.error}` : ""}`, payoutId });
      await persistAsync();
      await notifyFailed(order);
      return show(order, "송금이 실패해서 손님 포인트를 돌려줬어요.");
    }
    return show(o, "자동 송금 요청 완료 · 전송 중이에요. 잠시 뒤 [상태 확인]을 눌러 결과를 확인하세요.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "송금 요청 실패";
    const { order } = await finishCoinAutoSend(shop.id, id, { ok: false, error: msg });
    await persistAsync();
    await notifyFailed(order);
    return show(order, "송금 요청이 실패해서 손님 포인트를 돌려줬어요.");
  }
}

/**
 * 자동송금 실행 (승인 없이) — 웹/디스코드 공용.
 * relay 또는 direct 가 설정돼 있으면 바로 송금하고 결과 상태를 담은 주문을 돌려준다.
 * manual 이면 pending 그대로 둔다.
 */
export async function autoSendAndNotify(shopId: string, shopSlug: string, orderId: string): Promise<CoinOrder> {
  const mode = await coinPayoutMode();
  const cur = await getCoinOrder(shopId, orderId);
  if (!cur) throw new Error("주문을 찾을 수 없어요.");
  if (mode === "manual" || cur.status !== "pending") return cur;

  const patchAdminCard = async (order: CoinOrder, note?: string) => {
    if (!order.adminCard) return;
    const card = await adminCard(shopSlug, order, note);
    await discordRest("PATCH", `/channels/${order.adminCard.channelId}/messages/${order.adminCard.messageId}`, { components: card.components, flags: card.flags }, shopId).catch(() => null);
  };

  let o: CoinOrder;
  try {
    o = await beginCoinAutoSend(shopId, orderId, "auto");
  } catch {
    return (await getCoinOrder(shopId, orderId)) ?? cur;
  }

  const fail = async (msg: string, payoutId?: string | null) => {
    const { order } = await finishCoinAutoSend(shopId, orderId, { ok: false, error: msg, payoutId: payoutId ?? null });
    await persistAsync();
    await notifyFailed(order);
    await patchAdminCard(order);
    return order;
  };

  if (mode === "relay") {
    try {
      const r = await requestRelayPayout(o, callbackUrl(shopSlug));
      if (r.payoutId) ({ order: o } = await finishCoinAutoSendPayoutId(shopId, orderId, r.payoutId));
      await patchAdminCard(o, "자동 송금 요청됨 · 전송 완료되면 알림");
      return o;
    } catch (e) {
      return fail(e instanceof Error ? e.message : "송금 요청 실패");
    }
  }

  // direct
  try {
    const { createPayoutDirect, checkPayoutStatus } = await import("@/lib/coin-payout-direct");
    const payoutId = await createPayoutDirect({ currency: COINS[o.coin].npCode, amount: o.coinAmount, address: o.address });
    ({ order: o } = await finishCoinAutoSendPayoutId(shopId, orderId, payoutId));
    const st = await checkPayoutStatus(payoutId).catch(() => null);
    if (st?.final === "ok") {
      const { order } = await finishCoinAutoSend(shopId, orderId, { ok: true, txid: st.txid, payoutId });
      await persistAsync();
      await notifySent(order);
      void refreshCoinPanel(shopId);
      await patchAdminCard(order);
      return order;
    }
    if (st?.final === "fail") return fail(`NOWPayments ${st.status}${st.error ? ` · ${st.error}` : ""}`, payoutId);
    await patchAdminCard(o, "자동 송금 중 · 전송 완료되면 알림");
    return o;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "송금 요청 실패");
  }
}

/** [상태 확인] — direct 방식에서 sending 상태의 송금 결과를 다시 조회 */
export async function handleCoinCheckButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  const current = shop ? await getCoinOrder(shop.id, id) : null;
  if (!shop || !current) return plainEphemeral("주문을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return plainEphemeral("관리자만 확인할 수 있어요.");
  if (current.status !== "sending" || !current.payoutId) {
    return v2Update((await adminCard(shopSlug, current)).components);
  }
  try {
    const { checkPayoutStatus } = await import("@/lib/coin-payout-direct");
    const st = await checkPayoutStatus(current.payoutId);
    if (st.final === "ok") {
      const { order } = await finishCoinAutoSend(shop.id, id, { ok: true, txid: st.txid, payoutId: current.payoutId });
      await persistAsync();
      await notifySent(order);
      void refreshCoinPanel(shop.id);
      return v2Update((await adminCard(shopSlug, order)).components);
    }
    if (st.final === "fail") {
      const { order } = await finishCoinAutoSend(shop.id, id, { ok: false, error: `NOWPayments ${st.status}${st.error ? ` · ${st.error}` : ""}`, payoutId: current.payoutId });
      await persistAsync();
      await notifyFailed(order);
      return v2Update((await adminCard(shopSlug, order)).components);
    }
    return v2Update((await adminCard(shopSlug, current, `아직 전송 중이에요 (상태: ${st.status || "대기"}). 잠시 뒤 다시 확인해 주세요.`)).components);
  } catch (e) {
    return v2Update((await adminCard(shopSlug, current, e instanceof Error ? e.message : "상태를 확인하지 못했어요.")).components);
  }
}

async function finishCoinAutoSendPayoutId(shopId: string, id: string, payoutId: string) {
  const order = await updateCoinOrder(shopId, id, (x) => {
    x.payoutId = payoutId;
  });
  return { order };
}

export async function handleCoinRejectButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = adminGuard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const o = await getCoinOrder(g.shop.id, id);
  if (!o) return plainEphemeral("주문을 찾을 수 없어요.");
  if (o.status !== "pending") return plainEphemeral("이미 처리된 주문이에요.");
  return showModal({
    customId: cid(shopSlug, "cn_rejm", id),
    title: "거절 · 포인트 환불",
    inputs: [textInput({ customId: "reason", label: "거절 사유 (손님에게 DM 으로 감)", style: 2, required: false, maxLength: 300 })],
  });
}

export async function handleCoinRejectSubmit(shopSlug: string, id: string, adminId: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  const current = shop ? await getCoinOrder(shop.id, id) : null;
  if (!shop || !current) return v2Update([container([textDisplay("주문을 찾을 수 없어요.")], 0xef4444)]);
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return v2Update((await adminCard(shopSlug, current, "관리자만 처리할 수 있어요.")).components);
  try {
    const o = await rejectCoinOrder(shop.id, id, adminId, modalFieldValue(interaction, "reason").trim());
    await persistAsync();
    await notifyFailed(o);
    return v2Update((await adminCard(shopSlug, o)).components);
  } catch (e) {
    return v2Update((await adminCard(shopSlug, current, e instanceof Error ? e.message : "거절하지 못했어요.")).components);
  }
}

/* ───────────── 알림 ───────────── */

async function dm(o: CoinOrder, title: string, lines: string[], color: number, buttons: unknown[] = []) {
  if (!o.discordId) return;
  await sendDiscordDm(
    o.discordId,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container(
          [textDisplay(`## ${title}`), separator(true, 1), textDisplay(lines.filter(Boolean).join("\n")), ...(buttons.length ? [actionRow(...buttons)] : [])],
          color,
        ),
      ],
    },
    o.shopId,
  ).catch(() => null);
}

export async function notifySent(o: CoinOrder) {
  const c = COINS[o.coin];
  await dm(
    o,
    `${plainEmoji("does_check")} 코인 송금 완료`,
    [
      `**${formatCoin(o.coin, o.coinAmount)}** 을(를) 보냈어요.`,
      `**받는 주소** \`${o.address}\` · ${c.network}`,
      o.txid ? `**TXID** \`${o.txid}\`` : "",
      "-# 블록체인 확인까지 몇 분 걸릴 수 있어요",
    ],
    0x22c55e,
    [
      ...(o.txid ? [linkButton(c.explorer(o.txid), "거래 확인하기")] : []),
      ...(slugOf(o.shopId) ? [styledButton(cid(slugOf(o.shopId)!, "cn_rev", o.id), "후기 남기기", ButtonStyle.SECONDARY, appEmoji("does_star"))] : []),
    ],
  );
  void postCoinSentLog(o);
}

/** 대행로그 — 송금 완료를 이미지 한 장으로 (대행로그 채널 → 없으면 충전로그 · 승인 채널) */
async function postCoinSentLog(o: CoinOrder) {
  try {
    const settings = getShopSettings(o.shopId);
    const channelId = settings.coinLogChannelId || settings.discordChargeLogChannelId || settings.coinAdminChannelId;
    const slug = getShopById(o.shopId)?.slug;
    if (!channelId || !slug) return;
    const [stats, who] = await Promise.all([coinStats(o.shopId).catch(() => null), discordPerson(o.shopId, o.discordId)]);
    const tx = o.txid ? (o.txid.length > 16 ? `${o.txid.slice(0, 8)}…${o.txid.slice(-6)}` : o.txid) : null;
    const url = await coinImageUrl(slug, {
      kind: "coin_log",
      coin: o.coin,
      icon: coinIcon(o.coin),
      amount: coinNum(o.coinAmount, o.coin),
      krw: o.krw,
      rate: Math.round(o.rate),
      fee: o.feePercent,
      orders: stats?.orders ?? 0,
      name: who.name.slice(0, 24),
      avatar: who.avatar,
      txid: tx,
      time: kstTime(),
    });
    const mention = o.discordId ? `<@${o.discordId}>` : "회원";
    await postImageLog(
      o.shopId,
      channelId,
      url,
      `-# ${mention} 님에게 ${formatCoin(o.coin, o.coinAmount)} 송금 완료 · <t:${Math.floor(Date.now() / 1000)}:f>`,
      ["## 코인 송금 완료", `**${formatCoin(o.coin, o.coinAmount)}** · ${won(o.krw)} 결제`],
      0x22c55e,
    );
  } catch {
    /* 로그 실패는 무시 */
  }
}

/** 입고로그 — 지갑에 코인이 들어왔을 때 이미지 한 장 */
export async function postCoinRestockLog(shopId: string, coin: CoinKey, added: number, stock: number | null) {
  const settings = getShopSettings(shopId);
  const channelId = settings.coinRestockChannelId;
  const slug = getShopById(shopId)?.slug;
  if (!channelId || !slug) return false;
  const rate = await fetchKrwRate(coin).then((r) => r.rate).catch(() => null);
  const url = await coinImageUrl(slug, {
    kind: "coin_restock",
    coin,
    icon: coinIcon(coin),
    amount: `+${coinNum(added, coin)}`,
    krw: rate ? Math.round(added * rate) : null,
    stock: stock === null ? null : coinNum(stock, coin),
    stockKrw: rate && stock !== null ? Math.round(stock * rate) : null,
    time: kstTime(),
  });
  await postImageLog(
    shopId,
    channelId,
    url,
    `-# ${COIN_EMOJI[coin] ? appEmoji(COIN_EMOJI[coin]!) : ""} ${coin.toUpperCase()} 입고 · 지금 바로 구매할 수 있어요 · <t:${Math.floor(Date.now() / 1000)}:R>`,
    ["## 코인 입고", `**+${coinNum(added, coin)} ${coin.toUpperCase()}**${stock !== null ? ` · 현재 재고 ${coinNum(stock, coin)}` : ""}`],
    0x3b82f6,
  );
  return true;
}

/** 지갑 잔액을 주기적으로 보고, 늘어난 코인이 있으면 입고로그를 올린다 (크론) */
export async function checkCoinRestock(shopId: string) {
  if (!getShopSettings(shopId).coinRestockChannelId) return;
  const bal = await coinWalletBalances().catch(() => null);
  if (!bal) return;
  const { kvGetJson, kvPutJson } = await import("@/lib/world/kv");
  const key = `coin-stock:v1:${shopId}`;
  const prev = await kvGetJson<Partial<Record<CoinKey, number>>>(key).catch(() => null);
  await kvPutJson(key, bal).catch(() => null);
  if (!prev) return; // 처음엔 기준값만 저장
  for (const coin of SENDABLE_COINS) {
    const now = bal[coin] ?? 0;
    const before = prev[coin] ?? 0;
    const added = now - before;
    // 아주 작은 변동(수수료 반올림 등)은 무시
    if (added > 0 && added >= Math.max(10 ** -COINS[coin].decimals * 10, before * 0.001)) {
      await postCoinRestockLog(shopId, coin, added, now).catch(() => null);
    }
  }
}

/** /코인입고 (관리자) — 직접 입고 로그를 올린다 */
export async function handleCoinRestockCommand(shopSlug: string, roles: string[], permissions: string | undefined, coinRaw: unknown, amountRaw: unknown, stockRaw: unknown) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return errorPanel("관리자만 쓸 수 있어요.", "권한 없음");
  const coin = String(coinRaw ?? "");
  if (!isCoin(coin)) return errorPanel("코인은 LTC · TRX 중에서 골라 주세요.");
  const added = Number(amountRaw);
  if (!(added > 0)) return errorPanel("입고 수량을 0보다 크게 적어 주세요.");
  const stock = stockRaw === undefined || stockRaw === null || stockRaw === "" ? null : Number(stockRaw);
  if (!getShopSettings(shop.id).coinRestockChannelId) return errorPanel("입고로그 채널이 없어요. `/코인대행 입고채널:` 로 먼저 지정해 주세요.");
  const ok = await postCoinRestockLog(shop.id, coin, added, stock !== null && Number.isFinite(stock) ? stock : null);
  return plainEphemeral(ok ? `${coin.toUpperCase()} 입고로그를 올렸어요.` : "입고로그를 올리지 못했어요.");
}

/* ───────────── 후기 ───────────── */

/** 송금 완료 DM 의 [후기 남기기] → 별점 · 내용 입력 창 */
export async function handleCoinReviewButton(shopSlug: string, discordId: string, orderId: string) {
  const shop = getShopBySlug(shopSlug);
  const o = shop ? await getCoinOrder(shop.id, orderId) : null;
  if (!shop || !o || o.discordId !== discordId) return plainEphemeral("주문을 찾을 수 없어요.");
  if (o.status !== "sent") return plainEphemeral("송금이 끝난 주문만 후기를 남길 수 있어요.");
  if (o.reviewed) return plainEphemeral("이미 후기를 남긴 주문이에요. 감사합니다!");
  return showModal({
    customId: cid(shopSlug, "cn_revm", orderId),
    title: "코인대행 후기",
    inputs: [
      textInput({ customId: "rating", label: "별점 (1 ~ 5)", placeholder: "5", required: true, minLength: 1, maxLength: 1 }),
      textInput({ customId: "comment", label: "후기 내용", placeholder: "이용해 보신 느낌을 적어 주세요", style: 2, required: true, minLength: 5, maxLength: 160 }),
    ],
  });
}

export async function handleCoinReviewSubmit(shopSlug: string, discordId: string, orderId: string, interaction: DiscordInteraction) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const rating = Math.round(Number(modalFieldValue(interaction, "rating").trim()));
  if (!(rating >= 1 && rating <= 5)) return plainEphemeral("별점은 1 ~ 5 사이 숫자로 적어 주세요.");
  const comment = modalFieldValue(interaction, "comment").replace(/\s+/g, " ").trim().slice(0, 160);
  if (comment.length < 5) return plainEphemeral("후기 내용을 조금만 더 적어 주세요.");
  let o: CoinOrder;
  try {
    o = await updateCoinOrder(shop.id, orderId, (x) => {
      if (x.discordId !== discordId) throw new Error("주문을 찾을 수 없어요.");
      if (x.status !== "sent") throw new Error("송금이 끝난 주문만 후기를 남길 수 있어요.");
      if (x.reviewed) throw new Error("이미 후기를 남긴 주문이에요.");
      x.reviewed = true;
    });
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "후기를 남기지 못했어요.");
  }
  const settings = getShopSettings(shop.id);
  const channelId = settings.coinReviewChannelId || settings.discordReviewLogChannelId;
  if (channelId) {
    const who = await discordPerson(shop.id, discordId);
    const url = await coinImageUrl(shop.slug, {
      kind: "coin_review",
      coin: o.coin,
      icon: coinIcon(o.coin),
      amount: coinNum(o.coinAmount, o.coin),
      krw: o.krw,
      rating,
      comment,
      name: who.name.slice(0, 24),
      avatar: who.avatar,
      time: kstTime(),
    });
    await postImageLog(
      shop.id,
      channelId,
      url,
      `-# <@${discordId}> 님의 코인대행 후기 · <t:${Math.floor(Date.now() / 1000)}:f>`,
      ["## 코인대행 후기", `${"⭐".repeat(rating)}`, `> ${comment}`],
      0xf59e0b,
    );
  }
  return plainEphemeral("후기 감사합니다! 후기 채널에 올라갔어요.");
}

export async function notifyFailed(o: CoinOrder) {
  await dm(
    o,
    o.status === "rejected" ? "코인대행 주문이 거절됐어요" : "코인 송금에 실패했어요",
    [
      `**주문** ${formatCoin(o.coin, o.coinAmount)} · ${o.krw.toLocaleString("ko-KR")}P`,
      o.failReason ? `**사유** ${o.failReason.slice(0, 200)}` : "",
      o.refunded ? `**${o.krw.toLocaleString("ko-KR")}P** 를 돌려드렸어요.` : "포인트 환불은 관리자가 확인해 드려요.",
    ],
    0xef4444,
  );
}

/** 중계 서버가 송금 결과를 알려 줄 때 — 관리자 카드 · 손님 DM · 패널 갱신 */
export async function applyRelayResult(
  shopId: string,
  orderId: string,
  result: { ok: true; txid: string | null; payoutId: string | null } | { ok: false; error: string; payoutId?: string | null },
) {
  const { order, changed } = await finishCoinAutoSend(shopId, orderId, result);
  if (!changed) return order;
  await persistAsync();
  const slug = getShopById(shopId)?.slug;
  if (slug && order.adminCard) {
    const card = await adminCard(slug, order);
    await discordRest("PATCH", `/channels/${order.adminCard.channelId}/messages/${order.adminCard.messageId}`, { components: card.components, flags: card.flags }, shopId).catch(() => null);
  }
  if (order.status === "sent") await notifySent(order);
  else await notifyFailed(order);
  void refreshCoinPanel(shopId);
  return order;
}
