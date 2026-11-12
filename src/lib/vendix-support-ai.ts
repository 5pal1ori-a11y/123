/**
 * DOES 전용 1차 문의 AI
 * Cloudflare Workers AI로 문의 흐름을 읽고 상황에 맞게 창의적으로 답변합니다.
 * AI 바인딩이 없으면 로컬 폴백을 사용합니다.
 */

type ThreadTurn = {
  body: string;
  aiReply?: string | null;
  reply?: string | null;
};

type AiRunResult = { response?: string };

type AiBinding = {
  run: (
    model: string,
    input: Record<string, unknown>,
  ) => Promise<AiRunResult | string>;
};

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const VENDIX_KNOWLEDGE = `
DOES는 디지털 자판기/포인트 상점 플랫폼입니다. 상점 관리자가 서버(플랫폼) 관리자에게 문의하는 채널입니다.

핵심 제품 지식:
- 포인트 충전: 계좌이체 / 문화상품권 / 코인(NOWPayments). 대기 충전은 신청 후 10분이 지나면 만료됩니다.
- 관리자 승인: 상점 관리자 → 결제·충전 → 대기충전. 완료 내역은 충전로그에서 확인.
- 자동충전: Pushbullet·입금 알림 연동. 입금자명·금액·참조코드가 일치해야 합니다.
- 라이선스: Basic/Pro 등 플랜, 만료일, 키로 연장(결제·충전 → 라이선스). Pro에서 Discord 메인 봇 자판기, Pro Max에서 개인봇.
- Discord: /자판기, 길드·채널 연결, 유저 Discord 계정 연동, OAuth 리다이렉트 도메인 확인.
- 상품·재고: 코드 인벤토리, 재고 0이면 구매 불가, 재고 부족 알림 임계값 설정.
- 배너 광고: 상점 내 유저 신청 → 관리자 승인/거절/게시중단.
- 계정: 상점 관리자와 플랫폼(DOES) 관리자 계정은 별개.
- 인프라는 Cloudflare Workers + KV. 일시 오류는 새로고침/캐시로 해결되는 경우가 많음.

답변 원칙:
- 한국어로, 친절하고 구체적이며 자연스럽게 씁니다.
- 문의문 그대로를 요약·인용하며 "무엇을 원하는지"를 먼저 짚습니다.
- 정해진 템플릿을 복사하지 말고, 이번 문의에만 맞는 새 문장으로 답합니다.
- 관련 지식만 쓰고, 모르면 추측하지 말고 확인이 필요하다고 말합니다.
- 필요하면 다음 확인 질문 1~2개만 짧게 덧붙입니다.
- 마지막에 "부족하면 추가 남겨 주세요. 서버 관리자가 이어서 답변합니다"를 한 줄로 넣습니다.
- 마크다운 제목(##)이나 이모지는 쓰지 않습니다. 불릿은 · 만 사용합니다.
- 길이: 대략 120~280자 분량의 본문 + 짧은 꼬리말. 너무 길게 쓰지 마세요.
`.trim();

