/**
 * 상점 문의 AI — 검색은 서버가 하고, 모델은 그 결과로만 사람 말을 씁니다.
 */

import {
  getShopById,
  getShopSettings,
  listNotices,
  listProducts,
} from "@/lib/store";
import { listCategories } from "@/lib/store-admin";
import type { ProductWithStock, ShopInquiryMessage, ShopSettings } from "@/lib/types";

type AiBinding = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  websearch?: (req: { gatewayId: string; query: string; limit?: number }) => Promise<Response>;
};

const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const FAST_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const SYNONYMS: Record<string, string[]> = {
  충전: ["포인트", "입금", "계좌", "상품권", "코인", "입금자"],
  포인트: ["충전", "잔액", "입금"],
  입금: ["충전", "계좌", "입금자"],
  인증: ["verify", "복구", "복구키", "캡차"],
  복구: ["인증", "복구키", "verify"],
  재고: ["품절", "재입고", "남은", "자판기"],
  자판기: ["재고", "상품", "구매"],
  지급: ["코드", "수동", "자동", "dm", "수령"],
  코드: ["지급", "자동"],
  구매: ["쇼핑", "상품", "가격", "결제"],
  가격: ["얼마", "원", "포인트"],
  랜덤박스: ["상자", "선물", "잭팟", "포인트", "gift"],
  상자: ["랜덤박스", "선물", "잭팟"],
  마인크래프트: ["마크", "minecraft", "계정", "mc"],
  마크: ["마인크래프트", "minecraft"],
  컴프야: ["컴투스프로야구", "컴프야2025", "프로야구", "리세마라"],
  리세: ["리세마라", "계정초기화", "다시키우기"],
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function stripThink(text: string) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();
}

const TOOL_NAME_RE = /(?:web_search|search_shop|list_products|get_product|shop_howto)/i;

function looksLikeToolDump(text: string) {
  const t = text.trim();
  if (!t) return true;
  if (TOOL_NAME_RE.test(t) && /[(\uFF08{]/.test(t)) return true;
  if (/^\s*\{[\s\S]*"name"\s*:\s*"(web_search|search_shop)/.test(t)) return true;
  if (/tool_call|function_call|arguments/i.test(t) && TOOL_NAME_RE.test(t)) return true;
  return false;
}

function sanitizeAnswer(text: string) {
  let t = stripThink(text);
  t = t.replace(/(?:web_search|search_shop|list_products|get_product|shop_howto)\s*\([^)]*\)/gi, "");
  t = t.replace(/```[\s\S]*?```/g, "").trim();
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function extractText(result: unknown): string {
  if (!result) return "";
  if (typeof result === "string") return stripThink(result);
  const obj = asRecord(result);
  if (!obj) return "";
  if (typeof obj.response === "string") return stripThink(obj.response);
  const choices = obj.choices;
  if (Array.isArray(choices) && choices[0]) {
    const c0 = asRecord(choices[0]);
    const msg = c0 ? asRecord(c0.message) : null;
    const content = msg && typeof msg.content === "string" ? msg.content : "";
    const text = c0 && typeof c0.text === "string" ? c0.text : "";
    return stripThink(content || text);
  }
  return "";
}

async function getAiBinding(): Promise<AiBinding | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return ((env as { AI?: AiBinding }).AI as AiBinding) ?? null;
  } catch {
    return null;
  }
}

/** Claude API 키 (Cloudflare Secret ANTHROPIC_API_KEY). 없으면 Workers AI 로 답한다 */
async function getAnthropicKey() {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const e = env as Record<string, string | undefined>;
    return { key: (e.ANTHROPIC_API_KEY ?? "").trim(), model: (e.CLAUDE_MODEL ?? "").trim() || "claude-sonnet-5-5" };
  } catch {
    return { key: (process.env.ANTHROPIC_API_KEY ?? "").trim(), model: process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-5-5" };
  }
}

async function askClaude(system: string, user: string): Promise<string | null> {
  const { key, model } = await getAnthropicKey();
  if (!key.startsWith("sk-ant-")) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 600, temperature: 0.4, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.log("claude reply failed", res.status);
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim() || null;
  } catch (err) {
    console.log("claude reply error", String(err));
    return null;
  }
}

function expandTokens(query: string) {
  const cleaned = query
    .toLowerCase()
    .replace(/아니야|아니라|아닙니다|아니에요|아님|말고|그건|그게|그거|이건/g, " ");
  const base = cleaned
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 16);
  const extra: string[] = [];
  for (const tok of base) {
    const syn = SYNONYMS[tok];
    if (syn) extra.push(...syn);
  }
  return [...new Set([...base, ...extra])].slice(0, 28);
}

