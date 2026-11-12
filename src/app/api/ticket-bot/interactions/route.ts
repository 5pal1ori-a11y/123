import { NextResponse } from "next/server";
import {
  InteractionResponseType,
  InteractionType,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import { ticketDiscordEnvAsync } from "@/lib/ticket-bot/env";
import { handleTicketBotInteraction } from "@/lib/ticket-bot/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();

  const env = await ticketDiscordEnvAsync();
  if (!env.publicKey) {
    return NextResponse.json({ error: "TICKET_DISCORD_PUBLIC_KEY missing" }, { status: 500 });
  }

  const ok = await verifyDiscordRequest(env.publicKey, signature, timestamp, body);
  if (!ok) {
    return NextResponse.json({ error: "invalid request signature" }, { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  try {
    const result = await handleTicketBotInteraction(interaction);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ticket-bot] interaction failed", err);
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "처리 중 오류가 발생했어요.",
        flags: 64,
      },
    });
  }
}
