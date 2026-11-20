/**
 * 도스마켓 — 회원끼리 마크 계정을 사고파는 중개(에스크로) 거래. 기존 대리판매 위에서 돈 흐름을 관리한다.
 *
 * 판매자 등록(로그인 정보 암호화) → 관리자 확인 · 승인(상품 공개, 로그인 정보는 지급 코드로) →
 * 구매자 포인트 결제 → 계정 자동 지급 → 구매자 보호 24시간(문제 신고 가능) →
 * 정산: 포인트면 자동 지급 · 계좌면 관리자 카드 [정산 완료] → 판매자 DM
 */
import { encryptSecret, decryptSecret } from "@/lib/verify-bot/crypto";
import { DOSMARKET_HOLD_HOURS, type ResaleRequest } from "@/lib/resale-shared";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 판매자가 웹에서 낸 로그인 정보 · 정산 방법을 신청 건에 붙인다 */
export async function attachSellerInfo(
  shopId: string,
  id: string,
  info: { cred?: { email: string; password: string; extra?: string } | null; payoutMethod: "points" | "bank"; payoutAccount?: string | null },
) {
  const { updateResaleRequest } = await import("@/lib/resale");
  return updateResaleRequest(shopId, id, (r) => {
    if (info.cred?.email && info.cred.password) {
      r.credEnc = encryptSecret(JSON.stringify({ email: info.cred.email.trim().slice(0, 120), password: info.cred.password.slice(0, 200), extra: (info.cred.extra ?? "").trim().slice(0, 500) }));
      r.hasCred = true;
    }
    r.payoutMethod = info.payoutMethod;
    if (info.payoutAccount?.trim()) r.payoutAccount = info.payoutAccount.trim().slice(0, 100);
  });
}