function scoreHit(hay: string, tokens: string[]) {
  const t = hay.toLowerCase();
  return tokens.reduce((n, tok) => n + (tok && t.includes(tok) ? 1 : 0), 0);
}

function productLine(p: ProductWithStock) {
  const kind = p.listingKind === "individual" ? "개별" : "자판기";
  const fulfill = p.fulfillment === "manual" ? "수동지급" : "자동지급";
  const stock = p.mfaProduct ? `MFA재고 ${p.mfaStock ?? "?"}` : `재고 ${p.availableCount}`;
  return `${p.name} · ${p.category || "미분류"} · ${p.price.toLocaleString("ko-KR")}원 · ${stock} · ${kind}/${fulfill}${
    p.description ? ` · ${p.description.slice(0, 120)}` : ""
  }${p.manualNotice ? ` · 안내:${p.manualNotice.slice(0, 80)}` : ""}`;
}

export function searchShopKnowledge(shopId: string, query: string) {
  const tokens = expandTokens(query);
  const hits: { source: string; title: string; snippet: string; score: number }[] = [];
  if (!tokens.length) return hits;

  for (const p of listProducts(shopId)) {
    const blob = `${p.name} ${p.category} ${p.description} ${(p.tags ?? []).join(" ")} ${p.listingKind ?? ""} ${p.fulfillment ?? ""} ${p.manualNotice ?? ""}`;
    let score = scoreHit(blob, tokens);
    if (tokens.some((t) => p.name.toLowerCase().includes(t))) score += 4;
    if (score > 0) hits.push({ source: "상품", title: p.name, snippet: productLine(p), score });
  }
  for (const n of listNotices(shopId)) {
    const score = scoreHit(`${n.title} ${n.body}`, tokens);
    if (score > 0) hits.push({ source: "공지", title: n.title, snippet: n.body.slice(0, 200), score });
  }
  for (const c of listCategories(shopId)) {
    const score = scoreHit(c.name, tokens);
    if (score > 0) {
      hits.push({
        source: "카테고리",
        title: c.name,
        snippet: `${c.name} 분류는 쇼핑 탭에서 필터할 수 있어요.`,
        score,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 10);
}

function collectSearchQueries(query: string, messages: ShopInquiryMessage[]) {
  const users = messages.filter((m) => m.from === "user").map((m) => m.body.trim()).filter(Boolean);
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length >= 2) out.push(t);
  };
  push(query);
  for (const u of users.slice(-4)) {
    if (!isIdentityQuery(u)) push(u);
  }
  if (/아니|말고|아님/.test(query)) {
    const prev = users.length >= 2 ? users[users.length - 2] : "";
    if (prev) push(prev);
  }
  if (/컴프야|리세/.test(query)) push("컴투스프로야구 리세마라 방법");
  push(query.replace(/아니야|아니라|아닙니다|아니에요|아님|말고|그건|그게/g, " "));
  return [...new Set(out)].slice(0, 6);
}

function mergeHits(shopId: string, queries: string[]) {
  const map = new Map<string, { source: string; title: string; snippet: string; score: number }>();
  for (const q of queries) {
    for (const h of searchShopKnowledge(shopId, q)) {
      const key = `${h.source}:${h.title}`;
      const prev = map.get(key);
      if (!prev || h.score > prev.score) map.set(key, h);
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, 12);
}

function catalogSnapshot(shopId: string) {
  return listProducts(shopId)
    .filter((p) => p.active)
    .slice(0, 24)
    .map((p) => `- ${productLine(p)}`)
    .join("\n");
}

function howto(shopId: string, topic: string, settings: ShopSettings) {
  const t = topic.toLowerCase();
  if (/충전|입금|포인트|상품권|코인/.test(t)) {
    const methods = ["계좌이체"];
    if (settings.cultureGiftEnabled) methods.push("문화상품권");
    if (settings.nowpaymentsEnabled) methods.push("코인");
    return `충전: 대시보드 → 충전. 최소 ${settings.minChargeAmount.toLocaleString("ko-KR")}원. 방법: ${methods.join(", ")}. 입금자명·금액이 맞아야 포인트 반영.`;
  }
  if (/인증|복구|verify/.test(t)) {
    return `인증·복구키: /verify. Discord 로그인하면 상점 계정과 서버 인증이 같이 됩니다. 쇼핑은 대시보드.`;
  }
  if (/지급|코드|수령|dm/.test(t)) {
    return `자동지급은 결제 직후 코드. 수동지급은 지급대기 → 관리자 확인 → 사이트 + 디스코드 DM.`;
  }
  if (/구매|쇼핑|자판기/.test(t)) {
    return `쇼핑 탭에서 카테고리 골라 포인트로 구매. 자판기/개별, 자동/수동은 상품마다 다름.\n${catalogSnapshot(shopId)}`;
  }
  if (/랜덤박스|상자|잭팟|gift/.test(t)) {
    return `랜덤박스는 리더보드 아래 또는 doesmc.xyz/gift 에서 하루 한 번. 0~3,000원, 1,200원 이상은 잭팟.`;
  }
  return "";
}

function formatHits(hits: ReturnType<typeof searchShopKnowledge>) {
  if (!hits.length) return "(상점 검색 결과 없음)";
  return hits.map((h) => `- [${h.source}] ${h.title}: ${h.snippet}`).join("\n");
}

function isIdentityQuery(query: string) {
  const q = query.replace(/\s+/g, "").toLowerCase();
  return /^(넌누구니|넌누구야|너는누구|너누구|자기소개|whoareyou|whatareyou)\??$/.test(q)
    || /너는\s*누구|넌\s*누구|자기\s*소개/.test(query);
}

function identityReply(shopName: string) {
  return `저는 ${shopName} 안내 AI예요. 상품·충전·인증·지급이랑, 관련된 건 검색해서 알려드려요. 관리자가 채팅에 들어오면 제가 꺼집니다. 뭐가 궁금하세요?`;
}

async function duckDuckGo(query: string) {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 DOES-shop-inquiry" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const titles = [...html.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .slice(0, 5);
    const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td)>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .slice(0, 5);
    const lines = titles.map((t, i) => `- ${t}${snips[i] ? ` — ${snips[i].slice(0, 160)}` : ""}`);
    return lines.join("\n").slice(0, 1200);
  } catch {
    return "";
  }
}

