/**
 * 본인인증 (KYC) — 신분증 사진 업로드 → 관리자 검토 → 승인/거절.
 *
 * 손님이 신분증(주민증·운전면허·여권) 사진을 올리면 관리자가 보고 승인한다.
 * 토스 같은 외부 계약이 필요 없어서 바로 쓸 수 있다.
 *
 * - 인증 기록: KV(idv:v1:<shopId>)  — 상태(pending/approved/rejected) + 메타
 * - 업로드 이미지: KV(idvimg:v1:<shopId>:<recordId>)  — base64 (관리자만 조회)
 *
 * 민감정보(신분증)라 이미지는 관리자만 보고, 승인 뒤 지우거나 재인증 시 교체한다.
 */
import { kvGetJson, kvGetRaw, kvPutJson, kvPutRaw, withLock } from "@/lib/world/kv";

export type IdentityStatus = "pending" | "approved" | "rejected";

export type IdentityRecord = {
  id: string;
  shopId: string;
  userId: string;
  status: IdentityStatus;
  /** 손님이 적은 실명 (대조용) */
  realName: string | null;
  /** 업로드한 이미지의 KV 키 · 콘텐츠 타입 */
  imageKey: string | null;
  imageType: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectReason: string | null;
};

const key = (shopId: string) => `idv:v1:${shopId}`;
const imgKey = (shopId: string, recordId: string) => `idvimg:v1:${shopId}:${recordId}`;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB (base64 디코딩 기준)

export async function listIdentityRecords(shopId: string) {
  return (await kvGetJson<IdentityRecord[]>(key(shopId))) ?? [];
}

export async function getIdentityRecord(shopId: string, userId: string) {
  return (await listIdentityRecords(shopId)).find((r) => r.userId === userId) ?? null;
}

/** 승인된 사람만 verified */
export async function isUserVerified(shopId: string, userId: string) {
  const r = await getIdentityRecord(shopId, userId);
  return r?.status === "approved";
}

/** 본인인증을 요구할지 — 상점 설정 토글만 보면 된다 (업로드 방식은 외부 키 불필요) */
export async function identityVerifyRequired(shopId: string): Promise<boolean> {
  try {
    const { getShopSettings } = await import("@/lib/store");
    return Boolean(getShopSettings(shopId)?.identityVerifyEnabled);
  } catch {
    return false;
  }
}

function newId() {
  return `idv_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

async function upsert(rec: IdentityRecord) {
  return withLock(key(rec.shopId), async () => {
    const list = await listIdentityRecords(rec.shopId);
    const i = list.findIndex((r) => r.userId === rec.userId);
    if (i >= 0) list[i] = rec;
    else list.unshift(rec);
    await kvPutJson(key(rec.shopId), list.slice(0, 5000));
    return rec;
  });
}

/**
 * 손님이 신분증 사진을 올린다. 기존에 거절/미승인 기록이 있으면 교체하고 pending 으로.
 * imageBase64: data URL 이 아닌 순수 base64 (콘텐츠 타입은 따로 받는다)
 */
export async function submitUploadVerification(
  shopId: string,
  userId: string,
  input: { imageBase64: string; imageType: string; realName?: string },
): Promise<IdentityRecord> {
  const b64 = (input.imageBase64 || "").trim();
  if (!b64) throw new Error("신분증 사진을 올려 주세요.");
  if (!/^image\/(png|jpe?g|webp)$/i.test(input.imageType)) throw new Error("이미지 파일(JPG·PNG·WEBP)만 올릴 수 있어요.");
  // base64 길이로 대략적인 바이트 수 추정
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) throw new Error("사진이 너무 커요. 4MB 이하로 올려 주세요.");

  const existing = await getIdentityRecord(shopId, userId);
  if (existing?.status === "approved") throw new Error("이미 본인인증이 완료된 계정이에요.");

  const recordId = existing?.id ?? newId();
  await kvPutRaw(imgKey(shopId, recordId), b64);

  const rec: IdentityRecord = {
    id: recordId,
    shopId,
    userId,
    status: "pending",
    realName: (input.realName || "").trim().slice(0, 40) || null,
    imageKey: imgKey(shopId, recordId),
    imageType: input.imageType,
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    rejectReason: null,
  };
  return upsert(rec);
}

/* ── 관리자 ── */

export async function listPendingVerifications(shopId: string) {
  return (await listIdentityRecords(shopId)).filter((r) => r.status === "pending");
}

export async function getVerificationById(shopId: string, recordId: string) {
  return (await listIdentityRecords(shopId)).find((r) => r.id === recordId) ?? null;
}

export async function getVerificationImage(shopId: string, recordId: string): Promise<{ base64: string; type: string } | null> {
  const rec = await getVerificationById(shopId, recordId);
  if (!rec?.imageKey) return null;
  const b64 = await kvGetRaw(rec.imageKey);
  if (!b64) return null;
  return { base64: b64, type: rec.imageType || "image/jpeg" };
}

export async function reviewVerification(
  shopId: string,
  recordId: string,
  adminId: string,
  approve: boolean,
  reason?: string,
): Promise<IdentityRecord> {
  return withLock(key(shopId), async () => {
    const list = await listIdentityRecords(shopId);
    const rec = list.find((r) => r.id === recordId);
    if (!rec) throw new Error("인증 신청을 찾을 수 없어요.");
    rec.status = approve ? "approved" : "rejected";
    rec.reviewedAt = new Date().toISOString();
    rec.reviewedBy = adminId;
    rec.rejectReason = approve ? null : (reason || "").trim().slice(0, 200) || "반려되었습니다.";
    // 승인되면 민감한 신분증 이미지는 지운다 (개인정보 최소 보관)
    if (approve && rec.imageKey) {
      await kvPutRaw(rec.imageKey, "").catch(() => {});
      rec.imageKey = null;
    }
    await kvPutJson(key(shopId), list.slice(0, 5000));
    return { ...rec };
  });
}

/** 인증 기록·이미지 삭제 (재인증 필요 시) */
export async function clearIdentityRecord(shopId: string, userId: string) {
  return withLock(key(shopId), async () => {
    const list = await listIdentityRecords(shopId);
    const rec = list.find((r) => r.userId === userId);
    if (rec?.imageKey) await kvPutRaw(rec.imageKey, "").catch(() => {});
    const next = list.filter((r) => r.userId !== userId);
    await kvPutJson(key(shopId), next);
    return list.length !== next.length;
  });
}
