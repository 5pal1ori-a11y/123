/**
 * "도스야 ~" — 디스코드 채팅에서 도스를 부르면 건방지고 싸가지 없는(츤데레) 말투로 답한다.
 * 메시지는 TicketGateway(Durable Object)가 넘겨 준다. 장난 말투지만 욕설 · 혐오 · 성적인 말 · 패드립은 하지 않는다.
 */
import { rateLimit } from "@/lib/rate-limit";
import { chatCompletion, SHOP_FACTS } from "@/lib/shop-inquiry-ai";
import { getShopBySlug, getShopSettings, getUserByDiscordId, initStore, MFA_DISCORD_GUILD_ID, MFA_SHOP_SLUG } from "@/lib/store";

export const DOSYA_RE = /^\s*도스\s*야[\s,!?.~ㅋㅎ]*/;

const SYSTEM = `너는 마인크래프트 계정 상점 DOES의 마스코트 "도스"다. 디스코드 채팅에서 누가 "도스야"라고 부르면 대답한다.

말투 (반드시 지킬 것):
- 싸가지 없고 건방진 츤데레. 반말. 귀찮아하고, 비꼬고, 한숨 쉬고("하...", "아 또 뭐"), 상대를 살짝 놀린다. 'ㅋ'를 적당히 쓴다.
- 그래도 결국 질문엔 제대로 답해 준다. 틱틱대면서 챙겨 주는 느낌.
- 1~3문장, 120자 안팎으로 짧게. 이모지는 거의 안 쓴다.

절대 하지 말 것:
- 욕설(씨발, 병신, 좆 등), 성적인 말, 혐오·차별(성별·지역·장애·국적 등), 외모·가족 비하(패드립), 위협, 자해·범죄 조장.
- 개인정보 묻기, 비밀번호·계정 정보 요구, 가짜 가격·가짜 혜택 지어내기.
- 상대가 진짜 힘들다/위험하다/우울하다고 하면 장난을 멈추고 짧고 진지하게 걱정해 준다.

상점 질문(가격, 충전, 지급, 환불 등)은 아래 사실 안에서만 정확히 답하고, 개인 주문 문제는 "/문의로 티켓 열어"라고 보낸다. 모르면 모른다고 한다.

${SHOP_FACTS}`;

const FALLBACK = ["하... 지금 머리 안 돌아가. 나중에 다시 불러.", "아 또 뭐. 잠깐 바쁘거든? 이따 와.", "응~ 안 들려~ ㅋ 다시 말해 봐.", "귀찮게 하지 마라... 진짜 궁금하면 /문의 해."];

type Event = { guildId: string; channelId: string; messageId: string; authorId: string; content: string; authorName?: string };

export async function handleDosyaChat(e: Event) {
  await initStore();
  const shop = getShopBySlug(MFA_SHOP_SLUG);
  if (!shop) return { ok: false };
  const s = getShopSettings(shop.id);
  if (s.dosyaDisabled) return { ok: false };
  const guilds = new Set([MFA_DISCORD_GUILD_ID, s.discordGuildId].filter(Boolean));
  if (!guilds.has(e.guildId)) return { ok: false };

  const said = e.content.replace(DOSYA_RE, "").trim().slice(0, 400);
  // 한 사람 6초에 한 번 · 한 시간 40번 · 채널 3초에 한 번
  const a = rateLimit(`dosya:u:${e.authorId}`, 1, 6_000);
  const b = rateLimit(`dosya:h:${e.authorId}`, 40, 3_600_000);
  const c = rateLimit(`dosya:c:${e.channelId}`, 1, 3_000);
  if (!a.ok || !b.ok || !c.ok) return { ok: false, limited: true };

  const { doesDiscordEnvAsync } = await import("@/lib/discord/does-env");
  const { ticketBotRest, withTicketBotToken } = await import("@/lib/ticket-bot/rest");
  const token = (await doesDiscordEnvAsync()).botToken;
  if (!token) return { ok: false };

  const user = getUserByDiscordId(shop.id, e.authorId);
  const who = user?.name ? `부른 사람: ${user.name}${user.points ? ` (포인트 ${user.points.toLocaleString("ko-KR")}P)` : ""}` : "부른 사람: 사이트 계정 연결 안 한 사람";
  const prompt = `${who}\n그 사람이 한 말: ${said || "(그냥 '도스야'라고만 부름)"}\n\n도스로서 답장만 써.`;

  await withTicketBotToken(token, async () => {
    await ticketBotRest("POST", `/channels/${e.channelId}/typing`).catch(() => null);
    let reply = (await chatCompletion(SYSTEM, prompt, { maxTokens: 220, temperature: 0.95 }).catch(() => null)) ?? "";
    reply = clean(reply) || FALLBACK[Math.floor(Math.random() * FALLBACK.length)]!;
    await ticketBotRest("POST", `/channels/${e.channelId}/messages`, {
      content: reply.slice(0, 600),
      message_reference: { message_id: e.messageId, fail_if_not_exists: false },
      allowed_mentions: { parse: [], replied_user: false },
    });
  });
  return { ok: true };
}

/** 모델이 실수로 넘은 선을 한 번 더 거른다 */
const BANNED = /(씨발|시발|ㅅㅂ|병신|ㅂㅅ|좆|존나|지랄|니\s*애미|느금|애미|애비|섹스|자살해|죽어라|꺼져\s*죽)/;
function clean(t: string) {
  const s = t.replace(/^["'“”]+|["'“”]+$/g, "").replace(/^도스\s*[:：]\s*/, "").trim();
  if (!s || BANNED.test(s)) return "";
  return s;
}

/** /도스야설정 켜기 · 끄기 (관리자) */
export async function setDosyaEnabled(shopId: string, on: boolean) {
  const { updateShopSettings, persistAsync } = await import("@/lib/store");
  updateShopSettings(shopId, { dosyaDisabled: !on });
  await persistAsync();
}
