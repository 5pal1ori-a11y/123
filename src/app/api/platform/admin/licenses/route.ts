import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError, unauthorized } from "@/lib/api";
import { getPlatformAdminFromRequest } from "@/lib/session-server";
import { confirmLicenseTransfer, issueLicenses, persistAsync } from "@/lib/store";
import { initStore } from "@/lib/store";

const schema = z.object({
  action: z.enum(["approve", "issue"]).optional(),
  licenseId: z.string().min(1).optional(),
  depositorName: z.string().optional(),
  plan: z.enum(["lite", "pro", "pro_max"]).optional(),
  buyerEmail: z.string().optional(),
  count: z.coerce.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  await initStore();
  const session = getPlatformAdminFromRequest(request);
  if (!session) return unauthorized();

  try {
    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("요청 값이 올바르지 않습니다.");

    const action = parsed.data.action ?? (parsed.data.plan && !parsed.data.licenseId ? "issue" : "approve");

    if (action === "issue") {
      if (!parsed.data.plan) return badRequest("플랜을 선택해 주세요.");
      const email = parsed.data.buyerEmail?.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return badRequest("이메일 형식이 올바르지 않습니다.");
      }
      const licenses = issueLicenses({
        plan: parsed.data.plan,
        buyerEmail: email || undefined,
        count: parsed.data.count ?? 1,
        issuedBy: session.username,
      });
      await persistAsync();
      return NextResponse.json({
        licenses,
        license: licenses[0],
        keys: licenses.map((l) => l.key),
      });
    }

    if (!parsed.data.licenseId) return badRequest("라이선스 ID가 필요합니다.");
    const result = confirmLicenseTransfer(
      parsed.data.licenseId,
      parsed.data.depositorName?.trim() || `관리자(${session.username})`,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    await persistAsync();
    return NextResponse.json({ license: result.license });
  } catch (err) {
    return serverError(err);
  }
}
