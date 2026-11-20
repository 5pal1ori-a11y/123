/**
 * 계정 렌탈 — 디스코드: /렌탈 패널 · 고르기 · 대여 · 내 대여(연장 · 조기 반납) · 관리자 등록 · 반납 처리
 */
import { appEmoji, plainEmoji } from "@/lib/discord/app-emojis";
import {
  actionRow,
  ButtonStyle,
  cid,
  ComponentType,
  container,
  errorPanel,
  MessageFlags,
  modalFieldValue,
  plainEphemeral,
  separator,
  showModal,
  stringSelect,
  textDisplay,
  textInput,
  v2Ephemeral,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { discordRest, postChannelMessage } from "@/lib/discord/rest";
import { shopUrl } from "@/lib/domain";
import {
  addRentalItem,
  completeReturn,
  credText,
  deleteItem,
  extendRental,
  getRentalDb,
  itemCred,
  myRentals,
  parseCredLines,
  rentalQuote,
  rentItem,
  RENTAL_DAYS,
  returnEarly,
  setItemCard,
  setRentalCard,
  toggleItemHidden,
  type Rental,
  type RentalItem,
} from "@/lib/rental";
import { getShopById, getShopBySlug, getShopSettings, getUserByDiscordId, persistAsync, updateShopSettings } from "@/lib/store";

const ACCENT = 0xa855f7;
const P = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}P`;
const ts = (iso: string, f = "R") => `<t:${Math.floor(Date.parse(iso) / 1000)}:${f}>`;

function btn(customId: string, label: string, style: number, disabled = false) {
  return { type: ComponentType.BUTTON, style, label: label.slice(0, 80), custom_id: customId.slice(0, 100), ...(disabled ? { disabled: true } : {}) };
}
const link = (url: string, label: string) => ({ type: ComponentType.BUTTON, style: ButtonStyle.LINK, label, url });

function adminChannel(shopId: string) {
  const s = getShopSettings(shopId);
  return s.rentalAdminChannelId || s.proxyAdminChannelId || s.buybackAdminChannelId || s.coinAdminChannelId || null;
}

function statusText(i: RentalItem, r?: Rental | null) {
  if (i.status === "available") return "🟢 대여 가능";
  if (i.status === "rented") return `🔴 대여 중${r ? ` · ${ts(r.until)} 반납` : ""}`;
  if (i.status === "returning") return "🟡 반납 확인 중";
  return "⚫ 숨김";
}

/* ───────── 패널 ───────── */

async function panelBody(shopId: string, shopSlug: string) {
  const db = await getRentalDb(shopId);
  const items = db.items.filter((i) => i.status !== "hidden");
  const lines = items.slice(0, 12).map((i) => {
    const r = i.rentalId ? db.rentals.find((x) => x.id === i.rentalId) : null;
    return `**${i.title}** · 하루 ${P(i.dailyPrice)} · 보증금 ${P(i.deposit)}\n-# ${statusText(i, r)}${i.rentCount ? ` · ${i.rentCount}회 대여됨` : ""}`;
  });
  const free = items.filter((i) => i.status === "available");
  const kids: unknown[] = [
    textDisplay(`## ${appEmoji("does_crown")} DOES 계정 렌탈`),
    textDisplay("**사기엔 비싼 망토 · 랭크 계정, 필요한 만큼만 빌려 쓰세요.**\n포인트로 결제하면 로그인 정보가 바로 DM으로 와요."),
    textDisplay(["> 1일 · 3일 · **7일 10% 할인** · **30일 20% 할인**", "> 보증금은 반납 확인 뒤 그대로 돌려드려요", "> 시즌패스 **렌탈 1일권**으로 하루치 대여료 무료"].join("\n")),
    separator(true, 1),
    textDisplay(lines.length ? lines.join("\n") : "-# 아직 등록된 렌탈 계정이 없어요."),
  ];
  if (free.length) {
    kids.push(
      actionRow(
        stringSelect({
          customId: cid(shopSlug, "rt_pick"),
          placeholder: "빌릴 계정 고르기",
          options: free.slice(0, 25).map((i) => ({ label: i.title, value: i.id, description: `하루 ${P(i.dailyPrice)} · 보증금 ${P(i.deposit)}` })),
        }),
      ),
    );
  }
  kids.push(actionRow(btn(cid(shopSlug, "rt_mine"), "내 대여", ButtonStyle.SECONDARY), link(shopUrl(getShopById(shopId)?.slug ?? shopSlug, "/dashboard?tab=rental"), "웹에서 보기"), btn(cid(shopSlug, "rt_add"), "상품 등록 (관리자)", ButtonStyle.SECONDARY)));
  return { flags: MessageFlags.IS_COMPONENTS_V2, components: [container(kids, ACCENT)], allowed_mentions: { parse: [] as string[] } };
}