/** 승인할 때 지급 코드로 쓸 로그인 정보 글 */
export function credentialsText(r: Pick<ResaleRequest, "credEnc">) {
  if (!r.credEnc) return "";
  const t = decryptSecret(r.credEnc);
  if (!t) return "";
  try {
    const c = JSON.parse(t) as { email: string; password: string; extra?: string };
    return [`이메일: ${c.email}`, `비밀번호: ${c.password}`, c.extra ? `추가 정보: ${c.extra}` : ""].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

export function revealSellerCred(r: Pick<ResaleRequest, "credEnc">) {
  const t = r.credEnc ? decryptSecret(r.credEnc) : null;
  try {
    return t ? (JSON.parse(t) as { email: string; password: string; extra?: string }) : null;
  } catch {
    return null;
  }
}

/** 팔린 직후 — 구매자 보호 기간 시작 */
export async function startPayoutHold(shopId: string, requestId: string) {
  const { updateResaleRequest } = await import("@/lib/resale");
  return updateResaleRequest(shopId, requestId, (r) => {
    if (r.payoutState) return;
    r.payoutState = "holding";
    r.holdUntil = new Date(Date.now() + DOSMARKET_HOLD_HOURS * 3_600_000).toISOString();
    r.payoutMethod ??= r.payoutAccount ? "bank" : "points";
  }).catch(() => null);
}

/** 구매자가 산 도스마켓 계정 (보호 기간 · 신고 가능 여부) */
export async function buyerPurchases(shopId: string, buyerId: string) {
  const [{ listResaleRequests }, { getStoreForRead }] = await Promise.all([import("@/lib/resale"), import("@/lib/store")]);
  const orders = getStoreForRead().orders.filter((o) => o.shopId === shopId && o.userId === buyerId);
  const byUuid = new Map(orders.map((o) => [o.orderUuid ?? o.id, o]));
  return (await listResaleRequests(shopId))
    .filter((r) => r.soldOrderUuid && byUuid.has(r.soldOrderUuid))
    .map((r) => ({
      id: r.id,
      name: r.showName ? r.ign : `${r.ign.slice(0, 2)}***`,
      price: r.price,
      soldAt: r.soldAt ?? null,
      holdUntil: r.holdUntil ?? null,
      state: r.payoutState ?? null,
      canReport: r.payoutState === "holding" && Boolean(r.holdUntil) && Date.parse(r.holdUntil!) > Date.now(),
      disputeReason: r.disputeReason ?? null,
    }));
}

/** 구매자 신고 — 보호 기간 안이면 정산을 멈추고 관리자에게 알린다 */
export async function reportDispute(shopId: string, buyerId: string, requestId: string, reason: string) {
  const mine = await buyerPurchases(shopId, buyerId);
  const p = mine.find((x) => x.id === requestId);
  if (!p) throw new Error("내가 산 도스마켓 계정이 아니에요.");
  if (!p.canReport) throw new Error("보호 기간(구매 후 24시간)이 지나 신고할 수 없어요. 문의로 연락해 주세요.");
  const text = reason.replace(/\s+/g, " ").trim().slice(0, 500);
  if (text.length < 5) throw new Error("어떤 문제인지 조금 더 적어 주세요.");
  const { updateResaleRequest } = await import("@/lib/resale");
  const r = await updateResaleRequest(shopId, requestId, (x) => {
    x.payoutState = "held";
    x.disputeReason = text;
  });
  await postPayoutCard(shopId, r, "구매자 신고로 정산이 보류됐어요").catch(() => null);
  return r;
}

/** 크론 — 보호 기간이 끝난 판매를 정산한다 (포인트 자동 · 계좌는 관리자 카드) */
export async function runDosMarketPayouts(shopId: string) {
  const [{ listResaleRequests, updateResaleRequest }, { changeUserPoints, persistAsync }] = await Promise.all([import("@/lib/resale"), import("@/lib/store")]);
  const due = (await listResaleRequests(shopId)).filter((r) => r.payoutState === "holding" && r.holdUntil && Date.parse(r.holdUntil) <= Date.now());
  for (const r0 of due) {
    if ((r0.payoutMethod ?? (r0.payoutAccount ? "bank" : "points")) === "points") {
      const pay = changeUserPoints(shopId, r0.userId, r0.payout, "dosmarket.payout", { requestId: r0.id, amount: r0.payout });
      if (!pay.ok) continue;
      const r = await updateResaleRequest(shopId, r0.id, (x) => {
        x.payoutState = "paid";
        x.paidAt = new Date().toISOString();
      });
      await persistAsync().catch(() => null);
      await sellerDm(shopId, r, "도스마켓 정산 완료", [`**계정** ${r.ign}`, `**정산** ${won(r.payout)} 포인트를 넣어 드렸어요.`]);
    } else {
      const r = await updateResaleRequest(shopId, r0.id, (x) => {
        x.payoutState = "ready";
      });
      await postPayoutCard(shopId, r, "구매자 보호 기간이 끝났어요 — 판매자 계좌로 송금해 주세요").catch(() => null);
    }
  }
}

/** 관리자 — 계좌 송금 완료 */
export async function adminMarkPaid(shopId: string, id: string) {
  const { updateResaleRequest } = await import("@/lib/resale");
  const r = await updateResaleRequest(shopId, id, (x) => {
    if (x.payoutState !== "ready" && x.payoutState !== "held") throw new Error("송금할 차례가 아니에요.");
    x.payoutState = "paid";
    x.paidAt = new Date().toISOString();
  });
  await sellerDm(shopId, r, "도스마켓 정산 완료", [`**계정** ${r.ign}`, `**정산** ${won(r.payout)} 을 등록하신 계좌로 보내 드렸어요.`]);
  return r;
}

/** 관리자 — 신고 보류 해제 (문제 없음 → 정산 진행) */
export async function adminRelease(shopId: string, id: string) {
  const { updateResaleRequest } = await import("@/lib/resale");
  return updateResaleRequest(shopId, id, (x) => {
    if (x.payoutState !== "held") throw new Error("보류된 건이 아니에요.");
    x.payoutState = "holding";
    x.holdUntil = new Date().toISOString();
  });
}

/** 관리자 — 구매자에게 환불 (판매자 정산 취소) */
export async function adminRefundBuyer(shopId: string, id: string) {
  const [{ updateResaleRequest, listResaleRequests }, { getStoreForRead, changeUserPoints, persistAsync }] = await Promise.all([import("@/lib/resale"), import("@/lib/store")]);
  const r0 = (await listResaleRequests(shopId)).find((x) => x.id === id);
  if (!r0 || r0.payoutState !== "held") throw new Error("신고로 보류된 건만 환불할 수 있어요.");
  const order = getStoreForRead().orders.find((o) => (o.orderUuid ?? o.id) === r0.soldOrderUuid);
  if (!order || !order.userId) throw new Error("주문이나 구매자를 찾을 수 없어요.");
  const back = changeUserPoints(shopId, order.userId, order.amount, "dosmarket.refund", { requestId: id, amount: order.amount });
  if (!back.ok) throw new Error(back.error);
  await persistAsync().catch(() => null);
  const r = await updateResaleRequest(shopId, id, (x) => {
    x.payoutState = "refunded";
  });
  await sellerDm(shopId, r, "도스마켓 거래가 환불 처리됐어요", [`**계정** ${r.ign}`, `구매자 신고가 확인돼 구매자에게 환불했어요. 정산은 진행되지 않아요.`, r.disputeReason ? `> ${r.disputeReason}` : ""]);
  return { r, refunded: order.amount };
}

/* ───────────── 디스코드 ───────────── */

async function sellerDm(shopId: string, r: ResaleRequest, title: string, lines: string[]) {
  if (!r.discordId) return;
  const [{ sendDiscordDm }, { container, textDisplay, separator, MessageFlags }] = await Promise.all([import("@/lib/discord/dm"), import("@/lib/discord/components")]);
  await sendDiscordDm(
    r.discordId,
    { flags: MessageFlags.IS_COMPONENTS_V2, components: [container([textDisplay(`## ${title}`), separator(true, 1), textDisplay(lines.filter(Boolean).join("\n"))], 0x22c55e)] },
    shopId,
  ).catch(() => null);
}

export async function payoutCardBody(shopSlug: string, r: ResaleRequest, note?: string) {
  const { container, textDisplay, actionRow, cid, ComponentType, ButtonStyle, MessageFlags } = await import("@/lib/discord/components");
  const btn = (customId: string, label: string, style: number) => ({ type: ComponentType.BUTTON, style, label, custom_id: customId.slice(0, 100) });
  const state = r.payoutState ?? "holding";
  const label = { holding: "구매자 보호 중", ready: "송금 대기", held: "신고로 보류", paid: "정산 완료", refunded: "구매자 환불" }[state];
  const kids: unknown[] = [
    textDisplay(`## 도스마켓 정산 · ${label}`),
    textDisplay(
      [
        `**판매자** ${r.discordId ? `<@${r.discordId}>` : r.userName} · 계정 \`${r.ign}\``,
        `**판매가** ${won(r.price)} · 수수료 ${r.feePercent}% → **정산 ${won(r.payout)}**`,
        `**정산 방법** ${(r.payoutMethod ?? (r.payoutAccount ? "bank" : "points")) === "points" ? "포인트 (자동)" : `계좌 · ${r.payoutAccount ?? "미등록"}`}`,
        r.disputeReason ? `**구매자 신고** ${r.disputeReason}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ];
  if (note) kids.push(textDisplay(`> ${note}`));
  if (state === "ready") kids.push(actionRow(btn(cid(shopSlug, "dm_paid", r.id), "송금했어요 · 정산 완료", ButtonStyle.SUCCESS)));
  if (state === "held") kids.push(actionRow(btn(cid(shopSlug, "dm_release", r.id), "문제 없음 · 정산 진행", ButtonStyle.PRIMARY), btn(cid(shopSlug, "dm_refund", r.id), "구매자 환불", ButtonStyle.DANGER)));
  kids.push(textDisplay(`-# 신청 ${r.id}`));
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, state === "held" ? 0xef4444 : state === "paid" ? 0x22c55e : 0xf59e0b)], allowed_mentions: { parse: [] as string[] } };
}

async function postPayoutCard(shopId: string, r: ResaleRequest, note: string) {
  const [{ getShopSettings, getShopById }, { postChannelMessage }] = await Promise.all([import("@/lib/store"), import("@/lib/discord/rest")]);
  const s = getShopSettings(shopId);
  const ch = s.proxyAdminChannelId || s.buybackAdminChannelId || s.coinAdminChannelId;
  const slug = getShopById(shopId)?.slug;
  if (!ch || !slug) return;
  const posted = await postChannelMessage(ch, await payoutCardBody(slug, r, note), shopId).catch(() => null);
  const messageId = (posted?.json as { id?: string } | null)?.id;
  if (messageId) {
    const { updateResaleRequest } = await import("@/lib/resale");
    await updateResaleRequest(shopId, r.id, (x) => {
      x.payoutCard = { channelId: ch, messageId };
    }).catch(() => null);
  }
}

/** 관리자 카드 버튼 (dm_paid · dm_release · dm_refund) */
export async function handleDosMarketButton(shopSlug: string, action: string, id: string, roles: string[], permissions: string | undefined) {
  const [{ getShopBySlug, getShopSettings, persistAsync }, { isDiscordAdmin }, { plainEphemeral, v2Update }, { listResaleRequests }] = await Promise.all([
    import("@/lib/store"),
    import("@/lib/discord/handlers"),
    import("@/lib/discord/components"),
    import("@/lib/resale"),
  ]);
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return plainEphemeral("관리자만 처리할 수 있어요.");
  if (action === "dm_cred") {
    const r = (await listResaleRequests(shop.id)).find((x) => x.id === id);
    const c = r ? revealSellerCred(r) : null;
    if (!c) return plainEphemeral(r?.status === "approved" ? "승인되면서 로그인 정보는 상품 지급 코드로 옮겨졌어요." : "제출된 로그인 정보가 없어요.");
    return plainEphemeral(["**판매자 로그인 정보** (나만 보여요)", `이메일: \`${c.email}\``, `비밀번호: ||${c.password}||`, c.extra ? `추가: ${c.extra}` : ""].filter(Boolean).join("\n"));
  }
  try {
    let note = "";
    if (action === "dm_paid") {
      await adminMarkPaid(shop.id, id);
      note = "정산 완료 처리했어요";
    } else if (action === "dm_release") {
      await adminRelease(shop.id, id);
      note = "보류를 풀었어요 — 다음 점검 때 정산돼요";
    } else {
      const { refunded } = await adminRefundBuyer(shop.id, id);
      note = `구매자에게 ${won(refunded)} 포인트 환불했어요 · 계정 회수는 따로 진행해 주세요`;
    }
    await persistAsync().catch(() => null);
    const r = (await listResaleRequests(shop.id)).find((x) => x.id === id)!;
    return v2Update((await payoutCardBody(shopSlug, r, note)).components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
}
