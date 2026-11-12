import { NextResponse } from "next/server";
import { findShopBySlug, getUserById } from "@/lib/store";
import { getSessionFromRequest } from "@/lib/session-server";
import { isAuthSessionValid } from "@/lib/store-ext";
import { staffCan } from "@/lib/staff-perms";
import type { Shop, StaffPermission } from "@/lib/types";
import { assertSameOrigin } from "@/lib/csrf";

export { assertSameOrigin };

export function getShopSlugFromRequest(request: Request): string | null {
  return (
    request.headers.get("x-orel-shop") ??
    new URL(request.url).searchParams.get("shop")
  );
}

export function requireShop(request: Request): Shop | NextResponse {
  const slug = getShopSlugFromRequest(request);
  if (!slug) {
    return NextResponse.json({ error: "상점 컨텍스트가 없습니다." }, { status: 400 });
  }
  const shop = findShopBySlug(slug);
  if (!shop) {
    return NextResponse.json({ error: "상점을 찾을 수 없습니다." }, { status: 404 });
  }
  return shop;
}

/** Cookie-authenticated shop owner admin (not sub-admin). */
export function isShopOwnerAdmin(request: Request, shop: Shop) {
  const session = getSessionFromRequest(request, shop.slug, "admin");
  if (!session || session.shopId !== shop.id) return false;
  if (!isAuthSessionValid(session.sid)) return false;
  return true;
}

/** Shop owner admin OR limited sub-admin. */
export function isShopAdmin(request: Request, shop: Shop) {
  if (isShopOwnerAdmin(request, shop)) return true;
  const userSession = getSessionFromRequest(request, shop.slug, "user");
  if (!userSession || !isAuthSessionValid(userSession.sid)) return false;
  const user = getUserById(userSession.sub);
  return Boolean(user?.isSubAdmin && user.shopId === shop.id && !user.banned);
}

export type ShopAdminActor = {
  isOwner: boolean;
  isSubAdmin: boolean;
  permissions: StaffPermission[];
};

/** Current admin actor (owner or staff). Null if not admin. */
export function getShopAdminActor(request: Request, shop: Shop): ShopAdminActor | null {
  if (isShopOwnerAdmin(request, shop)) {
    return { isOwner: true, isSubAdmin: false, permissions: [] };
  }
  const userSession = getSessionFromRequest(request, shop.slug, "user");
  if (!userSession || !isAuthSessionValid(userSession.sid)) return null;
  const user = getUserById(userSession.sub);
  if (!user?.isSubAdmin || user.shopId !== shop.id || user.banned) return null;
  return {
    isOwner: false,
    isSubAdmin: true,
    permissions: user.staffPermissions ?? [],
  };
}

export function forbidUnlessStaffCan(
  request: Request,
  shop: Shop,
  need: StaffPermission,
) {
  const actor = getShopAdminActor(request, shop);
  if (!actor) return unauthorized();
  if (!staffCan(actor, need)) return forbidden("이 작업에 대한 권한이 없어요.");
  return null;
}

export function isShop(value: Shop | NextResponse): value is Shop {
  return !(value instanceof NextResponse);
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(err: unknown) {
  console.error("[vendix]", err);
  return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
}
