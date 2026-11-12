import { NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/session-server";

export async function GET() {
  const session = await getPlatformAdminSession();
  if (!session) return NextResponse.json({ admin: null });
  return NextResponse.json({ admin: { username: session.username } });
}
