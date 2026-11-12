import { NextResponse } from "next/server";
import { z } from "zod";
import {
  badRequest,
  forbidUnlessStaffCan,
  isShop,
  isShopAdmin,
  requireShop,
  serverError,
  unauthorized,
} from "@/lib/api";
import { addInventoryCodes, deleteInventoryItems, initStore, listInventories, persistAsync } from "@/lib/store";
import { notifyRestockWatchers } from "@/lib/store-ext";
import { postRestockLog } from "@/lib/discord/logs";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";

export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "products");
  if (denied) return denied;

  const productId = new URL(request.url).searchParams.get("productId") ?? undefined;
  return NextResponse.json({
    inventories: listInventories(shop.id, productId, { maskSold: true }),
  });
}

const bodySchema = z.object({
  productId: z.string().min(1),
  codes: z.array(z.string()).optional(),
  codesText: z.string().optional(),
});

export async function POST(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "products");
  if (denied) return denied;

  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return badRequest("잘못된 요청입니다.");

    const fromArray = parsed.data.codes ?? [];
    const fromText = (parsed.data.codesText ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const codes = [...fromArray, ...fromText];
    if (codes.length === 0) return badRequest("등록할 코드가 없습니다.");

    const result = addInventoryCodes(shop.id, parsed.data.productId, codes, "admin");
    if (result.added > 0) {
      if (result.beforeAvailable === 0) {
        notifyRestockWatchers(shop.id, parsed.data.productId, result.productName, result.added);
      }
      scheduleDiscordBackground(
        Promise.resolve(
          postRestockLog(shop.id, {
            productName: result.productName,
            addedCount: result.added,
            newTotal: result.beforeAvailable + result.added,
          }),
        ).then(() =>
          import("@/lib/discord/stock-board").then(({ refreshStockBoard }) =>
            refreshStockBoard(shop.id),
          ),
        ),
      );
    }
    await persistAsync();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}

const deleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000),
});

export async function DELETE(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const denied = forbidUnlessStaffCan(request, shop, "products");
  if (denied) return denied;

  try {
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("삭제할 재고를 선택해 주세요.");
    const result = deleteInventoryItems(shop.id, parsed.data.ids);
    if (result.deleted > 0) {
      scheduleDiscordBackground(
        import("@/lib/discord/stock-board").then(({ refreshStockBoard }) => refreshStockBoard(shop.id)),
      );
    }
    await persistAsync();
    return NextResponse.json(result);
  } catch (err) {
    return serverError(err);
  }
}
