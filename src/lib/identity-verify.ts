/**
 * 본인인증 (KYC) — 토스페이먼츠 공식 본인인증 위젯 연동.
 *
 * ⚠️ 이건 토스가 승인한 "정식" 본인인증 경로예요. (NICE/대법원을 몰래 흉내 내는 스크래핑과 전혀 다름)
 *    손님이 토스 공식 팝업에서 직접 인증 → 토스가 결과 토큰 발급 → 서버가 비밀키로 결과 조회.
 *
 * 켜는 법: 상점 설정에서 identityVerifyEnabled = true + 토스 키(env) 설정.
 *   - TOSS_CLIENT_KEY  (브라우저에서 위젯 로드용 · 공개 가능)
 *   - TOSS_SECRET_KEY  (서버에서 결과 조회용 · 절대 노출 금지)
 *
 * 인증 기록은 KV(idv:v1:<shopId>)에 둔다 — 상점 DB(vendix:db)를 키우지 않게.
 *
 * ⚠️ 실제 토스 가맹점 키를 연결할 때, 아래 TOSS_CONFIRM_* 상수(엔드포인트·필드명)를
 *    최신 토스 문서(docs.tosspayments.com/guides/v2/identity-verification)로 한 번 대조해 주세요.
 *    토스 표준 confirm 패턴(결제 승인과 동일: Basic 인증 + secretKey)에 맞춰 두었어요.
 */
import { kvGetJson, kvPutJson, withLock } from "@/lib/world/kv";

/* ── 토스 API (실제 키 연결 시 최신 문서로 대조) ── */
const TOSS_API_BASE = "https://api.tosspayments.com";
/** 본인인증 결과 조회 — POST {base}/v1/identity-verification/{id}/confirm */
const TOSS_CONFIRM_PATH = (id: string) => `/v1/identity-verification/${encodeURIComponent(id)}/confirm`;

export type IdentityRecord = {
  shopId: string;
  userId: string;
  /** 토스가 돌려준 인증 식별자 */
  verificationId: string;
  /** 인증으로 확인된 정보 (최소만 저장 · CI는 중복가입 판별용 해시값) */
  name: string | null;
  phone: string | null;
  birthday: string | null;
  gender: string | null;
  /** 연계정보(CI) — 같은 사람이 여러 계정 쓰는지 판별. 원문 대신 해시로 보관 */
  ciHash: string | null;
  provider: "toss";
  verifiedAt: string;
};

const key = (shopId: string) => `idv:v1:${shopId}`;

export async function listIdentityRecords(shopId: string) {
  return (await kvGetJson<IdentityRecord[]>(key(shopId))) ?? [];
}

export async function getIdentityRecord(shopId: string, userId: string) {
  return (await listIdentityRecords(shopId)).find((r) => r.userId === userId) ?? null;
}

export async function isUserVerified(shopId: string, userId: string) {
  return Boolean(await getIdentityRecord(shopId, userId));
}

/** 같은 CI(사람)로 이미 인증한 다른 계정이 있는지 — 중복가입 방지 */
export async function findDuplicateByCi(shopId: string, ciHash: string, exceptUserId: string) {
  if (!ciHash) return null;
  return (await listIdentityRecords(shopId)).find((r) => r.ciHash === ciHash && r.userId !== exceptUserId) ?? null;
}

async function saveRecord(rec: IdentityRecord) {
  return withLock(key(rec.shopId), async () => {
    const list = await listIdentityRecords(rec.shopId);
    const i = list.findIndex((r) => r.userId === rec.userId);
    if (i >= 0) list[i] = rec;
    else list.unshift(rec);
    await kvPutJson(key(rec.shopId), list.slice(0, 5000));
    return rec;
  });
}

/* ── 설정 · 자격증명 ── */

export async function tossIdentityConfig() {
  let clientKey = "";
  let secretKey = "";
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as { TOSS_CLIENT_KEY?: string; TOSS_SECRET_KEY?: string };
    clientKey = e.TOSS_CLIENT_KEY?.trim() || "";
    secretKey = e.TOSS_SECRET_KEY?.trim() || "";
  } catch {
    /* local */
  }
  clientKey ||= process.env.TOSS_CLIENT_KEY?.trim() || "";
  secretKey ||= process.env.TOSS_SECRET_KEY?.trim() || "";
  return { clientKey, secretKey, configured: Boolean(clientKey && secretKey) };
}

/** 본인인증을 요구할지 — 상점 설정 토글 + 키가 모두 있어야 켜진다 */
export async function identityVerifyRequired(shopId: string): Promise<boolean> {
  try {
    const { getShopSettings } = await import("@/lib/store");
    const s = getShopSettings(shopId);
    if (!s?.identityVerifyEnabled) return false;
    const cfg = await tossIdentityConfig();
    return cfg.configured;
  } catch {
    return false;
  }
}

/* ── 토스 결과 조회 · 저장 ── */

async function sha256Hex(input: string) {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(input).digest("hex");
}

/**
 * 손님이 토스 팝업에서 인증을 마치면 받은 verificationId 로 서버가 결과를 조회해 저장한다.
 * 성공하면 IdentityRecord, 실패하면 Error 를 던진다.
 */
export async function confirmTossIdentity(shopId: string, userId: string, verificationId: string): Promise<IdentityRecord> {
  if (!verificationId || !/^[\w-]{1,100}$/.test(verificationId)) throw new Error("인증 식별자가 올바르지 않아요.");
  const cfg = await tossIdentityConfig();
  if (!cfg.configured) throw new Error("본인인증이 아직 설정되지 않았어요. (토스 키 미설정)");

  // Basic 인증: base64(secretKey + ":")  — 토스 결제 승인과 동일한 방식
  const auth = Buffer.from(`${cfg.secretKey}:`).toString("base64");
  const res = await fetch(`${TOSS_API_BASE}${TOSS_CONFIRM_PATH(verificationId)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data) {
    const msg = (data?.message as string) || `토스 응답 오류 (${res.status})`;
    throw new Error(msg);
  }

  // 토스 응답에서 확인된 본인 정보 추출 (필드명은 토스 문서 기준 · 키 연결 시 대조)
  const name = (data.name as string) ?? (data.customerName as string) ?? null;
  const phone = (data.phone as string) ?? (data.phoneNumber as string) ?? (data.mobilePhone as string) ?? null;
  const birthday = (data.birthday as string) ?? (data.birthDate as string) ?? null;
  const gender = (data.gender as string) ?? null;
  const ci = (data.ci as string) ?? (data.connectionInformation as string) ?? "";

  const rec: IdentityRecord = {
    shopId,
    userId,
    verificationId,
    name,
    phone,
    birthday,
    gender,
    ciHash: ci ? await sha256Hex(ci) : null,
    provider: "toss",
    verifiedAt: new Date().toISOString(),
  };
  return saveRecord(rec);
}

/** 관리자/시스템이 수동으로 인증 기록을 지운다 (재인증 필요 시) */
export async function clearIdentityRecord(shopId: string, userId: string) {
  return withLock(key(shopId), async () => {
    const list = await listIdentityRecords(shopId);
    const next = list.filter((r) => r.userId !== userId);
    await kvPutJson(key(shopId), next);
    return list.length !== next.length;
  });
}
