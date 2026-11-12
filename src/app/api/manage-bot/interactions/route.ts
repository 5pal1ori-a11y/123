import { NextResponse } from "next/server";
import {
  DISCORD_API,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import { manageDiscordEnvAsync } from "@/lib/manage-bot/env";
import { handleManageBotInteraction } from "@/lib/manage-bot/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function needsDefer(interaction: DiscordInteraction) {
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    const id = interaction.data?.custom_id || "";
    return id.includes("|banner_modal") || id.includes("|rename_modal");
  }
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const id = interaction.data?.custom_id || "";
    return id.includes("|emb|") && id.endsWith("|send");
  }
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const name = interaction.data?.name || "";
    return name === "파트너즉시" || name === "배너라이센스";
  }
  return false;
}

async function getCfWaitUntil(): Promise<((p: Promise<unknown>) => void) | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    if (ctx && typeof ctx.waitUntil === "function") {
      return (p) => ctx.waitUntil(p);
    }
  } catch {
    /* local */
  }
  return null;
}

async function editOriginal(
  applicationId: string,
  token: string,
  data: Record<string, unknown>,
) {
  const res = await fetch(
    `${DISCORD_API}/webhooks/${applicationId}/${token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[manage-bot] followup edit failed", res.status, text.slice(0, 300));
  }
}

async function processDeferred(interaction: DiscordInteraction) {
  try {
    const response = await handleManageBotInteraction(
      interaction as unknown as Record<string, unknown>,
    );
    const type = (response as { type?: number }).type;
    const data = (response as { data?: Record<string, unknown> }).data;

    if (type === InteractionResponseType.MODAL) {
      await editOriginal(interaction.application_id, interaction.token, {
        content: "모달이 필요해요. 버튼을 다시 눌러 주세요.",
        flags: MessageFlags.EPHEMERAL,
      });
      return;
    }

    if (data) {
      const flags =
        typeof data.flags === "number"
          ? data.flags
          : MessageFlags.EPHEMERAL | MessageFlags.IS_COMPONENTS_V2;
      const isV2 = (flags & MessageFlags.IS_COMPONENTS_V2) === MessageFlags.IS_COMPONENTS_V2;

      if (isV2) {
        await editOriginal(interaction.application_id, interaction.token, {
          content: null,
          embeds: [],
          components: Array.isArray(data.components) ? data.components : [],
          flags,
        });
        return;
      }

      await editOriginal(interaction.application_id, interaction.token, {
        content: typeof data.content === "string" ? data.content : null,
        embeds: Array.isArray(data.embeds) ? data.embeds : [],
        components: Array.isArray(data.components) ? data.components : [],
        flags,
      });
      return;
    }

    await editOriginal(interaction.application_id, interaction.token, {
      content: "처리됐어요.",
      flags: MessageFlags.EPHEMERAL,
    });
  } catch (err) {
    console.error("[manage-bot] deferred failed", err);
    try {
      await editOriginal(interaction.application_id, interaction.token, {
        content: "처리 중 오류가 발생했어요.",
        flags: MessageFlags.EPHEMERAL,
      });
    } catch {
      /* ignore */
    }
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();

  const env = await manageDiscordEnvAsync();
  if (!env.publicKey) {
    return NextResponse.json({ error: "MANAGE_DISCORD_PUBLIC_KEY missing" }, { status: 500 });
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

  // Modal open must be sync type-9
  const waitUntil = await getCfWaitUntil();
  if (waitUntil && needsDefer(interaction)) {
    waitUntil(processDeferred(interaction));
    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: MessageFlags.EPHEMERAL },
    });
  }

  try {
    const result = await handleManageBotInteraction(
      interaction as unknown as Record<string, unknown>,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[manage-bot] interaction failed", err);
    return NextResponse.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "처리 중 오류가 발생했어요.",
        flags: MessageFlags.EPHEMERAL,
      },
    });
  }
}