/** /렌탈 (관리자) — 패널을 올리고 위치를 기억한다 */
export async function handleRentalCommand(shopSlug: string, roles: string[], permissions: string | undefined, channelId: string | undefined, adminChannelId: string | null) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const s = getShopSettings(shop.id);
  if (!isDiscordAdmin(s, roles, permissions)) return errorPanel("관리자만 올릴 수 있어요. 손님은 패널의 메뉴를 써 주세요.", "권한 없음");
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const adminCh = adminChannelId || adminChannel(shop.id);
  if (!adminCh) return errorPanel("반납 · 등록 카드를 받을 관리자 채널을 `승인채널` 옵션으로 한 번 지정해 주세요.");
  const posted = await postChannelMessage(channelId, await panelBody(shop.id, shop.slug), shop.id);
  const messageId = (posted.json as { id?: string } | null)?.id;
  if (!posted.ok || !messageId) return errorPanel("패널을 올리지 못했어요. 봇 권한을 확인해 주세요.");
  updateShopSettings(shop.id, { rentalAdminChannelId: adminCh, rentalPanel: { channelId, messageId } });
  await persistAsync();
  return plainEphemeral(`렌탈 패널을 올렸어요. 반납 · 등록 카드는 <#${adminCh}> 채널로 갑니다.\n패널의 **상품 등록 (관리자)** 버튼으로 렌탈 계정을 올려 주세요.`);
}

export async function refreshRentalPanel(shopId: string) {
  const at = getShopSettings(shopId).rentalPanel;
  const slug = getShopById(shopId)?.slug;
  if (!at || !slug) return;
  const body = await panelBody(shopId, slug);
  const r = await discordRest("PATCH", `/channels/${at.channelId}/messages/${at.messageId}`, { components: body.components, flags: body.flags }, shopId);
  if (r.status === 404) {
    updateShopSettings(shopId, { rentalPanel: null });
    await persistAsync();
  }
}

/* ───────── 손님 ───────── */

function linkFirst(shopSlug: string) {
  return v2Ephemeral([
    container([
      textDisplay("## 먼저 사이트 계정을 연결해 주세요"),
      textDisplay("렌탈은 포인트로 결제해서 사이트 계정이 필요해요. 사이트에서 **디스코드로 로그인**하면 자동으로 연결돼요."),
      actionRow(link(shopUrl(shopSlug, "/dashboard?tab=rental"), "사이트에서 로그인")),
    ]),
  ]);
}

/** 계정 고르기 → 기간 버튼 */
export async function handleRentalPick(shopSlug: string, discordId: string, itemId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return linkFirst(shop.slug);
  const db = await getRentalDb(shop.id);
  const i = db.items.find((x) => x.id === itemId);
  if (!i || i.status === "hidden") return plainEphemeral("없는 렌탈 상품이에요.");
  const tickets = db.tickets[user.id] ?? 0;
  const kids: unknown[] = [
    textDisplay(`## ${i.title}`),
    textDisplay([i.description || "", `하루 ${P(i.dailyPrice)} · 보증금 ${P(i.deposit)} (반납 확인 뒤 환불)`, `${statusText(i)} · 내 포인트 ${P(user.points)}${tickets ? ` · 렌탈 1일권 ${tickets}장` : ""}`].filter(Boolean).join("\n")),
    separator(true, 1),
  ];
  if (i.status !== "available") {
    kids.push(textDisplay("지금은 빌릴 수 없어요. 반납되면 다시 시도해 주세요."));
  } else {
    kids.push(textDisplay("**기간을 고르면 결제 전에 한 번 더 확인해요.**"));
    kids.push(
      actionRow(
        ...RENTAL_DAYS.map((d) => {
          const q = rentalQuote(i, d, tickets);
          return btn(cid(shopSlug, "rt_day", `${i.id}|${d}`), `${d}일 · ${P(q.total)}`, ButtonStyle.SECONDARY);
        }),
      ),
    );
    if (tickets) kids.push(textDisplay(`-# 렌탈 1일권 ${tickets}장이 자동으로 쓰여요 (하루치 대여료 무료 · 보증금은 따로)`));
  }
  return v2Ephemeral([container(kids, ACCENT)]);
}