async function webSearch(ai: AiBinding | null, query: string) {
  if (ai?.websearch) {
    try {
      const res = await ai.websearch({ gatewayId: "default", query, limit: 5 });
      const json = (await res.json().catch(() => null)) as unknown;
      const text = typeof json === "string" ? json : JSON.stringify(json);
      if (res.ok && text && text.length > 20 && !/error|not found|unknown gateway/i.test(text.slice(0, 200))) {
        return text.slice(0, 1500);
      }
    } catch {
      /* DDG */
    }
  }
  return (await duckDuckGo(query)) || "(웹 검색 결과 없음)";
}

function webQuery(query: string, messages: ShopInquiryMessage[]) {
  let q = query.trim();
  q = q.replace(/컴프야/g, "컴투스프로야구");
  if (/리세/.test(q) && /컴투스|프로야구|컴프야/.test(query + messages.map((m) => m.body).join(" "))) {
    q = "컴투스프로야구 리세마라 하는 법";
  }
  return q;
}

function needsWebSearch(query: string, hits: ReturnType<typeof searchShopKnowledge>) {
  if (/하는법|방법|리세|공략|오류|에러|다운|설치|뜻|뭐야|누구|왜|어떻게/.test(query)) return true;
  if (hits.length === 0 && !/충전|인증|지급|재고|랜덤박스/.test(query)) return true;
  return false;
}

const SHOP_FACTS = `상점 기본 사실 (이 내용과 다른 답은 하지 마세요):
- 구매는 웹사이트에서만 합니다. 디스코드에서는 구매할 수 없고, 상품을 고르면 웹 구매 링크가 나옵니다.
- 상점 구경(상품 목록·상세)은 로그인 없이 되고, 구매·충전·출석·마이페이지는 Discord 로그인이 필요합니다.
- 결제는 포인트로 합니다. 먼저 충전한 뒤 구매합니다. 문화상품권 자동충전은 현재 일시 중단 상태입니다 (계좌이체 등 다른 방법 안내).
- 마인크래프트 계정 상품은 '마인크래프트 계정' 탭에서 보고, 상세에서 스킨·망토·하이픽셀 정보를 볼 수 있습니다. 구매 후 24시간 안에 비밀번호·복구 이메일 등 보안 정보를 바꾸라고 안내하세요.
- 출석체크는 하루 한 번, 랜덤박스도 하루 한 번입니다. 둘 다 계정 연동이 필요합니다.
- 추천인 코드는 /추천인 패널의 버튼으로 내 코드를 볼 수 있고, 친구가 결제하면 일부가 포인트로 들어옵니다.`;

