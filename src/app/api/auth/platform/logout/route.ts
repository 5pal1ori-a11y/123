import { NextResponse } from "next/server";
import { clearPlatformAdminSession } from "@/lib/session-server";

export async function POST() {
  await clearPlatformAdminSession();
  return NextResponse.json({ ok: true });
}