/** 기간 고름 → 결제 확인 */
export async function handleRentalDay(shopSlug: string, discordId: string, payload: string) {
  const [itemId, d] = payload.split("|");
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return linkFirst(shop.slug);
  const db = await getRentalDb(shop.id);
  const i = db.items.find((x) => x.id === itemId);
  if (!i) return plainEphemeral("없는 렌탈 상품이에요.");
  const days = Number(d);
  const q = rentalQuote(i, days, db.tickets[user.id] ?? 0);
  return v2Update([
    container(
      [
        textDisplay(`## ${i.title} · ${days}일 대여`),
        textDisplay(
          [
            `대여료 ${P(q.base)}${q.discount ? ` − 할인 ${P(q.discount)}` : ""}${q.ticketsUsed ? ` − 1일권 ${q.ticketsUsed}장` : ""} = **${P(q.fee)}**`,
            `보증금 **${P(q.deposit)}** (반납 확인 뒤 환불)`,
            `### 결제 ${P(q.total)} · 내 포인트 ${P(user.points)}`,
            `반납 예정 ${ts(new Date(Date.now() + days * 86_400_000).toISOString(), "f")}`,
          ].join("\n"),
        ),
        actionRow(btn(cid(shopSlug, "rt_go", `${i.id}|${days}`), "결제하고 빌리기", ButtonStyle.SUCCESS, user.points < q.total), btn(cid(shopSlug, "rt_x"), "취소", ButtonStyle.SECONDARY)),
        textDisplay("-# 대여 중 비밀번호 · 이메일 · 보안 설정을 바꾸면 보증금이 차감돼요. 기간이 끝나면 바로 접속을 종료해 주세요."),
      ],
      ACCENT,
    ),
  ]);
}

export async function handleRentalGo(shopSlug: string, discordId: string, payload: string) {
  const [itemId, d] = payload.split("|");
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return linkFirst(shop.slug);
  try {
    const { rental, quote, cred } = await rentItem(shop.id, { id: user.id, name: user.name || "회원", discordId }, itemId ?? "", Number(d), true);
    void refreshRentalPanel(shop.id);
    const adminCh = adminChannel(shop.id);
    if (adminCh) {
      await postChannelMessage(
        adminCh,
        { content: `${plainEmoji("does_inbox")} **렌탈 시작** · <@${discordId}> · ${rental.itemTitle} · ${ts(rental.until, "f")}까지 · 결제 ${P(quote.total)}`, allowed_mentions: { parse: [] as string[] } },
        shop.id,
      ).catch(() => null);
    }
    return v2Update([
      container(
        [
          textDisplay(`## ${appEmoji("does_check")} ${rental.itemTitle} 대여 시작!`),
          textDisplay(`${ts(rental.until, "f")} (${ts(rental.until)})까지 쓸 수 있어요.`),
          textDisplay(`**로그인 정보** (나만 보여요)\n\`\`\`\n${credText(cred)}\n\`\`\``),
          actionRow(btn(cid(shopSlug, "rt_mine"), "내 대여 · 연장", ButtonStyle.SECONDARY)),
          textDisplay("-# 비밀번호 · 이메일 · 보안 설정은 바꾸지 마세요. 기간이 끝나면 접속을 종료해 주세요."),
        ],
        0x22c55e,
      ),
    ]);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "빌리지 못했어요.");
  }
}

