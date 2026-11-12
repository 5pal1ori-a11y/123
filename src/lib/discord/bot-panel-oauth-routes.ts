import { NextResponse } from "next/server";
import {
  buildPanelBotInviteUrl,
  buildPanelOAuthAuthorizeUrl,
  completePanelOAuth,
  createPanelOAuthState,
  encodePanelOAuthSession,
  encodePanelSetup,
  PANEL_OAUTH_COOKIE,
  PANEL_SETUP_COOKIE,
  panelOAuthCookieOptions,
  panelOAuthCredentials,
  panelOAuthHome,
  panelOAuthRedirectUri,
  panelSetupCookieOptions,
  readPanelOAuthSessionFromRequest,
  readPanelSetupFromRequest,
  verifyPanelOAuthState,
  type PanelOAuthProduct,
} from "@/lib/discord/panel-oauth";

type GuildListItem = { guildId: string; guildName: string };
type BotProduct = Exclude<PanelOAuthProduct, "shop">;

type SessionCookieOpts = {
  createToken: (guildId: string) => string;
  cookieName: () => string;
  cookieOptions: (maxAgeSec?: number) => Record<string, unknown>;
};

export function makeBotOAuthStartHandler(product: BotProduct) {
  return async function GET() {
    const creds = await panelOAuthCredentials(product);
    if (!creds) {
      return NextResponse.json({ error: "Discord OAuth가 설정되지 않았어요." }, { status: 503 });
    }
    const state = createPanelOAuthState(product, { intent: "login" });
    const url = buildPanelOAuthAuthorizeUrl({
      applicationId: creds.applicationId,
      state,
      redirectUri: panelOAuthRedirectUri(product),
    });
    return NextResponse.redirect(url, 302);
  };
}

export function makeBotOAuthInviteStartHandler(product: BotProduct) {
  return async function GET(request: Request) {
    const session = readPanelOAuthSessionFromRequest(request, product);
    if (!session) {
      return NextResponse.redirect(`${panelOAuthHome(product)}/?discord=state`, 302);
    }
    const guildId = new URL(request.url).searchParams.get("guildId")?.trim() ?? "";
    if (!/^\d{5,30}$/.test(guildId) || !session.ownedGuildIds.includes(guildId)) {
      return NextResponse.redirect(
        `${panelOAuthHome(product)}/?discord=error&msg=${encodeURIComponent("소유한 서버만 초대할 수 있어요.")}`,
        302,
      );
    }
    const creds = await panelOAuthCredentials(product);
    if (!creds) {
      return NextResponse.json({ error: "Discord OAuth가 설정되지 않았어요." }, { status: 503 });
    }
    const state = createPanelOAuthState(product, { intent: "invite", guildId });
    const url = buildPanelBotInviteUrl({
      applicationId: creds.applicationId,
      state,
      redirectUri: panelOAuthRedirectUri(product),
      guildId,
    });
    return NextResponse.redirect(url, 302);
  };
}

export function makeBotOAuthCallbackHandler(
  product: BotProduct,
  opts: SessionCookieOpts & {
    onInvite: (input: {
      guildId: string;
      discordUserId: string;
      guildNameHint?: string;
    }) => Promise<{ password: string; recoveryKey?: string }>;
  },
) {
  return async function GET(request: Request) {
    const home = panelOAuthHome(product);
    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim() ?? "";
    const state = url.searchParams.get("state")?.trim() ?? "";
    const error = url.searchParams.get("error");
    const guildIdFromDiscord = url.searchParams.get("guild_id")?.trim() ?? "";

    if (error) {
      return NextResponse.redirect(`${home}/?discord=denied`, 302);
    }

    const payload = verifyPanelOAuthState(state);
    if (!payload || payload.product !== product) {
      return NextResponse.redirect(`${home}/?discord=state`, 302);
    }

    if (payload.intent === "invite") {
      const session = readPanelOAuthSessionFromRequest(request, product);
      if (!session) {
        return NextResponse.redirect(`${home}/?discord=state`, 302);
      }
      const guildId = guildIdFromDiscord || payload.guildId || "";
      if (!/^\d{5,30}$/.test(guildId)) {
        return NextResponse.redirect(
          `${home}/?discord=error&msg=${encodeURIComponent("서버 초대에 실패했어요.")}`,
          302,
        );
      }
      if (payload.guildId && payload.guildId !== guildId) {
        return NextResponse.redirect(
          `${home}/?discord=error&msg=${encodeURIComponent("선택한 서버와 초대 결과가 달라요.")}`,
          302,
        );
      }
      if (!session.ownedGuildIds.includes(guildId)) {
        return NextResponse.redirect(
          `${home}/?discord=error&msg=${encodeURIComponent("소유한 서버만 등록할 수 있어요.")}`,
          302,
        );
      }
      const hint = session.ownedGuilds.find((g) => g.id === guildId)?.name;
      try {
        const registered = await opts.onInvite({
          guildId,
          discordUserId: session.discordUserId,
          guildNameHint: hint,
        });
        const token = opts.createToken(guildId);
        const res = NextResponse.redirect(`${home}/${guildId}?setup=1`, 302);
        res.cookies.set(opts.cookieName(), token, opts.cookieOptions() as never);
        res.cookies.set(
          PANEL_SETUP_COOKIE,
          encodePanelSetup({
            product,
            guildId,
            password: registered.password,
            ...(registered.recoveryKey ? { recoveryKey: registered.recoveryKey } : {}),
            exp: Date.now() + 15 * 60 * 1000,
          }),
          panelSetupCookieOptions(),
        );
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "등록 실패";
        return NextResponse.redirect(
          `${home}/?discord=error&msg=${encodeURIComponent(msg.slice(0, 80))}`,
          302,
        );
      }
    }

    if (!code) {
      return NextResponse.redirect(`${home}/?discord=code`, 302);
    }

    const session = await completePanelOAuth({
      product,
      code,
      redirectUri: panelOAuthRedirectUri(product),
    });
    if ("error" in session) {
      return NextResponse.redirect(
        `${home}/?discord=error&msg=${encodeURIComponent(session.error.slice(0, 80))}`,
        302,
      );
    }

    const res = NextResponse.redirect(`${home}/?discord=ok`, 302);
    res.cookies.set(PANEL_OAUTH_COOKIE, encodePanelOAuthSession(session), panelOAuthCookieOptions());
    return res;
  };
}

