/**
 * 상점명·상품명 불법 콘텐츠 검열
 * 1차: 키워드 하드 차단 / 2차: Workers AI 판별 → 상점명은 관리자 검토 가능
 */

type AiRunResult = { response?: string };
type AiBinding = {
  run: (model: string, input: Record<string, unknown>) => Promise<AiRunResult | string>;
};

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

/** 명확한 불법·금지 키워드 (부분 일치, 대소문자 무시) */
const HARD_BLOCK_TERMS = [
  // 치트·핵
  "핵",
  "치트",
  "cheat",
  "hack",
  "에임봇",
  "월핵",
  "스피드핵",
  "매크로판매",
  // 계정 거래
  "랜계",
  "랜덤계정",
  "계정거래",
  "계정판매",
  "계정팝니다",
  "계정삽니다",
  "일계정",
  "본계정판매",
  "스팀계정",
  "닌텐도계정",
  "배그계정",
  "롤계정",
  "피파계정",
  // 크랙·불법복제
  "크랙",
  "crack",
  "와레즈",
  "불법복제",
  "정품우회",
  "라이센스키판매",
  // 도박·사행
  "토토",
  "불법도박",
  "카지노사이트",
  "먹튀",
  // 성인·유해
  "성인물",
  "야동",
  "딥페이크",
  // 마약·기타
  "마약",
  "필로폰",
  "대마초판매",
] as const;

/** AI 없이도 검토 큐에 올릴 애매한 표현 */
const REVIEW_HINT_TERMS = [
  "언리밋",
  "unlimited",
  "우회",
  "스푸핑",
  "spoof",
  "제재우회",
  "밴우회",
  "매크로",
  "오토클릭",
  "대리",
  "대리자",
  "부계정판매",
] as const;

export type ModerationVerdict = {
  /** allow = 통과, block = 즉시 거부, review = 생성은 하되 관리자 확인 */
  action: "allow" | "block" | "review";
  reason: string;
  source: "keyword" | "hint" | "ai" | "fallback";
  matched?: string;
};

function normalizeForScan(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s_\-./\\|()[\]{}]+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function findTerm(haystack: string, terms: readonly string[]) {
  const compact = normalizeForScan(haystack);
  const lowered = haystack.toLowerCase();
  for (const term of terms) {
    const t = term.toLowerCase();
    if (lowered.includes(t) || compact.includes(normalizeForScan(t))) {
      return term;
    }
  }
  return null;
}

async function getAiBinding(): Promise<AiBinding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const ai = (env as { AI?: AiBinding }).AI;
    return ai ?? null;
  } catch {
    return null;
  }
}

function extractText(result: AiRunResult | string | null | undefined): string {
  if (!result) return "";
  if (typeof result === "string") return result.trim();
  if (typeof result.response === "string") return result.response.trim();
  return "";
}

function parseAiJson(text: string): { verdict?: string; reason?: string } | null {
  const fenced = text.match(/\{[\s\S]*\}/);
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[0]) as { verdict?: string; reason?: string };
  } catch {
    return null;
  }
}

