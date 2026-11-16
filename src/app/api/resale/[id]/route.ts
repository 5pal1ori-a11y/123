import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { getUserSession } from "@/lib/session-server";
import { addInventoryCodes, createProduct, initStore, persistAsync } from "@/lib/store";
import { pushUserNotification } from "@/lib/store-ext";
import { MC_RESALE_CATEGORY } from "@/lib/mc-account";
import { listResaleRequests, RESALE_CAPE_CHOICES, resaleProductName, updateResaleRequest, type ResaleRequest } from "@/lib/resale";
import { sendDiscordDm } from "@/lib/discord/dm";
import { container, MessageFlags, separator, textDisplay } from "@/lib/discord/components";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    price: z.number().int().min(0).optional(),
    /** 구매자에게 줄 계정 정보 (이메일 | 비밀번호 …). 비우면 수동 지급 상품으로 올린다 */
    deliveryCode: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("reject"), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("cancel") }),
]);

function capeLabels(r: ResaleRequest) {
  return r.capes.map((c) => RESALE_CAPE_CHOICES.find((x) => x.type === c)?.label ?? c).join(", ");
}

async function dm(r: ResaleRequest, title: string, lines: string[], color: number, shopId: string) {
  if (!r.discordId) return;
  await sendDiscordDm(
    r.discordId,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [container([textDisplay(`## ${title}`), separator(true, 1), textDisplay(lines.filter(Boolean).join("\n"))], color)],
    },
    shopId,
  ).catch(() => null);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  const { id } = await ctx.params;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return badRequest("요청이 올바르지 않아요.");
    const body = parsed.data;
    const current = (await listResaleRequests(shop.id)).find((r) => r.id === id);
    if (!current) return NextResponse.json({ error: "신청을 찾을 수 없어요." }, { status: 404 });

    if (body.action === "cancel") {
      const session = await getUserSession(shop.slug, request);
      if (!session || session.user.id !== current.userId) return unauthorized();
      if (current.status !== "pending") return badRequest("검토 중인 신청만 취소할 수 있어요.");
      const r = await updateResaleRequest(shop.id, id, (x) => {
        x.status = "cancelled";
        x.reviewedAt = new Date().toISOString();
      });
      return NextResponse.json({ ok: true, request: r });
    }

    if (!isShopAdmin(request, shop)) return unauthorized();
    if (current.status !== "pending") return badRequest("이미 처리된 신청이에요.");

    if (body.action === "reject") {
      const reason = body.reason?.trim() || "";
      const r = await updateResaleRequest(shop.id, id, (x) => {
        x.status = "rejected";
        x.reviewedAt = new Date().toISOString();
        x.rejectReason = reason || null;
      });
      pushUserNotification(shop.id, r.userId, "resale", "대리판매 신청 반려", `${r.ign} 대리판매 신청이 반려됐어요.${reason ? ` 사유: ${reason}` : ""}`);
      await persistAsync();
      await dm(r, "대리판매 신청이 반려되었습니다", [`**계정** ${r.showName ? r.ign : r.ign.slice(0, 2) + "***"}`, reason ? `**사유** ${reason}` : "", "-# 궁금한 점은 문의 티켓으로 남겨 주세요"], 0xef4444, shop.id);
      return NextResponse.json({ ok: true, request: r });
    }

    // 승인 → 「대리판매」 카테고리 마크 계정 상품으로 올린다
    const price = body.price ?? current.price;
    const code = body.deliveryCode?.trim() || "";
    const desc = [
      `[${current.accountType}] 대리판매 계정`,
      current.capes.length ? `보유 망토: ${capeLabels(current)}` : "",
      current.description,
    ]
      .filter(Boolean)
      .join("\n");
    const product = createProduct(shop.id, {
      name: resaleProductName(current),
      slug: `resale-${current.id.slice(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      price,
      category: MC_RESALE_CATEGORY,
      description: desc,
      tags: [current.accountType === "일반 계정" ? "NON" : current.accountType.replace(" 계정", "")],
      productKind: "mc_account",
      mcNickname: current.ign,
      mcShowName: current.showName,
      mcCapes: current.capes.length ? current.capes : null,
      listingKind: "individual",
      fulfillment: code ? "auto" : "manual",
      manualNotice: code ? null : "대리판매 계정이라 판매자 확인 후 관리자가 직접 전달해 드려요.",
      purchaseLimitPerUser: null,
      resale: {
        requestId: current.id,
        sellerUserId: current.userId,
        sellerDiscordId: current.discordId,
        feePercent: current.feePercent,
        payout: Math.max(0, Math.floor(price * (1 - current.feePercent / 100))),
      },
    });
    if (code) addInventoryCodes(shop.id, product.id, [code], "admin");
    const r = await updateResaleRequest(shop.id, id, (x) => {
      x.status = "approved";
      x.reviewedAt = new Date().toISOString();
      x.productId = product.id;
      x.price = price;
      x.payout = Math.max(0, Math.floor(price * (1 - x.feePercent / 100)));
    });
    pushUserNotification(
      shop.id,
      r.userId,
      "resale",
      "대리판매 승인",
      `${r.ign} 계정이 대리판매로 등록됐어요. 판매되면 ${r.payout.toLocaleString("ko-KR")}원을 정산해 드려요.`,
      product.id,
    );
    await persistAsync();
    await dm(
      r,
      "대리판매 요청이 승인되었습니다 ✅",
      [
        `**계정** ${r.showName ? r.ign : resaleProductName(r).replace("대리판매 ", "")} · ${r.accountType}`,
        `**판매 가격** ${price.toLocaleString("ko-KR")}원`,
        `**수수료** ${r.feePercent}% · **예상 정산 금액** ${r.payout.toLocaleString("ko-KR")}원`,
        "-# 상점 「마인크래프트 계정 › 대리판매」 탭에 올라갔어요. 판매되면 다시 알려 드릴게요.",
      ],
      0x22c55e,
      shop.id,
    );
    return NextResponse.json({ ok: true, request: r, productId: product.id });
  } catch (e) {
    return serverError(e);
  }
}
