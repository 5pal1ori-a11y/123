import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError } from "@/lib/api";
import { verifyDiscordSetupToken } from "@/lib/discord/invite";
import { discordRest, registerGuildCommands, VENDIX_DISCORD_COMMANDS } from "@/lib/discord/rest";
import { planMeetsMinimum } from "@/lib/plans";
import {
  findShopBySlug,
  getShopById,
  initStore,
  persistAsync,
  updateShopSettings,
} from "@/lib/store";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(10),
  guildId: z.string().regex(/^\d{5,30}$/),
  discordUserId: z.string().regex(/^\d{5,30}$/),
  discordUsername: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  try {
    await initStore();
    const json = await request.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("서버 ID와 Discord 사용자 ID를 확인해 주세요.");

    const payload = verifyDiscordSetupToken(parsed.data.token);
    if (!payload) return badRequest("연동 링크가 만료되었어요. 상점을 다시 등록해 주세요.");

    const shop = getShopById(payload.shopId) ?? findShopBySlug(payload.slug);
    if (!shop || shop.id !== payload.shopId) return badRequest("상점을 찾을 수 없어요.");

    let username = parsed.data.discordUsername?.trim() || "";
    const userRes = await discordRest("GET", `/users/${parsed.data.discordUserId}`, undefined, shop.id);
    if (userRes.ok) {
      const u = userRes.json as {
        username?: string;
        global_name?: string | null;
        discriminator?: string | null;
      };
      if (u.username) {
        username =
          u.discriminator && u.discriminator !== "0"
            ? `${u.username}#${u.discriminator}`
            : u.username;
      }
    }
    if (!username) username = parsed.data.discordUserId;

    updateShopSettings(shop.id, {
      discordBotEnabled: true,
      discordGuildId: parsed.data.guildId,
      discordOwnerId: parsed.data.discordUserId,
      discordOwnerUsername: username,
    });
    await persistAsync();

    if (planMeetsMinimum(shop.plan, "pro")) {
      try {
        if (shop.slug === "mfa") {
          const { syncMfaDoesDiscord } = await import("@/lib/discord/sync-mfa-does");
          await syncMfaDoesDiscord(parsed.data.guildId);
        } else {
          await registerGuildCommands(parsed.data.guildId, [...VENDIX_DISCORD_COMMANDS], {
            shopId: shop.id,
          });
        }
      } catch {
        // bind succeeded; commands can be registered later
      }
    }

    return NextResponse.json({
      ok: true,
      guildId: parsed.data.guildId,
      discordOwnerId: parsed.data.discordUserId,
      discordOwnerUsername: username,
    });
  } catch (err) {
    return serverError(err);
  }
}
