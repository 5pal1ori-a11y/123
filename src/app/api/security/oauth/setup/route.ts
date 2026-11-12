import { makeBotOAuthSetupHandler } from "@/lib/discord/bot-panel-oauth-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = makeBotOAuthSetupHandler("security");
