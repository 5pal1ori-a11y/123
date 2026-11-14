/**
 * /문의대기 — 지금 처리 중인 문의(열린 티켓) 수와 예상 대기시간을 보여 주는 고정 패널.
 * 3분 크론(server-status poll)마다 고쳐 쓴다. '내 문의 조회' 를 누르면 본인 순서를 본인에게만 보여 준다.
 */
import {
  button,
  cid,
  container,
  errorPanel,
  MessageFlags,
  plainEphemeral,
  section,
  separator,
  textDisplay,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { editChannelMessage, postChannelMessage } from "@/lib/discord/rest";
import { getShopBySlug, getShopSettings, persistAsync, updateShopSettings } from "@/lib/store";
import { initTicketStore, listTickets } from "@/lib/ticket-bot/store";

/** 한 명당 걸리는 시간 (분) */
const MINUTES_PER_TICKET = 10;
const MAX_PANELS = 10;

function waitText(people: number) {
  const m = people * MINUTES_PER_TICKET;
  if (m <= 0) return "바로 처리돼요";
  if (m < 60) return `약 ${m}분`;
  const h = Math.floor(m / 60);
  return m % 60 ? `약 ${h}시간 ${m % 60}분` : `약 ${h}시간`;
}

/** 오래된 문의부터 차례 */
function openQueue(guildId: string) {
  return listTickets(guildId, "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function todayClosed(guildId: string) {
  const start = new Date();
  start.setUTCHours(start.getUTCHours() + 9);
  start.setUTCHours(0, 0, 0, 0);
  const since = start.getTime() - 9 * 3600_000;
  return listTickets(guildId, "closed").filter((t) => t.closedAt && new Date(t.closedAt).getTime() >= since).length;
}

function queuePanel(shopSlug: string, shopName: string, guildId: string) {
  const open = openQueue(guildId).length;
  const now = Math.floor(Date.now() / 1000);
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container([
        textDisplay("## 문의 대기 현황"),
        separator(true, 1),
        textDisplay("서버 전체 문의 대기 현황입니다.\n내 순서를 보려면 오른쪽 버튼을 눌러 주세요."),
        section({
          text: [
            `> · 처리 중인 문의 · \`${open}건\``,
            `> · 예상 대기시간 · \`${waitText(open)}\``,
            `> · 오늘 완료된 문의 · \`${todayClosed(guildId)}건\``,
          ].join("\n"),
          accessory: button({ customId: cid(shopSlug, "tq_mine"), label: "내 문의 조회" }),
        }),
        separator(true, 1),
        textDisplay(`-# ${shopName} · 문의 대기 현황 · 3분마다 갱신 · 확인 <t:${now}:R>`),
      ]),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

export async function handleTicketQueueCommand(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  channelId: string | undefined,
  guildId: string | undefined,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) {
    return errorPanel("이 패널은 관리자만 올릴 수 있어요.", "권한 없음");
  }
  if (!channelId || !guildId) return errorPanel("서버 채널에서 다시 써 주세요.");
  await initTicketStore({ force: true });
  const posted = await postChannelMessage(channelId, queuePanel(shop.slug, shop.name, guildId), shop.id);
  const id = posted.ok ? (posted.json as { id?: string } | null)?.id : null;
  if (!id) return errorPanel("패널을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  const panels = [...(getShopSettings(shop.id).ticketQueuePanels ?? []), { channelId, messageId: String(id), guildId }].slice(
    -MAX_PANELS,
  );
  updateShopSettings(shop.id, { ticketQueuePanels: panels });
  await persistAsync();
  return plainEphemeral("문의 대기 현황 패널을 올렸어요. 3분마다 자동으로 갱신돼요.");
}

/** 3분 크론: 올라가 있는 패널을 모두 고쳐 쓴다 (지워진 패널은 목록에서 뺀다) */
export async function refreshTicketQueuePanels(shopId: string) {
  const panels = getShopSettings(shopId).ticketQueuePanels ?? [];
  if (!panels.length) return { panels: 0 };
  const shop = (await import("@/lib/store")).getShopById(shopId);
  if (!shop) return { panels: 0 };
  await initTicketStore({ force: true });
  const alive: typeof panels = [];
  for (const p of panels) {
    const r = await editChannelMessage(p.channelId, p.messageId, queuePanel(shop.slug, shop.name, p.guildId), shopId).catch(
      () => null,
    );
    if (r?.ok || (r && r.status !== 404)) alive.push(p);
  }
  if (alive.length !== panels.length) {
    updateShopSettings(shopId, { ticketQueuePanels: alive });
    await persistAsync();
  }
  return { panels: alive.length };
}

/** '내 문의 조회' — 본인에게만 보인다 */
export async function handleTicketQueueMine(guildId: string | undefined, userId: string) {
  if (!guildId) return plainEphemeral("서버에서만 쓸 수 있어요.");
  await initTicketStore({ force: true });
  const queue = openQueue(guildId);
  const idx = queue.findIndex((t) => t.openerId === userId);
  if (idx < 0) {
    return plainEphemeral(
      `지금 열려 있는 내 문의가 없어요.\n-# 현재 대기 중인 문의 ${queue.length}건 · 예상 대기시간 ${waitText(queue.length)}`,
    );
  }
  const mine = queue[idx]!;
  return plainEphemeral(
    [
      `## 내 문의는 **${idx + 1}번째**예요`,
      `> · 내 문의 채널 · <#${mine.channelId}>`,
      `> · 앞에 남은 문의 · \`${idx}건\``,
      `> · 예상 대기시간 · \`${waitText(idx)}\``,
      `-# 한 건에 약 ${MINUTES_PER_TICKET}분으로 계산한 예상 시간이에요`,
    ].join("\n"),
  );
}
