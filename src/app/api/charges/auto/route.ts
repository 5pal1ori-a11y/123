import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { badRequest, serverError } from "@/lib/api";
import { resolveAutoChargePayload } from "@/lib/deposit-parse";
import {
  autoMatchCharge,
  getShopBySlug,
  getShopSettings,
  initStore,
  listPendingCharges,
  persistAsync,
  pushLog,
} from "@/lib/store";
import { expireStalePendingCharges } from "@/lib/store-ext";
import type { Shop, ShopSettings } from "@/lib/types";

/** Empty / null tokens must not fail zod min(8) — treat as missing. */
const optionalToken = z.preprocess((v) => {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : undefined;
  }
  return undefined;
}, z.string().min(8).optional());

const optionalText = z.preprocess((v) => {
  if (v == null || v === "") return undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  return undefined;
}, z.string().optional());

const pushSchema = z.object({
  body: optionalText,
  title: optionalText,
  package_name: z.string().optional(),
  packageName: z.string().optional(),
  application_name: z.string().optional(),
  applicationName: z.string().optional(),
});

const optionalPush = z.preprocess((v) => {
  if (v == null || v === "") return undefined;
  if (typeof v === "string") return { title: "", body: v };
  if (typeof v === "object" && !Array.isArray(v)) return v;
  return undefined;
}, pushSchema.optional());

/** Pushbullet / MacroDroid (AOS) */
const schema = z
  .object({
    amount: z.union([z.number(), z.string()]).optional(),
    depositorText: optionalText,
    depositorName: optionalText,
    name: optionalText,
    message: optionalText,
    msg: optionalText,
    push: optionalPush,
    pushbulletToken: optionalToken,
    token: optionalToken,
    deviceKey: optionalToken,
  })
  .passthrough();

function resolveShopSlug(request: Request) {
  return (
    request.headers.get("x-orel-shop") ??
    request.headers.get("x-vendix-shop") ??
    new URL(request.url).searchParams.get("shop")
  );
}

function safeTokenEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function extractAuthToken(
  request: Request,
  body: Partial<z.infer<typeof schema>>,
) {
  const fromBody = body.pushbulletToken || body.token || body.deviceKey;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();

  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  if (auth.trim()) return auth.trim();

  return (
    request.headers.get("x-vendix-pushbullet") ??
    request.headers.get("x-vendix-device") ??
    request.headers.get("x-api-key") ??
    ""
  ).trim();
}

function coerceAmount(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (typeof raw === "string") {
    const n = Number(raw.replace(/,/g, "").trim());
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return undefined;
}

function authorizeAutoCharge(
  shop: Shop,
  token: string,
):
  | { ok: true; settings: ShopSettings; via: "pushbullet" | "device" }
  | { ok: false; status: number; error: string } {
  const settings = getShopSettings(shop.id);
  if (!settings.autoChargeEnabled) {
    return { ok: false, status: 403, error: "자동충전이 꺼져 있습니다" };
  }

  const savedPb = settings.pushbulletAccessToken?.trim() || "";
  if (savedPb && safeTokenEqual(token, savedPb)) {
    return { ok: true, settings, via: "pushbullet" };
  }

  const deviceKey = shop.androidDeviceKey?.trim() || "";
  if (deviceKey && safeTokenEqual(token, deviceKey)) {
    return { ok: true, settings, via: "device" };
  }

  return { ok: false, status: 401, error: "Invalid token (pushbulletToken or deviceKey)" };
}

export async function GET(request: Request) {
  await initStore({ force: true });
  const slug = resolveShopSlug(request);
  if (!slug) return badRequest("shop required (x-orel-shop)");

  const shop = getShopBySlug(slug);
  if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

  const token = extractAuthToken(request, {});
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 401 });
  }

  const auth = authorizeAutoCharge(shop, token);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  expireStalePendingCharges(shop.id);

  return NextResponse.json({
    pending: listPendingCharges(shop.id).map((c) => ({
      id: c.id,
      amount: c.amount,
      reference: c.reference,
      depositorName: c.depositorName,
      createdAt: c.createdAt,
    })),
    autoChargeEnabled: auth.settings.autoChargeEnabled,
    authVia: auth.via,
  });
}

export async function POST(request: Request) {
  try {
    await initStore({ force: true });
    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = schema.safeParse(json ?? {});
    if (!parsed.success) {
      return badRequest("요청 형식이 올바르지 않아요.");
    }

    const slug = resolveShopSlug(request);
    if (!slug) return badRequest("shop required (x-orel-shop)");

    const shop = getShopBySlug(slug);
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    const token = extractAuthToken(request, parsed.data);
    if (!token) {
      return NextResponse.json(
        { error: "token required (pushbulletToken)" },
        { status: 401 },
      );
    }

    const auth = authorizeAutoCharge(shop, token);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    expireStalePendingCharges(shop.id);

    const messageText =
      parsed.data.depositorText?.trim() ||
      parsed.data.message?.trim() ||
      parsed.data.msg?.trim() ||
      "";

    const payload = resolveAutoChargePayload({
      depositorText: messageText || undefined,
      push: parsed.data.push,
      amount: coerceAmount(parsed.data.amount),
      depositorName: parsed.data.depositorName || parsed.data.name,
      bank: true,
      cultureGift: false,
      coin: false,
    });

    if (!payload?.amount) {
      return badRequest("입금 알림에서 금액을 찾을 수 없어요.");
    }

    const result = autoMatchCharge({
      shopId: shop.id,
      amount: payload.amount,
      depositorText: payload.depositorText,
      depositorName: payload.depositorName,
    });

    pushLog(
      `auto:${auth.via}`,
      result.ok ? "charge.auto.matched" : "charge.auto.unmatched",
      {
        amount: payload.amount,
        depositorName: payload.depositorName ?? null,
        chargeId: result.ok ? result.charge.id : null,
        error: result.ok ? null : result.error,
      },
      shop.id,
    );

    if (!result.ok) {
      await persistAsync();
      return NextResponse.json(
        { matched: false, ok: false, error: result.error },
        { status: 404 },
      );
    }

    await persistAsync();

    return NextResponse.json({
      matched: true,
      ok: true,
      charge: result.charge,
      charge_id: result.charge.id,
      authVia: auth.via,
      parsed: {
        amount: payload.amount,
        depositorName: payload.depositorName,
        fromPush: payload.fromPush,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
