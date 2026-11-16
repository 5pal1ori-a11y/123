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
    return NextResponse.json({ requests: await listResaleRequests(shop.id) });
  }
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ requests: [], feePercent: RESALE_DEFAULT_FEE_PERCENT, loggedIn: false });
  const mine = (await listResaleRequests(shop.id)).filter((r) => r.userId === session.user.id).slice(0, 30);
  const fee = (await premiumBenefits(shop.id, session.user.id)).resaleFeePercent;
  return NextResponse.json({ requests: mine, feePercent: fee, loggedIn: true });
}

const schema = z.object({
  accountType: z.string().min(1).max(20),
  ign: z.string().min(3).max(16),
  showName: z.boolean(),
  capes: z.array(z.string().max(32)).max(20),
  description: z.string().max(1000),
  price: z.number().int(),
  agree: z.literal(true),
});

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const session = await getUserSession(shop.slug, request);
  if (!session) return NextResponse.json({ error: "로그인 후 신청할 수 있어요." }, { status: 401 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("신청 내용을 확인해 주세요. 동의 체크도 필요해요.");
    const err = validateResaleInput(parsed.data);
    if (err) return badRequest(err);
    const user = getUserById(session.user.id);
    const fee = (await premiumBenefits(shop.id, session.user.id)).resaleFeePercent;
    const req = await createResaleRequest(
      shop.id,
      { id: session.user.id, name: user?.name || session.user.name || "회원", discordId: user?.discordId ?? null },
      parsed.data,
      fee,
    );
    pushAdminNotification(
      shop.id,
      "resale_request",
      "대리판매 신청",
      `${req.userName} 님이 ${req.ign} (${req.accountType}) 계정을 ${req.price.toLocaleString("ko-KR")}원에 대리판매 신청했어요.`,
      { requestId: req.id },
    );
    await persistAsync();
    return NextResponse.json({ ok: true, request: req });
  } catch (e) {
    if (e instanceof Error && /신청|닉네임/.test(e.message)) return badRequest(e.message);
    return serverError(e);
  }
}