export async function handleRentalMine(shopSlug: string, discordId: string, update = false) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return linkFirst(shop.slug);
  const [list, db] = await Promise.all([myRentals(shop.id, user.id), getRentalDb(shop.id)]);
  const active = list.filter((r) => r.status === "active");
  const tickets = db.tickets[user.id] ?? 0;
  const kids: unknown[] = [textDisplay(`## 내 대여`), textDisplay(`내 포인트 ${P(user.points)} · 렌탈 1일권 ${tickets}장`)];
  if (!list.length) kids.push(textDisplay("-# 아직 빌린 계정이 없어요."));
  for (const r of active.slice(0, 3)) {
    kids.push(separator(true, 1));
    kids.push(textDisplay(`**${r.itemTitle}** · ${ts(r.until, "f")}까지 (${ts(r.until)})\n\`\`\`\n${credText(r.cred)}\n\`\`\``));
    kids.push(
      actionRow(
        btn(cid(shopSlug, "rt_ext", `${r.id}|1`), `+1일 · ${P(r.dailyPrice)}`, ButtonStyle.SECONDARY),
        btn(cid(shopSlug, "rt_ext", `${r.id}|7`), `+7일 · ${P(rentalQuote({ dailyPrice: r.dailyPrice, deposit: 0 }, 7).fee)}`, ButtonStyle.SECONDARY),
        btn(cid(shopSlug, "rt_ret", r.id), "지금 반납", ButtonStyle.DANGER),
      ),
    );
  }
  const past = list.filter((r) => r.status !== "active").slice(0, 5);
  if (past.length) {
    kids.push(separator(true, 1));
    kids.push(
      textDisplay(
        past
          .map((r) => `-# ${r.itemTitle} · ${r.status === "returning" ? "반납 확인 중" : `반납 완료 · 보증금 ${P(r.depositBack ?? 0)} 환불`} · ${ts(r.returnedAt ?? r.until, "d")}`)
          .join("\n"),
      ),
    );
  }
  const body = [container(kids, ACCENT)];
  return update ? v2Update(body) : v2Ephemeral(body);
}

export async function handleRentalExtend(shopSlug: string, discordId: string, payload: string) {
  const [id, d] = payload.split("|");
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return linkFirst(shop.slug);
  try {
    await extendRental(shop.id, user.id, id ?? "", Number(d));
    return handleRentalMine(shopSlug, discordId, true);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "연장하지 못했어요.");
  }
}

export async function handleRentalReturn(shopSlug: string, discordId: string, id: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점을 찾을 수 없어요.");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return linkFirst(shop.slug);
  try {
    await returnEarly(shop.id, user.id, id);
    void refreshRentalPanel(shop.id);
    return handleRentalMine(shopSlug, discordId, true);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "반납하지 못했어요.");
  }
}

/* ───────── 관리자 ───────── */

function guard(shopSlug: string, roles: string[], permissions: string | undefined) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return { error: plainEphemeral("상점을 찾을 수 없어요.") };
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) return { error: plainEphemeral("관리자만 할 수 있어요.") };
  return { shop };
}

export function handleRentalAddButton(shopSlug: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  return showModal({
    customId: cid(shopSlug, "rt_addm"),
    title: "렌탈 계정 등록",
    inputs: [
      textInput({ customId: "title", label: "제목 (손님에게 보임)", placeholder: "예: 마인콘 2016 망토 · 하이픽셀 MVP+", required: true, minLength: 2, maxLength: 60 }),
      textInput({ customId: "price", label: "하루 가격 (포인트)", placeholder: "예: 3000", required: true, maxLength: 8 }),
      textInput({ customId: "deposit", label: "보증금 (포인트 · 반납 뒤 환불)", placeholder: "예: 20000", required: true, maxLength: 8 }),
      textInput({ customId: "login", label: "로그인 정보 (암호화 보관)", style: 2, placeholder: "1줄: 이메일\n2줄: 비밀번호\n3줄~: 추가 정보", required: true, maxLength: 800 }),
      textInput({ customId: "desc", label: "설명 (선택)", style: 2, placeholder: "망토 · 랭크 · 주의사항", required: false, maxLength: 800 }),
    ],
  });
}

