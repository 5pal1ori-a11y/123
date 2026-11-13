/**
 * 실시간 구매 랭킹 집계판 — 개표 방송처럼 순위 · 막대 · 득표율(점유율)을 보여 주는 고정 메시지.
 * 채널에 한 번 올리고, 구매가 생기거나 크론이 돌 때마다 같은 메시지를 고쳐 쓴다.
 */
import { container, separator, textDisplay, MessageFlags } from "@/lib/discord/components";
import { discordRest, editChannelMessage, postChannelMessage } from "@/lib/discord/rest";
import { getShopById, getShopSettings, getStoreForRead, persistAsync, updateShopSettings } from "@/lib/store";
import { formatKRW } from "@/lib/utils";

const COUNTED = new Set(["dispensed", "paid", "awaiting_fulfillment"]);
const TOP_N = 10;
const BAR = 16;
const MEDAL = ["🥇", "🥈", "🥉"];

type Row = { key: string; label: string; amount: number; count: number };

/** 회원별 누적 구매금액 (지급 완료 · 결제 완료 · 지급 대기) */
export function purchaseRanking(shopId: string) {
  const store = getStoreForRead();
  const users = new Map(store.users.filter((u) => u.shopId === shopId).map((u) => [u.id, u]));
  const rows = new Map<string, Row>();
  for (const o of store.orders) {
    if (o.shopId !== shopId || !o.userId || !COUNTED.has(o.status)) continue;
    const u = users.get(o.userId);
    if (!u) continue;
    const label = u.discordId ? `<@${u.discordId}>` : `**${maskName(u.name || u.email.split("@")[0] || "회원")}**`;
    const row = rows.get(u.id) ?? { key: u.id, label, amount: 0, count: 0 };
    row.amount += o.amount;
    row.count += 1;
    rows.set(u.id, row);
  }
  const all = [...rows.values()].filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = all.reduce((s, r) => s + r.amount, 0);
  return { top: all.slice(0, TOP_N), total, people: all.length };
}

function maskName(name: string) {
  const n = name.trim();
  if (n.length <= 2) return `${n[0] ?? "*"}*`;
  return `${n.slice(0, 1)}${"*".repeat(Math.min(4, n.length - 2))}${n.slice(-1)}`;
}

function bar(share: number) {
  const filled = Math.max(share > 0 ? 1 : 0, Math.round(share * BAR));
  return "▰".repeat(filled) + "▱".repeat(BAR - filled);
}

export function buildLeaderboardBoard(shopId: string) {
  const shop = getShopById(shopId);
  const { top, total, people } = purchaseRanking(shopId);
  const now = Math.floor(Date.now() / 1000);

  const kids: unknown[] = [
    textDisplay(`## 📊 ${shop?.name ?? "상점"} 실시간 구매 랭킹`),
    textDisplay(`-# 🔴 LIVE · 구매가 생기면 바로 집계돼요 · 마지막 집계 <t:${now}:R>`),
    separator(true, 1),
    textDisplay(`집계 인원 **${people.toLocaleString("ko-KR")}명** · 누적 구매 **${formatKRW(total)}**`),
    separator(true, 1),
  ];

  if (!top.length) {
    kids.push(textDisplay("아직 집계된 구매가 없어요. 첫 번째 주인공이 되어 보세요!"));
  } else {
    const lines = top.map((r, i) => {
      const share = total > 0 ? r.amount / total : 0;
      const pct = (share * 100).toFixed(1);
      const rank = MEDAL[i] ?? `\`${String(i + 1).padStart(2, " ")}위\``;
      return `${rank} ${r.label}  ·  **${formatKRW(r.amount)}**\n\`${bar(share)}\` **${pct}%** · ${r.count}건`;
    });
    // 1~3위와 나머지 사이에 구분선
    kids.push(textDisplay(lines.slice(0, 3).join("\n\n")));
    if (lines.length > 3) {
      kids.push(separator(false, 1));
      kids.push(textDisplay(lines.slice(3).join("\n")));
    }
  }

  kids.push(separator(true, 1));
  kids.push(textDisplay("-# 막대와 %는 전체 누적 구매 중 차지하는 비율이에요 · 구매는 웹사이트에서만 할 수 있어요"));

  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [container(kids, 0xef4444)],
    allowed_mentions: { parse: [] as string[] },
  };
}

/** 랭킹 채널의 집계판을 고쳐 쓰고, 없으면 새로 올린다 */
export async function refreshLeaderboardBoard(shopId: string) {
  const settings = getShopSettings(shopId);
  const channelId = settings.discordLeaderboardChannelId;
  if (!settings.discordBotEnabled || !channelId) return { ok: false as const };
  const payload = buildLeaderboardBoard(shopId);

  if (settings.discordLeaderboardMessageId) {
    const edited = await editChannelMessage(channelId, settings.discordLeaderboardMessageId, payload, shopId);
    if (edited.ok) return { ok: true as const };
    // 메시지가 지워졌으면 새로 올린다
    await discordRest("DELETE", `/channels/${channelId}/messages/${settings.discordLeaderboardMessageId}`, undefined, shopId).catch(
      () => null,
    );
  }
  const posted = await postChannelMessage(channelId, payload, shopId);
  if (posted.ok && posted.json && typeof (posted.json as { id?: string }).id === "string") {
    updateShopSettings(shopId, { discordLeaderboardMessageId: String((posted.json as { id: string }).id) });
    await persistAsync();
    return { ok: true as const };
  }
  return { ok: false as const };
}
