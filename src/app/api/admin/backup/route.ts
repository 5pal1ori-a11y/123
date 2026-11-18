import { NextResponse } from "next/server";
import { assertSameOrigin, isShop, isShopAdmin, requireShop, serverError, unauthorized } from "@/lib/api";
import { initStore } from "@/lib/store";
import { getBackupIndex, getBackupRaw, runBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

/** 백업 목록 (관리자) · ?key= 로 특정 백업 다운로드 */
export async function GET(request: Request) {
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  const key = new URL(request.url).searchParams.get("key");
  if (key) {
    const raw = await getBackupRaw(key);
    if (!raw) return new Response("not found", { status: 404 });
    return new Response(raw, {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${key.replace(/[^a-z0-9]/gi, "_")}.json"`, "cache-control": "no-store" },
    });
  }
  return NextResponse.json({ backups: await getBackupIndex() }, { headers: { "cache-control": "no-store" } });
}

/** 지금 백업 (관리자) */
export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await initStore();
  const shop = requireShop(request);
  if (!isShop(shop)) return shop;
  if (!isShopAdmin(request, shop)) return unauthorized();
  try {
    return NextResponse.json(await runBackup(true));
  } catch (err) {
    return serverError(err);
  }
}