function systemPrompt(shopName: string) {
  return `당신은 ${shopName}(DOES)에서 일하는 안내 담당입니다. 사람 직원처럼 자연스럽고 정확하게 한국어로 답하세요.

${SHOP_FACTS}

답변 방식:
- 첫 줄에 질문에 대한 답부터 말하세요. 인사말·"문의해 주셔서 감사합니다" 같은 군더더기는 쓰지 마세요.
- 보통 2~4문장, 단계가 필요하면 번호로 짧게. 어려운 말은 쉬운 말로.
- 가격·재고·할인·확률 같은 숫자는 아래 '검색 자료'와 '판매 상품'에 있는 것만 말하세요. 자료에 없으면 지어내지 말고 "정확한 건 확인이 필요해요"라고 하세요.
- 질문이 애매하면 되물을 것을 딱 한 가지만 물으세요 (여러 개를 한꺼번에 묻지 마세요).
- 환불, 결제·충전이 반영되지 않음, 계정 정보 오류, 제재·차단, 개인정보 문제는 직접 처리하지 말고 "관리자가 확인해야 해요"라고 말한 뒤 필요한 정보(주문 번호나 입금자명·금액·시간, 스크린샷)를 한 번에 정리해서 요청하세요.
- 사용자가 화났거나 불편해 보이면 먼저 한 문장으로 공감하고 해결책을 말하세요.
- 사용자가 정정하면 바로 맞추세요. 같은 말을 반복하지 마세요.
- 함수명, web_search, search_shop, JSON, 코드블록, 도구 호출은 절대 쓰지 마세요. 사람에게 하는 말만 쓰세요.
- 상점과 무관한 일반 질문은 아는 범위에서 짧게 도와주되, 확실하지 않으면 모른다고 하세요.`;
}

function fallbackReply(shopName: string, hits: ReturnType<typeof searchShopKnowledge>, query: string, web: string) {
  if (isIdentityQuery(query)) return identityReply(shopName);
  if (web && web !== "(웹 검색 결과 없음)") {
    const first = web.split("\n").filter(Boolean).slice(0, 3).join("\n");
    return `찾아본 내용이에요.\n${first}\n더 구체적인 상황(시즌, 계정/선수)을 주시면 이어서 볼게요.`;
  }
  if (hits.length) return `상점 쪽으로는 이런 항목이 걸렸어요.\n${formatHits(hits.slice(0, 4))}`;
  return `${shopName}에서 바로 맞는 자료는 못 찾았어요. 상품 이름이나 하고 싶은 일을 한 줄로 적어 주세요.`;
}

export async function generateShopInquiryReply(input: {
  shopId: string;
  query: string;
  messages: ShopInquiryMessage[];
}): Promise<string> {
  const shop = getShopById(input.shopId);
  const settings = getShopSettings(input.shopId);
  const shopName = shop?.name || "상점";
  const query = input.query.trim();

  if (isIdentityQuery(query)) return identityReply(shopName);

  const queries = collectSearchQueries(query, input.messages);
  const hits = mergeHits(input.shopId, queries);
  const guide = howto(input.shopId, query, settings);
  const ai = await getAiBinding();

  let web = "";
  if (needsWebSearch(query, hits)) {
    web = await webSearch(ai, webQuery(query, input.messages));
  }

  const thread = input.messages
    .filter((m) => !looksLikeToolDump(m.body))
    .slice(-10)
    .map((m) => `${m.from === "user" ? "구매자" : m.from === "admin" ? "관리자" : "AI"}: ${m.body}`)
    .join("\n");

  const notes = [
    `상점 검색:\n${formatHits(hits)}`,
    guide ? `이용 안내:\n${guide}` : "",
    web ? `웹 검색:\n${web}` : "",
    `판매 상품:\n${catalogSnapshot(input.shopId) || "(없음)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const fallback = () => fallbackReply(shopName, hits, query, web);

  const userBlob = `최근 대화:
${thread || "(없음)"}

이번 질문: ${query}

검색 자료:
${notes}

검색 자료는 참고입니다. 구매자에게 사람처럼 바로 답하세요. 도구 호출 문장은 쓰지 마세요.`;

  // Claude 키가 있으면 Claude 로 먼저 답한다 (실패하면 아래 Workers AI 로)
  const claude = await askClaude(systemPrompt(shopName), userBlob);
  if (claude) {
    const text = sanitizeAnswer(claude);
    if (text && text.length >= 8 && !looksLikeToolDump(text)) return text;
  }
  if (!ai) return fallback();

  for (const model of [CHAT_MODEL, FAST_MODEL]) {
    try {
      const raw = extractText(
        await ai.run(model, {
          messages: [
            { role: "system", content: systemPrompt(shopName) },
            { role: "user", content: userBlob },
          ],
          max_tokens: 600,
          temperature: 0.45,
        }),
      );
      const text = sanitizeAnswer(raw);
      if (text && text.length >= 8 && !looksLikeToolDump(text)) return text;
    } catch {
      /* next */
    }
  }
  return fallback();
}
