import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { getPlatformAdminFromRequest } from "@/lib/session-server";
import { listLicenses, listShops, platformStats } from "@/lib/store";
import { getPlatformBank } from "@/lib/bank";
import { shopUrl } from "@/lib/domain";
import { maskLicenseKey } from "@/lib/security";
import { initStore } from "@/lib/store";

export async function GET(request: Request) {
  await initStore();
  const session = getPlatformAdminFromRequest(request);
  if (!session) return unauthorized();

  const stats = platformStats();
  const reveal = new URL(request.url).searchParams.get("reveal") === "1";
  const licenses = listLicenses().map((l) => ({
    id: l.id,
    key: reveal ? l.key : maskLicenseKey(l.key),
    buyerEmail: l.buyerEmail,
    plan: l.plan,
    amount: l.amount,
    status: l.status,
    reference: l.id.slice(0, 8).toUpperCase(),
    depositorName: l.depositorName,
    createdAt: l.createdAt,
    paidAt: l.paidAt,
  }));
  const shops = listShops().map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    ownerEmail: s.ownerEmail,
    status: s.status,
    moderationStatus: s.moderationStatus,
    moderationReason: s.moderationReason,
    moderationFlaggedAt: s.moderationFlaggedAt,
    url: shopUrl(s.slug),
    createdAt: s.createdAt,
  }));

  return NextResponse.json({
    stats,
    licenses,
    shops,
    bank: getPlatformBank(),
  });
}