function extractText(result: AiRunResult | string | null | undefined): string {
  if (!result) return "";
  if (typeof result === "string") return result.trim();
  if (typeof result.response === "string") return result.response.trim();
  return "";
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

function buildThreadContext(recent?: ThreadTurn[]) {
  if (!recent?.length) return "(이전 대화 없음 — 첫 문의)";
  return recent
    .slice(0, 6)
    .reverse()
    .map((t, i) => {
      const parts = [`#${i + 1} 관리자: ${t.body.trim()}`];
      if (t.aiReply?.trim()) parts.push(`AI: ${t.aiReply.trim()}`);
      if (t.reply?.trim()) parts.push(`사람 관리자: ${t.reply.trim()}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

/** Workers AI 실패 시: 문의 문장에 맞춰 조합하는 폴백 (고정 FAQ 복붙 금지) */
function fallbackCreativeReply(body: string, shopName?: string): string {
  const raw = body.trim();
  const text = raw.toLowerCase();
  const name = shopName ? `${shopName} 관리자님` : "관리자님";

  const topics: { hit: boolean; label: string; tip: string }[] = [
    {
      hit: /충전|입금|포인트|승인|만료|10분/.test(text),
      label: "포인트 충전",
      tip: "신청 후 10분 안에 입금·승인이 되어야 하고, 만료되면 새로 신청해야 해요. 대기충전·충전로그에서 상태를 확인해 보세요.",
    },
    {
      hit: /라이선스|플랜|구독|연장|프로|베이직/.test(text),
      label: "라이선스·플랜",
      tip: "결제·충전 → 라이선스에서 키로 연장할 수 있어요. 키가 거절되면 사용 여부·오타를 확인한 뒤 키 전문을 남겨 주세요.",
    },
    {
      hit: /디스코드|discord|봇|길드|자판기/.test(text),
      label: "Discord 봇",
      tip: "Pro 이상에서 봇 연결이 가능해요. 길드·채널·OAuth 도메인과 유저 Discord 연동 상태를 순서대로 점검해 보세요.",
    },
    {
      hit: /배너|광고/.test(text),
      label: "배너 광고",
      tip: "상점 배너는 관리자 → 배너 광고에서 승인·거절·게시중단하면 됩니다.",
    },
    {
      hit: /상품|재고|코드|인벤토리/.test(text),
      label: "상품·재고",
      tip: "재고 코드를 채운 뒤 상품이 활성인지 확인해 주세요. 재고 0이면 구매가 막힙니다.",
    },
    {
      hit: /로그인|비밀번호|계정|세션/.test(text),
      label: "로그인·계정",
      tip: "상점 관리자 계정과 DOES 플랫폼 계정은 다릅니다. 상점 관리자 URL에서 다시 로그인해 보시고, 안 되면 슬러그를 알려 주세요.",
    },
    {
      hit: /오류|에러|500|접속|도메인|cloudflare/.test(text),
      label: "접속·오류",
      tip: "일시 오류면 새로고침·캐시 삭제를 먼저 시도해 주세요. URL·시각·에러 문구를 남겨 주시면 서버에서 이어서 봅니다.",
    },
  ];

  const matched = topics.filter((t) => t.hit);
  const snippet = raw.length > 80 ? `${raw.slice(0, 80)}…` : raw;

  const openers = [
    `${name}, 말씀하신 내용을 이렇게 이해했어요.`,
    `${name}, 문의 흐름을 보고 바로 짚어드릴게요.`,
    `${name}, 남겨 주신 상황을 기준으로 안내드릴게요.`,
  ];
  const opener = openers[Math.abs(hash(raw)) % openers.length];

  let mid: string;
  if (matched.length === 0) {
    mid =
      `「${snippet}」에 대해 지금은 화면·권한·설정 중 어디가 막혔는지가 핵심으로 보여요. ` +
      `관련 화면의 정확한 문구와 재현 순서를 조금 더 알려 주시면 바로 이어서 좁혀 볼게요.`;
  } else if (matched.length === 1) {
    const t = matched[0];
    mid = `지금은 ${t.label} 이슈로 보여요. ${t.tip}`;
  } else {
    mid =
      `여러 주제가 섞여 있어서, 우선 ${matched.map((m) => m.label).join(" · ")} 순으로 보면 좋아요.\n` +
      matched.map((m) => `· ${m.label}: ${m.tip}`).join("\n");
  }

  return (
    `${opener}\n\n${mid}\n\n` +
    `이 답변으로 부족하면 추가 내용을 남겨 주세요. 서버 관리자가 확인 후 이어서 답변합니다.`
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export type GenerateVendixSupportInput = {
  body: string;
  shopName?: string;
  shopSlug?: string;
  /** 같은 상점의 최근 문의(최신 순). 흐름 파악용 */
  recentThread?: ThreadTurn[];
};

/** DOES 특화 1차 답변 생성 (가능하면 Workers AI) */
export async function generateVendixSupportReply(
  input: GenerateVendixSupportInput | string,
  shopNameLegacy?: string,
): Promise<string> {
  const opts: GenerateVendixSupportInput =
    typeof input === "string"
      ? { body: input, shopName: shopNameLegacy }
      : input;

  const body = opts.body.trim();
  if (!body) {
    return fallbackCreativeReply("문의 내용이 비어 있어요.", opts.shopName);
  }

  const ai = await getAiBinding();
  if (!ai) {
    return fallbackCreativeReply(body, opts.shopName);
  }

  const shopLine = [
    opts.shopName ? `상점명: ${opts.shopName}` : null,
    opts.shopSlug ? `슬러그: ${opts.shopSlug}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const messages = [
    {
      role: "system",
      content:
        "당신은 DOES 플랫폼 전용 고객 안내 AI입니다. " +
        "상점 관리자 문의를 읽고, 제품 지식을 바탕으로 창의적이고 맞춤형인 한국어 답변을 작성합니다.\n\n" +
        VENDIX_KNOWLEDGE,
    },
    {
      role: "user",
      content:
        `${shopLine ? `문의 상점: ${shopLine}\n\n` : ""}` +
        `이전 대화 흐름:\n${buildThreadContext(opts.recentThread)}\n\n` +
        `이번 새 문의:\n${body}\n\n` +
        `위 흐름을 반영해, 이번 문의에만 맞는 새로운 답변을 작성하세요. ` +
        `이전 AI 답변을 그대로 반복하지 마세요.`,
    },
  ];

  try {
    const result = await ai.run(MODEL, {
      messages,
      max_tokens: 512,
      temperature: 0.85,
      top_p: 0.92,
    });
    const text = extractText(result);
    if (text.length >= 24) {
      // strip accidental markdown headings / code fences
      return text
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^```[\s\S]*?```$/gm, "")
        .trim();
    }
  } catch {
    // fall through
  }

  return fallbackCreativeReply(body, opts.shopName);
}