function itemCard(shopSlug: string, i: RentalItem, note?: string) {
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          textDisplay(`## ${plainEmoji("does_inbox")} 렌탈 상품 · ${i.title}`),
          textDisplay(`하루 ${P(i.dailyPrice)} · 보증금 ${P(i.deposit)} · ${statusText(i)} · ${i.rentCount}회 대여\n로그인 정보 ${i.credEnc ? "저장됨" : "없음"}`),
          ...(note ? [textDisplay(`> ${note}`)] : []),
          actionRow(
            btn(cid(shopSlug, "rt_cred", i.id), "로그인 정보 확인", ButtonStyle.SECONDARY),
            btn(cid(shopSlug, "rt_hide", i.id), i.status === "hidden" ? "다시 공개" : "숨기기", ButtonStyle.SECONDARY),
            btn(cid(shopSlug, "rt_del", i.id), "삭제", ButtonStyle.DANGER),
          ),
          textDisplay(`-# 상품 ${i.id}`),
        ],
        ACCENT,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

export async function handleRentalAddSubmit(shopSlug: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const num = (f: string) => Number(modalFieldValue(interaction, f).replace(/[,\s원P₩]/gi, ""));
  const cred = parseCredLines(modalFieldValue(interaction, "login"));
  if (!cred) return plainEphemeral("로그인 정보는 1줄에 이메일, 2줄에 비밀번호를 적어 주세요.");
  try {
    const i = await addRentalItem(g.shop.id, { title: modalFieldValue(interaction, "title"), description: modalFieldValue(interaction, "desc"), dailyPrice: num("price"), deposit: num("deposit"), cred });
    const ch = adminChannel(g.shop.id);
    if (ch) {
      const posted = await postChannelMessage(ch, itemCard(shopSlug, i), g.shop.id).catch(() => null);
      const messageId = (posted?.json as { id?: string } | null)?.id;
      if (messageId) await setItemCard(g.shop.id, i.id, { channelId: ch, messageId });
    }
    void refreshRentalPanel(g.shop.id);
    return plainEphemeral(`**${i.title}** 렌탈 상품을 올렸어요. 하루 ${P(i.dailyPrice)} · 보증금 ${P(i.deposit)}`);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "등록하지 못했어요.");
  }
}

