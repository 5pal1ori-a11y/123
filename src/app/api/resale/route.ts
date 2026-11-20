import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { getUserById, initStore, persistAsync } from "@/lib/store";
import { pushAdminNotification } from "@/lib/store-ext";
import { createResaleRequest, listResaleRequests, RESALE_DEFAULT_FEE_PERCENT, validateResaleInput } from "@/lib/resale";
import { premiumBenefits } from "@/lib/premium";

/** GET: 내 신청 목록 · ?all=1 이면 관리자용 전체 목록 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const all = new URL(request.url).searchParams.get("all") === "1";
  if (all) {
    if (!isShopAdmin(request, shop)) return unauthorized();
    return NextResponse.json({ requests: (await listResaleRequests(shop.id)).map(strip) });
  }
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ requests: [], feePercent: RESALE_DEFAULT_FEE_PERCENT, loggedIn: false });
  const mine = (await listResaleRequests(shop.id)).filter((r) => r.userId === session.user.id).slice(0, 30);
  const fee = (await premiumBenefits(shop.id, session.user.id)).resaleFeePercent;
  return NextResponse.json({ requests: mine.map(strip), feePercent: fee, loggedIn: true });
}

const schema = z.object({
  accountType: z.string().min(1).max(20),
  ign: z.string().min(3).max(16),
  showName: z.boolean(),
  capes: z.array(z.string().max(32)).max(20),
  description: z.string().max(1000),
  price: z.number().int(),
  agree: z.literal(true),
  /** 도스마켓 — 팔리면 바로 전달할 로그인 정보 (암호화 저장) */
  login: z.object({ email: z.string().max(120), password: z.string().max(200), extra: z.string().max(500).optional() }).nullable().optional(),
  payoutMethod: z.enum(["points", "bank"]).optional(),
  payoutAccount: z.string().max(100).optional(),
});

/** 응답에서 암호화된 로그인 정보는 빼고, 있는지만 알려 준다 */
const strip = <T extends { credEnc?: string | null }>(r: T) => {
  const { credEnc, ...rest } = r;
  return { ...rest, hasCred: Boolean(credEnc) || Boolean((r as { hasCred?: boolean }).hasCred) };
};

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ error: "로그인 후 신청할 수 있어요." }, { status: 401 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("신청 내용을 확인해 주세요. 동의 체크도 필요해요.");
    const { getMcCategories } = await import("@/lib/mc-categories");
    const { MC_RESALE_CATEGORY } = await import("@/lib/mc-account");
    const err = validateResaleInput(
      { ...parsed.data, payoutAccount: parsed.data.payoutMethod === "bank" ? (parsed.data.payoutAccount ?? "") : undefined },
      (await getMcCategories(shop.id)).filter((c) => c !== MC_RESALE_CATEGORY),
    );
    if (err) return badRequest(err);
    const user = getUserById(session.user.id);
    const fee = (await premiumBenefits(shop.id, session.user.id)).resaleFeePercent;
    const method = parsed.data.payoutMethod ?? "points";
    if (method === "bank" && (parsed.data.payoutAccount ?? "").trim().length < 6) return badRequest("계좌로 정산받으려면 은행 · 계좌번호 · 예금주를 적어 주세요.");
    const created = await createResaleRequest(
      shop.id,
      { id: session.user.id, name: user?.name || session.user.name || "회원", discordId: user?.discordId ?? null },
      { ...parsed.data, payoutAccount: undefined },
      fee,
    );
    const { attachSellerInfo } = await import("@/lib/dosmarket");
    const req = await attachSellerInfo(shop.id, created.id, {
      cred: parsed.data.login?.email && parsed.data.login.password ? parsed.data.login : null,
      payoutMethod: method,
      payoutAccount: method === "bank" ? parsed.data.payoutAccount : null,
    });
    pushAdminNotification(
      shop.id,
      "resale_request",
      "대리판매 신청",
      `${req.userName} 님이 ${req.ign} (${req.accountType}) 계정을 ${req.price.toLocaleString("ko-KR")}원에 대리판매 신청했어요.`,
      { requestId: req.id },
    );
    await persistAsync();
    return NextResponse.json({ ok: true, request: strip(req) });
  } catch (e) {
    if (e instanceof Error && /신청|닉네임/.test(e.message)) return badRequest(e.message);
    return serverError(e);
  }
}
