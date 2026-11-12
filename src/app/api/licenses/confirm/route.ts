import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, serverError, unauthorized } from "@/lib/api";
import { getPlatformAdminFromRequest } from "@/lib/session-server";
import { confirmLicenseTransfer } from "@/lib/store";
import { initStore } from "@/lib/store";

const schema = z.object({
  licenseId: z.string().min(1),
  depositorName: z.string().min(1),
});

export async function POST(request: Request) {
  await initStore();
  const session = getPlatformAdminFromRequest(request);
  if (!session) return unauthorized();

  try {
    const json = await request.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) return badRequest("입금자명을 입력해주세요.");

    const result = confirmLicenseTransfer(
      parsed.data.licenseId,
      parsed.data.depositorName,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ license: result.license });
  } catch (err) {
    return serverError(err);
  }
}