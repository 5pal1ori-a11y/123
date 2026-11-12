import { plainEphemeral, type DiscordInteraction } from "@/lib/discord/components";
import { DOES_COMMUNITY_NAMES, rewriteDoesCommandName } from "@/lib/discord/does-community-commands";

const DOES_FORWARD_URL = "https://discord-shop-bot.tyopal18.workers.dev/internal";

export async function doesForwardKey() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const key = (env as { DOES_FORWARD_KEY?: string }).DOES_FORWARD_KEY?.trim();
    if (key) return key;
  } catch {
    /* local */
  }
  return process.env.DOES_FORWARD_KEY?.trim() || "";
}

export function isDoesCommunityCommand(name?: string) {
  return Boolean(name && DOES_COMMUNITY_NAMES.has(name));
}

export async function forwardToDoesBot(interaction: DiscordInteraction) {
  const key = await doesForwardKey();
  if (!key) return plainEphemeral("DOES 명령 연동이 아직 설정되지 않았어요.");

  const payload = structuredClone(interaction) as DiscordInteraction;
  if (payload.data?.name) {
    payload.data.name = rewriteDoesCommandName(payload.data.name);
  }

  const res = await fetch(DOES_FORWARD_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-does-forward": key,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    return plainEphemeral("DOES 명령 처리에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
  return (await res.json().catch(() => null)) ?? plainEphemeral("DOES 응답이 비어 있어요.");
}