async function askAiModeration(
  kind: "shop" | "product",
  text: string,
): Promise<ModerationVerdict | null> {
  const ai = await getAiBinding();
  if (!ai) return null;

  const label = kind === "shop" ? "자판기 상점명(상호명/서버명)" : "판매 상품명";
  const messages = [
    {
      role: "system",
      content:
        "당신은 DOES 디지털 자판기 플랫폼의 콘텐츠 검열 AI입니다. " +
        "한국 법률·플랫폼 정책상 금지된 판매/홍보인지 판별합니다.\n" +
        "금지 예: 게임 핵·치트·월핵, 계정(랜계) 거래, 크랙·불법복제, 도박, 성인물, 마약, 사기성 우회툴.\n" +
        "허용 예: 일반 게임 아이템코드, 기프티콘, 디지털 콘텐츠, 커뮤니티 상점명(불법 암시 없음).\n" +
        '반드시 JSON만 출력: {"verdict":"allow"|"review"|"block","reason":"한국어 한줄"}\n' +
        "block = 명백한 불법, review = 애매·의심, allow = 문제 없음.",
    },
    {
      role: "user",
      content: `${label}: """${text.slice(0, 120)}"""\n판별 JSON:`,
    },
  ];

  try {
    const result = await ai.run(MODEL, {
      messages,
      max_tokens: 160,
      temperature: 0.1,
      top_p: 0.8,
    });
    const raw = extractText(result);
    const parsed = parseAiJson(raw);
    if (!parsed?.verdict) return null;
    const v = parsed.verdict.toLowerCase();
    if (v === "block" || v === "review" || v === "allow") {
      return {
        action: v,
        reason: (parsed.reason || "").trim() || (v === "allow" ? "통과" : "AI 검열"),
        source: "ai",
      };
    }
  } catch {
    return null;
  }
  return null;
}

function keywordGate(text: string): ModerationVerdict | null {
  const hard = findTerm(text, HARD_BLOCK_TERMS);
  if (hard) {
    return {
      action: "block",
      reason: `금지된 표현이 포함되어 있어요: 「${hard}」`,
      source: "keyword",
      matched: hard,
    };
  }
  return null;
}

function hintReview(text: string): ModerationVerdict | null {
  const hint = findTerm(text, REVIEW_HINT_TERMS);
  if (hint) {
    return {
      action: "review",
      reason: `의심 표현「${hint}」— 관리자 확인이 필요해요.`,
      source: "hint",
      matched: hint,
    };
  }
  return null;
}

/**
 * 상점명 검열: 키워드 차단 → AI → (힌트 시 review)
 * block: 생성 거부 / review: 생성하되 정지+관리자 큐 / allow: 정상
 */
export async function moderateShopName(name: string): Promise<ModerationVerdict> {
  const text = name.trim();
  if (!text) {
    return { action: "block", reason: "상호명을 입력해 주세요.", source: "fallback" };
  }

  const hard = keywordGate(text);
  if (hard) return hard;

  const ai = await askAiModeration("shop", text);
  if (ai) {
    if (ai.action === "allow") {
      const hint = hintReview(text);
      return hint ?? ai;
    }
    return ai;
  }

  return hintReview(text) ?? { action: "allow", reason: "통과", source: "fallback" };
}

/**
 * 상품명 검열: 불법이면 무조건 block (상품은 검토 대기 없이 거부)
 */
export async function moderateProductText(
  name: string,
  description?: string | null,
): Promise<ModerationVerdict> {
  const combined = `${name.trim()} ${description?.trim() || ""}`.trim();
  if (!name.trim()) {
    return { action: "block", reason: "상품명을 입력해 주세요.", source: "fallback" };
  }

  const hard = keywordGate(combined);
  if (hard) return hard;

  const ai = await askAiModeration("product", combined.slice(0, 200));
  if (ai) {
    if (ai.action === "allow") return ai;
    // 상품은 review도 생성 거부로 처리
    return {
      action: "block",
      reason:
        ai.action === "review"
          ? `상품명 검토가 필요해 등록할 수 없어요. ${ai.reason}`
          : ai.reason,
      source: ai.source,
      matched: ai.matched,
    };
  }

  const hint = hintReview(combined);
  if (hint) {
    return {
      action: "block",
      reason: `의심되는 상품명이라 등록할 수 없어요. ${hint.reason}`,
      source: "hint",
      matched: hint.matched,
    };
  }

  return { action: "allow", reason: "통과", source: "fallback" };
}

export function moderationUserMessage(v: ModerationVerdict, kind: "shop" | "product") {
  if (v.action === "allow") return null;
  if (kind === "shop" && v.action === "review") {
    return `상점명이 정책 검토 대상으로 분류됐어요. 상점은 생성되지만 관리자 승인 전까지 비공개(정지) 상태입니다. 사유: ${v.reason}`;
  }
  return v.reason;
}