export async function handleRentalAdminButton(shopSlug: string, action: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const shopId = g.shop.id;
  try {
    if (action === "rt_cred") {
      const i = (await getRentalDb(shopId)).items.find((x) => x.id === id);
      const c = i ? itemCred(i) : null;
      if (!c) return plainEphemeral("저장된 로그인 정보가 없어요.");
      return plainEphemeral(["**렌탈 계정 로그인 정보** (나만 보여요)", `이메일: \`${c.email}\``, `비밀번호: ||${c.password}||`, c.extra ? `추가: ${c.extra}` : ""].filter(Boolean).join("\n"));
    }
    if (action === "rt_hide") {
      const i = await toggleItemHidden(shopId, id);
      void refreshRentalPanel(shopId);
      return v2Update(itemCard(shopSlug, i, i.status === "hidden" ? "숨겼어요" : "다시 공개했어요").components);
    }
    if (action === "rt_del") {
      const i = await deleteItem(shopId, id);
      void refreshRentalPanel(shopId);
      return v2Update([container([textDisplay(`~~${i.title}~~ 렌탈 상품을 지웠어요.`)], 0x64748b)]);
    }
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
  return plainEphemeral("알 수 없는 동작이에요.");
}

/* ───────── 반납 ───────── */

function returnCard(shopSlug: string, r: Rental, why: "early" | "expired" | "done", extra?: string) {
  const done = why === "done";
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [
      container(
        [
          textDisplay(`## ${plainEmoji("does_clock")} 렌탈 반납 ${done ? "완료" : "확인 필요"} · ${r.itemTitle}`),
          textDisplay(
            [
              `**대여자** ${r.discordId ? `<@${r.discordId}>` : r.userName} · ${why === "early" ? "조기 반납" : why === "expired" ? "기간 만료" : "처리됨"}`,
              `**기간** ${ts(r.from, "f")} ~ ${ts(r.until, "f")} · 대여료 ${P(r.paid)}${r.ticketsUsed ? ` (1일권 ${r.ticketsUsed}장)` : ""}`,
              `**보증금** ${P(r.deposit)}`,
              extra ?? "",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
          ...(done
            ? []
            : [
                textDisplay("> 계정 **비밀번호를 바꾸고** 보안 설정을 확인한 뒤 [반납 완료]를 눌러 주세요. 새 비밀번호를 적으면 다음 손님에게 그 정보가 가요."),
                actionRow(btn(cid(shopSlug, "rt_done", r.id), "반납 완료 처리", ButtonStyle.SUCCESS)),
              ]),
          textDisplay(`-# 대여 ${r.id}`),
        ],
        done ? 0x22c55e : 0xf59e0b,
      ),
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

export async function postReturnCard(shopId: string, r: Rental, why: "early" | "expired") {
  const slug = getShopById(shopId)?.slug;
  const ch = adminChannel(shopId);
  if (!slug || !ch) return;
  const posted = await postChannelMessage(ch, returnCard(slug, r, why), shopId).catch(() => null);
  const messageId = (posted?.json as { id?: string } | null)?.id;
  if (messageId) await setRentalCard(shopId, r.id, { channelId: ch, messageId });
  void refreshRentalPanel(shopId);
}

export async function handleRentalDoneButton(shopSlug: string, id: string, roles: string[], permissions: string | undefined) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const r = (await getRentalDb(g.shop.id)).rentals.find((x) => x.id === id);
  if (!r || r.status === "done") return plainEphemeral("이미 처리된 반납이에요.");
  if (r.status === "active") return plainEphemeral("아직 대여 중이에요.");
  return showModal({
    customId: cid(shopSlug, "rt_donem", id),
    title: `반납 완료 · ${r.itemTitle}`.slice(0, 45),
    inputs: [
      textInput({ customId: "login", label: "바꾼 로그인 정보 (비우면 그대로)", style: 2, placeholder: "1줄: 이메일\n2줄: 새 비밀번호\n3줄~: 추가 정보", required: false, maxLength: 800 }),
      textInput({ customId: "deduct", label: `보증금 차감 (0 ~ ${r.deposit.toLocaleString("ko-KR")})`, value: "0", required: true, maxLength: 8 }),
      textInput({ customId: "memo", label: "차감 사유 (대여자에게 DM · 선택)", style: 2, required: false, maxLength: 300 }),
    ],
  });
}

export async function handleRentalDoneSubmit(shopSlug: string, id: string, roles: string[], permissions: string | undefined, interaction: DiscordInteraction) {
  const g = guard(shopSlug, roles, permissions);
  if ("error" in g) return g.error;
  const raw = modalFieldValue(interaction, "login").trim();
  const cred = raw ? parseCredLines(raw) : null;
  if (raw && !cred) return plainEphemeral("로그인 정보는 1줄에 이메일, 2줄에 비밀번호를 적어 주세요.");
  const deduct = Number(modalFieldValue(interaction, "deduct").replace(/[,\s원P]/gi, "")) || 0;
  const memo = modalFieldValue(interaction, "memo").trim();
  try {
    const { r, back } = await completeReturn(g.shop.id, id, { cred, deduct });
    void refreshRentalPanel(g.shop.id);
    if (r.discordId) {
      const { sendDiscordDm } = await import("@/lib/discord/dm");
      await sendDiscordDm(
        r.discordId,
        { content: [`**[DOES 렌탈] ${r.itemTitle} 반납이 확인됐어요**`, `보증금 ${P(back)}를 돌려드렸어요.${deduct > 0 ? ` (차감 ${P(r.deposit - back)})` : ""}`, memo ? `> ${memo}` : "", "이용해 주셔서 고마워요!"].filter(Boolean).join("\n") },
        g.shop.id,
      ).catch(() => null);
    }
    await persistAsync().catch(() => null);
    return v2Update(returnCard(shopSlug, r, "done", `**처리** 보증금 ${P(back)} 환불${r.deposit - back ? ` · 차감 ${P(r.deposit - back)}` : ""}${cred ? " · 로그인 정보 갱신" : ""}`).components);
  } catch (e) {
    return plainEphemeral(e instanceof Error ? e.message : "처리하지 못했어요.");
  }
}
