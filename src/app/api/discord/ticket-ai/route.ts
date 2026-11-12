import { NextResponse } from "next/server";
import { z } from "zod";
import { handleTicketAiMessage, ticketAiBridgeConfig } from "@/lib/discord/ticket-ai";
import { hasInternalSecret } from "@/lib/internal-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const snowflake = z.string().regex(/^\d{5,30}$/);

const bodySchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("config") }),
  z.object({
    op: z.literal("message"),
    guildId: snowflake,
    channelId: snowflake,
    messageId: snowflake,
    authorId: snowflake,
    content: z.string().max(4000),
  }),
]);

export async function POST(request: Request) {
  if (!(await hasInternalSecret(request))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (parsed.data.op === "config") return NextResponse.json(await ticketAiBridgeConfig());
  const { guildId, channelId, messageId, authorId, content } = parsed.data;
  return NextResponse.json(await handleTicketAiMessage({ guildId, channelId, messageId, authorId, content }));
}
