import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/api";
import { getPlatformAdminFromRequest } from "@/lib/session-server";
import {
  createPlatformNotice,
  deletePlatformNotice,
  listPlatformNotices,
  updatePlatformNotice,
} from "@/lib/store";
import { initStore } from "@/lib/store";

export async function GET() {
  await initStore();
  return NextResponse.json({ notices: listPlatformNotices() });
}

const createSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(8000),
  pinned: z.boolean().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(8000).optional(),
  pinned: z.boolean().optional(),
});

export async function POST(request: Request) {
  await initStore();
  const session = getPlatformAdminFromRequest(request);
  if (!session) return unauthorized();

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return badRequest("공지 내용을 확인하세요.");

  const notice = createPlatformNotice(parsed.data.title, parsed.data.body, parsed.data.pinned ?? false);
  return NextResponse.json({ notice }, { status: 201 });
}

export async function PATCH(request: Request) {
  await initStore();
  const session = getPlatformAdminFromRequest(request);
  if (!session) return unauthorized();

  const json = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return badRequest("공지 내용을 확인하세요.");

  const { id, ...patch } = parsed.data;
  if (patch.title === undefined && patch.body === undefined && patch.pinned === undefined) {
    return badRequest("수정할 항목이 없어요.");
  }

  const notice = updatePlatformNotice(id, patch);
  if (!notice) return badRequest("공지를 찾을 수 없어요.");

  return NextResponse.json({ notice });
}

export async function DELETE(request: Request) {
  await initStore();
  const session = getPlatformAdminFromRequest(request);
  if (!session) return unauthorized();

  const json = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) return badRequest("요청을 확인하세요.");

  if (!deletePlatformNotice(parsed.data.id)) {
    return badRequest("공지를 찾을 수 없어요.");
  }

  return NextResponse.json({ ok: true });
}
