/**
 * /시즌패스 — 이미지로 보는 시즌패스 (일반 보상 · 패스 보상 두 줄) + ◀ ▶ · 보상 받기 · 패스 구매
 */
import { appEmoji } from "@/lib/discord/app-emojis";
import { ButtonStyle, cid, ComponentType, container, mediaGallery, actionRow, plainEphemeral, textDisplay, v2Ephemeral, v2Update } from "@/lib/discord/components";
import { signedDataImageUrl } from "@/lib/discord/rank-image";
import { shopUrl } from "@/lib/domain";
import { buyPass, claimAll, MAX_LEVEL, PASS_PRICE, PASS_XP_BOOST, passState, XP_RULES } from "@/lib/season-pass";
import { getShopBySlug, getUserByDiscordId } from "@/lib/store";

const PAGE = 6;
const PAGES = Math.ceil(MAX_LEVEL / PAGE);
const P = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}P`;
const STATE = { locked: 0, ready: 1, claimed: 2, nopass: 3 } as const;

function btn(customId: string, label: string, style: number, disabled = false) {
  return { type: ComponentType.BUTTON, style, label, custom_id: customId.slice(0, 100), ...(disabled ? { disabled: true } : {}) };
}

export type SpUser = { id: string; name: string; avatar: string | null };

async function view(shopSlug: string, u: SpUser, page: number | null, note?: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return { error: plainEphemeral("상점을 찾을 수 없어요.") };
  const user = getUserByDiscordId(shop.id, u.id);
  if (!user) {
    return {
      body: [
        container([
          textDisplay(`## ${appEmoji("does_crown")} DOES 시즌패스`),
          textDisplay("시즌패스는 사이트 계정의 출석 · 구매 기록으로 레벨이 올라요.\n사이트에서 **디스코드로 로그인**하면 자동으로 연결돼요."),
          actionRow({ type: ComponentType.BUTTON, style: ButtonStyle.LINK, label: "사이트에서 로그인", url: shopUrl(shop.slug, "/dashboard?tab=season") }),
        ]),
      ],
    };
  }
  const st = await passState(shop.id, user.id);
  const pg = Math.max(0, Math.min(PAGES - 1, page ?? Math.floor(Math.min(st.level, MAX_LEVEL - 1) / PAGE)));
  const slice = st.tiers.slice(pg * PAGE, pg * PAGE + PAGE);
  const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : "https://cdn.discordapp.com/embed/avatars/0.png";
  const url = await signedDataImageUrl(shop.slug, {
    kind: "season_pass",
    s: st.season.name,
    dl: st.season.daysLeft,
    nm: u.name.slice(0, 20),
    av: avatar,
    lv: st.level,
    xi: st.inLevel,
    xt: st.xp.total,
    ps: st.pass ? 1 : 0,
    cl: st.claimable,
    mx: MAX_LEVEL,
    t: slice.map((t) => [t.level, t.free.label, t.free.t === "ticket" ? "t" : "p", STATE[t.free.state as keyof typeof STATE], t.pass.label, t.pass.t === "ticket" ? "t" : "p", STATE[t.pass.state as keyof typeof STATE]]),
  }).catch(() => null);

  const w = u.id;
  const lines = [
    `**Lv.${st.level}** · ${st.xp.total.toLocaleString("ko-KR")} XP · 출석 ${st.xp.attendanceDays}일 · 구매 ${st.xp.spent.toLocaleString("ko-KR")}원 · 후기 ${st.xp.reviews}개${st.pass ? ` · 패스 XP +${PASS_XP_BOOST * 100}%` : ""}`,
  ];
  const kids: unknown[] = [];
  if (url) kids.push(mediaGallery([url]));
  else kids.push(textDisplay(`## DOES ${st.season.name} · D-${st.season.daysLeft}`), textDisplay(slice.map((t) => `\`${t.level}\` 일반 ${t.free.label} · 패스 ${t.pass.label}`).join("\n")));
  kids.push(textDisplay(lines.join("\n")));
  if (note) kids.push(textDisplay(`> ${note}`));
  kids.push(
    actionRow(
      btn(cid(shopSlug, "sp_pg", `${pg - 1}|${w}`), "◀", ButtonStyle.SECONDARY, pg <= 0),
      btn(cid(shopSlug, "sp_pg", `${pg + 1}|${w}`), "▶", ButtonStyle.SECONDARY, pg >= PAGES - 1),
      btn(cid(shopSlug, "sp_claim", `${pg}|${w}`), st.claimable ? `보상 받기 (${st.claimable})` : "받을 보상 없음", ButtonStyle.SUCCESS, !st.claimable),
      btn(cid(shopSlug, "sp_buy", `${pg}|${w}`), st.pass ? "패스 보유 중" : `패스 구매 · ${P(PASS_PRICE)}`, ButtonStyle.PRIMARY, st.pass),
      { type: ComponentType.BUTTON, style: ButtonStyle.LINK, label: "웹에서 보기", url: shopUrl(shop.slug, "/dashboard?tab=season") },
    ),
  );
  kids.push(textDisplay(`-# ${pg * PAGE + 1}~${Math.min(MAX_LEVEL, pg * PAGE + PAGE)}단계 · 출석 ${XP_RULES.attendance}XP · 구매 500원당 1XP · 후기 ${XP_RULES.review}XP · ${st.season.name} ${st.season.daysLeft}일 남음`));
  return { body: [container(kids, st.pass ? 0xf59e0b : 0x60a5fa)] };
}

/** /시즌패스 */
export async function handleSeasonPassCommand(shopSlug: string, u: SpUser) {
  const v = await view(shopSlug, u, null);
  return "error" in v ? v.error! : v2Ephemeral(v.body!);
}

/** ◀ ▶ · 보상 받기 · 패스 구매 — 누른 사람이 본인일 때만 */
export async function handleSeasonPassButton(shopSlug: string, action: string, payload: string, presser: { id: string; avatar: string | null; name: string }) {
  const [pgRaw, ownerId] = payload.split("|");
  if (ownerId && ownerId !== presser.id) return plainEphemeral("내 시즌패스는 `/시즌패스`로 열어 주세요.");
  const u: SpUser = presser;
  const page = Number(pgRaw) || 0;
  let note: string | undefined;
  if (action === "sp_claim" || action === "sp_buy") {
    const shop = getShopBySlug(shopSlug);
    const user = shop ? getUserByDiscordId(shop.id, presser.id) : null;
    if (!shop || !user) return plainEphemeral("사이트 계정을 먼저 연결해 주세요.");
    try {
      if (action === "sp_claim") {
        const r = await claimAll(shop.id, user.id);
        note = `${appEmoji("does_check")} 보상 ${r.count}개를 받았어요! ${r.points ? `+${P(r.points)}` : ""}${r.tickets ? ` · 렌탈 1일권 ${r.tickets}장` : ""}`;
      } else {
        const r = await buyPass(shop.id, user.id);
        note = `${appEmoji("does_crown")} 패스를 샀어요! 이제 패스 보상도 받을 수 있고 XP가 +${PASS_XP_BOOST * 100}% 올라요. 남은 포인트 ${P(r.balance)}`;
      }
    } catch (e) {
      note = e instanceof Error ? e.message : "처리하지 못했어요.";
    }
  }
  const v = await view(shopSlug, u, page, note);
  return "error" in v ? v.error! : v2Update(v.body!);
}