export function makeBotOAuthGuildsHandler(
  product: BotProduct,
  listRegistered: () => Promise<GuildListItem[]> | GuildListItem[],
) {
  return async function GET(request: Request) {
    const session = readPanelOAuthSessionFromRequest(request, product);
    if (!session) {
      return NextResponse.json({ error: "Discord 로그인이 필요합니다.", needLogin: true }, { status: 401 });
    }
    const registeredList = await listRegistered();
    const registeredIds = new Set(registeredList.map((g) => g.guildId));
    const registered = session.ownedGuilds
      .filter((g) => registeredIds.has(g.id))
      .map((g) => ({
        guildId: g.id,
        guildName: registeredList.find((r) => r.guildId === g.id)?.guildName || g.name,
        icon: g.icon,
      }));
    const unregistered = session.ownedGuilds
      .filter((g) => !registeredIds.has(g.id))
      .map((g) => ({
        guildId: g.id,
        guildName: g.name,
        icon: g.icon,
      }));
    return NextResponse.json({
      ok: true,
      discordUserId: session.discordUserId,
      discordUsername: session.discordUsername,
      registered,
      unregistered,
      guilds: registered,
    });
  };
}

export function makeBotOAuthSelectHandler(
  product: BotProduct,
  opts: SessionCookieOpts & {
    getGuild: (guildId: string) => { guildId: string } | null;
  },
) {
  return async function POST(request: Request) {
    const session = readPanelOAuthSessionFromRequest(request, product);
    if (!session) {
      return NextResponse.json({ error: "Discord 로그인이 필요합니다." }, { status: 401 });
    }
    const json = (await request.json().catch(() => null)) as { guildId?: string } | null;
    const guildId = json?.guildId?.trim() ?? "";
    if (!/^\d{5,30}$/.test(guildId)) {
      return NextResponse.json({ error: "서버를 선택해 주세요." }, { status: 400 });
    }
    if (!session.ownedGuildIds.includes(guildId)) {
      return NextResponse.json({ error: "소유한 서버만 선택할 수 있어요." }, { status: 403 });
    }
    const guild = opts.getGuild(guildId);
    if (!guild) {
      return NextResponse.json(
        { error: "등록되지 않은 서버입니다. 아래에서 봇을 초대해 등록하세요." },
        { status: 404 },
      );
    }
    const token = opts.createToken(guildId);
    const res = NextResponse.json({ ok: true, guildId });
    res.cookies.set(opts.cookieName(), token, opts.cookieOptions() as never);
    res.cookies.set(PANEL_OAUTH_COOKIE, "", { ...panelOAuthCookieOptions(0), maxAge: 0 });
    return res;
  };
}

export function makeBotOAuthSetupHandler(product: BotProduct) {
  return async function GET(request: Request) {
    const setup = readPanelSetupFromRequest(request, product);
    if (!setup) {
      return NextResponse.json({ ok: false, needSetup: false });
    }
    const res = NextResponse.json({
      ok: true,
      needSetup: true,
      guildId: setup.guildId,
      password: setup.password,
      recoveryKey: setup.recoveryKey ?? null,
    });
    res.cookies.set(PANEL_SETUP_COOKIE, "", { ...panelSetupCookieOptions(0), maxAge: 0 });
    return res;
  };
}
