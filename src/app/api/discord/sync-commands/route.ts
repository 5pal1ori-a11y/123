import { NextResponse } from "next/server";
import { syncDoesCommandsIfChanged } from "@/lib/discord/sync-mfa-does";
import { hasInternalSecret } from "@/lib/internal-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await hasInternalSecret(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const result = await syncDoesCommandsIfChanged();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
