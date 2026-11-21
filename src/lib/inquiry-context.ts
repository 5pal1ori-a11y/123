/**
 * 문의 AI 가 "그 사람 상황"을 알고 답하도록 — 로그인한 손님의 주문 · 충전 · 진행 중인 거래를 요약하고,
 * 지급 정보 재전송 같은 간단한 처리는 서버가 직접 한다 (모델은 결과만 말한다).
 */
const ORDER_KO: Record<string, string> = {
  pending: "결제 대기",
  locked: "결제 확인 중",
  paid: "결제 완료 · 지급 중",
  awaiting_fulfillment: "결제 완료 · 관리자 수동 지급 대기",
  dispensed: "지급 완료",
  failed: "실패",
  expired: "만료",
};
const CHARGE_KO: Record<string, string> = { pending: "입금 확인 대기", completed: "충전 완료", cancelled: "취소", failed: "실패", expired: "만료(시간 초과)" };
const METHOD_KO: Record<string, string> = { bank: "계좌이체", culture_gift: "문화상품권", coin: "코인" };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

/** 손님 상황 요약 (프롬프트에 넣는다) — 비밀번호 · 지급 코드 내용은 넣지 않는다 */
export async function userContextFor(shopId: string, userId: string) {
  const { getStoreForRead, getUserById, listProducts, userPremiumPlan } = await import("@/lib/store");
  const user = getUserById(userId);
  if (!user || user.shopId !== shopId) return "";
  const s = getStoreForRead();
  const products = new Map(listProducts(shopId).map((p) => [p.id, p.name]));
  const orders = s.orders
    .filter((o) => o.shopId === shopId && o.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6);
  const charges = s.charges
    .filter((c) => c.shopId === shopId && c.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const lines: string[] = [
    `- 닉네임 ${user.name || "회원"} · 포인트 잔액 ${won(user.points)} · 디스코드 연결 ${user.discordId ? "됨" : "안 됨"} · 도스플랜 ${userPremiumPlan(user) ?? "없음"}`,
  ];
  lines.push(
    orders.length
      ? `- 최근 주문:\n${orders.map((o) => `  · ${when(o.createdAt)} ${products.get(o.productId) ?? "상품"} ${won(o.amount)} — ${ORDER_KO[o.status] ?? o.status}${o.dispensedCode ? " (지급 정보 있음)" : ""} [주문 ${o.orderUuid.slice(0, 8)}]`).join("\n")}`
      : "- 최근 주문: 없음",
  );
  lines.push(
    charges.length
      ? `- 최근 충전:\n${charges.map((c) => `  · ${when(c.createdAt)} ${METHOD_KO[c.method] ?? c.method} ${won(c.amount)} — ${CHARGE_KO[c.status] ?? c.status}${c.depositorName ? ` · 입금자명 ${c.depositorName}` : ""}${c.failReason ? ` · 사유: ${c.failReason}` : ""}`).join("\n")}`
      : "- 최근 충전: 없음",
  );

  // 진행 중인 거래들 (실패해도 요약만 빠진다)
  const extra = await Promise.all([
    import("@/lib/resale").then(async ({ listResaleRequests }) => {
      const mine = (await listResaleRequests(shopId)).filter((r) => r.userId === userId).slice(0, 3);
      return mine.length ? `- 도스마켓 판매: ${mine.map((r) => `${r.ign} ${won(r.price)} ${r.status === "pending" ? "검토 중" : r.status === "approved" ? (r.soldAt ? `판매됨(정산 ${r.payoutState ?? "대기"})` : "판매 중") : r.status}`).join(" / ")}` : "";
    }),
    import("@/lib/rental").then(async ({ myRentals }) => {
      const act = (await myRentals(shopId, userId)).filter((r) => r.status !== "done").slice(0, 2);
      return act.length ? `- 렌탈: ${act.map((r) => `${r.itemTitle} ${r.status === "active" ? `${when(r.until)}까지 대여 중` : "반납 확인 중(보증금 환불 대기)"}`).join(" / ")}` : "";
    }),
    import("@/lib/safe-trade").then(async ({ mySafeTrades }) => {
      const t = (await mySafeTrades(shopId, userId)).filter((x) => ["open", "paid", "held", "settling"].includes(x.status)).slice(0, 3);
      return t.length ? `- 안전거래: ${t.map((x) => `${x.title} ${won(x.price)} ${x.role === "seller" ? "판매" : "구매"} · ${x.status}`).join(" / ")}` : "";
    }),
    import("@/lib/season-pass").then(async ({ passState }) => {
      const p = await passState(shopId, userId);
      return `- 시즌패스: Lv.${p.level} · ${p.pass ? "패스 보유" : "패스 없음"} · 받을 보상 ${p.claimable}개`;
    }),
    import("@/lib/vip").then(async ({ vipStatus }) => {
      const v = await vipStatus(shopId, userId);
      return v.tier ? `- VIP: ${v.tier.name} (누적 ${won(v.spent)})` : `- VIP 아님 (누적 ${won(v.spent)})`;
    }),
  ].map((p) => p.catch(() => "")));
  lines.push(...extra.filter(Boolean));
  return lines.join("\n");
}

const RESEND_RE = /(다시|재)\s*(보내|전송|발송|받)|못\s*받|안\s*(왔|와|옴|들어)|(코드|계정\s*정보|아이디|비번|비밀번호).{0,8}(어디|없|안\s*보|분실|잃어)/;

/** 지급 정보 재전송 요청이면 서버가 디스코드 DM 으로 최근 지급 내역을 다시 보낸다 */
export async function maybeHandleAction(shopId: string, userId: string, query: string): Promise<{ note: string; say: string } | null> {
  if (!RESEND_RE.test(query)) return null;
  const { getStoreForRead, getUserById, listProducts } = await import("@/lib/store");
  const user = getUserById(userId);
  if (!user) return null;
  const products = new Map(listProducts(shopId).map((p) => [p.id, p.name]));
  const done = getStoreForRead()
    .orders.filter((o) => o.shopId === shopId && o.userId === userId && o.status === "dispensed" && o.dispensedCode)
    .sort((a, b) => Date.parse(b.paidAt ?? b.createdAt) - Date.parse(a.paidAt ?? a.createdAt))
    .slice(0, 3);
  const waiting = getStoreForRead().orders.filter((o) => o.shopId === shopId && o.userId === userId && (o.status === "paid" || o.status === "awaiting_fulfillment")).length;
  if (!done.length) {
    return waiting
      ? { note: `[처리 결과] 아직 지급이 끝나지 않은 주문이 ${waiting}건 있음 (관리자 수동 지급 대기). 다시 보낼 지급 정보는 없음.`, say: `아직 지급이 끝나지 않은 주문이 ${waiting}건 있어요. 관리자가 확인하고 지급하면 DM으로 알려 드려요.` }
      : { note: "[처리 결과] 지급 완료된 주문이 없어 다시 보낼 정보가 없음.", say: "지급 완료된 주문이 없어서 다시 보낼 정보가 없어요. 주문 번호를 알려 주시면 확인해 볼게요." };
  }
  if (!user.discordId) return { note: `[처리 결과] 디스코드가 연결되지 않아 DM 재전송 불가. 사이트 '내역' 탭에서 지급 정보를 다시 볼 수 있다고 안내할 것. (지급 완료 ${done.length}건)`, say: "디스코드가 연결돼 있지 않아 DM으로는 못 보내요. 사이트 '내역' 탭에서 지급 정보를 다시 볼 수 있어요." };
  const { sendDiscordDm } = await import("@/lib/discord/dm");
  const body = [`**[DOES] 요청하신 지급 정보를 다시 보내 드려요**`, ...done.map((o) => `\n**${products.get(o.productId) ?? "상품"}** · 주문 ${o.orderUuid.slice(0, 8)}\n\`\`\`\n${(o.dispensedCode ?? "").slice(0, 800)}\n\`\`\``), "\n받은 계정은 비밀번호 · 복구 이메일을 꼭 바꿔 주세요."].join("\n");
  const r = await sendDiscordDm(user.discordId, { content: body.slice(0, 1990) }, shopId).catch(() => null);
  const ok = Boolean(r?.ok);
  return ok
    ? { note: `[처리 결과] 최근 지급 정보 ${done.length}건을 디스코드 DM으로 다시 보냈음. DM이 안 보이면 서버 멤버 DM 허용을 켜야 함. 사이트 '내역' 탭에서도 볼 수 있음.`, say: `최근 지급 정보 ${done.length}건을 디스코드 DM으로 다시 보냈어요. 사이트 '내역' 탭에서도 볼 수 있어요.` }
    : { note: "[처리 결과] DM 전송 실패(DM 차단 가능성). 디스코드 개인정보 설정에서 서버 멤버 DM 허용을 켜거나 사이트 '내역' 탭에서 확인하라고 안내할 것.", say: "DM을 보내지 못했어요. 디스코드 설정에서 '서버 멤버의 DM 허용'을 켜 주시거나, 사이트 '내역' 탭에서 확인해 주세요." };
}
