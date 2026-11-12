import { NextResponse } from "next/server";
import { finishGiveaway } from "@/lib/discord/giveaway";
import { hasInternalSecret } from "@/lib/internal-secret";
import { initStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await hasInternalSecret(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await initStore();
  const result = await finishGiveaway(String(id));
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
