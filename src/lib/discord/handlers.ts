import { formatKRW } from "@/lib/utils";
import { getShopBank } from "@/lib/bank";
import { shopUrl } from "@/lib/domain";
import { editChannelMessage, postChannelMessage } from "@/lib/discord/rest";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import {
  actionRow,
  button,
  ButtonStyle,
  channelSelect,
  cid,
  container,
  fieldEmbed,
  inlineCode,
  InteractionResponseType,
  mediaGallery,
  MessageFlags,
  plainEphemeral,
  section,
  separator,
  showModal,
  stringSelect,
  textDisplay,
  TextInputStyle,
  textInput,
  v2Ephemeral,
  v2Public,
  v2Update,
  errorPanel,
} from "@/lib/discord/components";
import { sendDiscordDm } from "@/lib/discord/dm";
import { listReviewsAdmin, submitPurchaseReview } from "@/lib/store-admin";
import {
  approvePointCharge,
  cancelPointCharge,
  createPointCharge,
  getShopBySlug,
  getShopSettings,
  getUserByDiscordId,
  getUserById,
  listNotices,
  listPendingCharges,
  listProducts,
  listCategories,
  listTopRandomBoxDraws,
  getReferralSummary,
  persistAsync,
  RANDOM_BOX_MAX,
  RANDOM_BOX_TABLE,
  setUserBankDepositorName,
  updateProduct,
  updateShopSettings,
} from "@/lib/store";
import { refreshMfaStockIfStale } from "@/lib/mfa";
import { openRandomBoxOnce } from "@/lib/random-box-claim";
import { randomBoxGifPath } from "@/lib/random-box-gif";
import { redeemWorldCoupon } from "@/lib/world/server";

function productReviewSummary(shopId: string, productId: string) {
  const reviews = listReviewsAdmin(shopId).filter(
    (r) => r.productId === productId && r.approved,
  );
  if (!reviews.length) return "후기 없음";
  return `후기 ${reviews.length}개`;
}

function hasAutoChargeReady(
  settings: ReturnType<typeof getShopSettings>,
  deviceKey?: string | null,
) {
  if (!settings.autoChargeEnabled) return false;
  const pb = settings.pushbulletAccessToken?.trim();
  if (pb && pb.length >= 8) return true;
  return Boolean(deviceKey?.trim());
}

function accentOf(settings: ReturnType<typeof getShopSettings>) {
  return settings.discordEmbedColor ?? 0x5865f2;
}

/** Components V2 panel — menu / notices with buttons */
function v2Panel(
  settings: ReturnType<typeof getShopSettings>,
  opts: {
    title: string;
    body: string;
    components?: unknown[];
    public?: boolean;
  },
) {
  const kids: unknown[] = [
    textDisplay(`## ${opts.title}`.slice(0, 4000)),
    separator(true, 1),
    textDisplay(opts.body.slice(0, 4000)),
  ];
  if (opts.components?.length) {
    kids.push(separator(true, 2));
    kids.push(...opts.components);
  }
  const wrapped = [container(kids)];
  return opts.public ? v2Public(wrapped) : v2Ephemeral(wrapped);
}

function requireLinkedUser(shop: { id: string; name: string; slug: string }, discordId: string) {
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) {
    return { error: linkGuideMessage(shop.name, shop.slug) };
  }
  return { user };
}

export function discordLinkStartUrl(shopSlug: string) {
  const qs = new URLSearchParams({ shop: shopSlug, link: "1", next: "/dashboard?tab=account" });
  return shopUrl(shopSlug, `/api/auth/user/discord/start?${qs.toString()}`);
}

/** Shared account-link instructions for Discord */
export function linkGuideBody(shopName?: string) {
  return [
    "웹 계정과 Discord가 연동되지 않았습니다.",
    "",
    "아래 **인증하기** 버튼을 눌러 Discord로 로그인하면 바로 연동돼요.",
    "",
    "**연동 코드로 하기**",
    "1. 웹 상점 로그인" + (shopName ? ` (**${shopName}**)` : ""),
    "2. 마이페이지 → Discord → 연동 코드 발급",
    `3. ${inlineCode("/연동 코드:XXXXXX")} 입력 (코드는 30분간 유효)`,
  ].join("\n");
}

export function linkGuideMessage(shopName?: string, shopSlug?: string) {
  return fieldEmbed({
    title: "연동 필요",
    description: linkGuideBody(shopName),
    color: 0xf0b232,
    fields: [],
    ...(shopSlug
      ? { components: [actionRow(button({ label: "인증하기", url: discordLinkStartUrl(shopSlug) }))] }
      : {}),
  });
}

export function isDiscordAdmin(
  settings: ReturnType<typeof getShopSettings>,
  roles: string[],
  permissions?: string,
) {
  if (settings.discordAdminRoleId && roles.includes(settings.discordAdminRoleId)) return true;
  if (permissions) {
    try {
      const p = BigInt(permissions);
      if ((p & BigInt(0x8)) === BigInt(0x8)) return true;
      if ((p & BigInt(0x20)) === BigInt(0x20)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function menuButtons(shopSlug: string, settings: ReturnType<typeof getShopSettings>) {
  const grey = ButtonStyle.SECONDARY;
  const btns = [];
  if (settings.discordShowNotices !== false) {
    btns.push(
      button({
        customId: cid(shopSlug, "menu_notices"),
        label: settings.discordBtnLabelNotices || "공지",
        style: grey,
      }),
    );
  }
  if (settings.discordShowProducts !== false) {
    btns.push(
      button({
        customId: cid(shopSlug, "menu_products"),
        label: settings.discordBtnLabelProducts || "제품 보기",
        style: grey,
      }),
    );
  }
  if (settings.discordShowBuy !== false) {
    btns.push(
      button({
        customId: cid(shopSlug, "menu_buy"),
        label: settings.discordBtnLabelBuy || "구매 하기",
        style: grey,
      }),
    );
  }
  if (settings.discordShowCharge !== false) {
    btns.push(
      button({
        customId: cid(shopSlug, "menu_charge"),
        label: settings.discordBtnLabelCharge || "충전 하기",
        style: grey,
      }),
    );
  }
  if (settings.discordShowInfo !== false) {
    btns.push(
      button({
        customId: cid(shopSlug, "menu_info"),
        label: settings.discordBtnLabelInfo || "정보",
        style: grey,
      }),
    );
  }
  if (!btns.length) return [];
  const rows: unknown[] = [];
  for (let i = 0; i < btns.length; i += 5) {
    rows.push(actionRow(...btns.slice(i, i + 5)));
  }
  return rows;
}

/** 버튼자판기 `/버튼` 패널과 동일한 레이아웃 */
export function buildMainMenu(shopSlug: string, shopName: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const settings = getShopSettings(shop.id);
  const title = (settings.discordEmbedTitle || shopName).trim() || shopName;
  const subtitle = (
    settings.discordEmbedDescription?.trim() ||
    "자판기 서비스 이용을 환영합니다."
  ).trim();
  const grey = ButtonStyle.SECONDARY;

  const header = subtitle ? `## ${title}\n-# ${subtitle}` : `## ${title}`;
  const kids: unknown[] = [textDisplay(header.slice(0, 4000)), separator(true, 1)];

  if (settings.discordShowNotices !== false) {
    kids.push(
      section({
        text: "**공지사항**\n> 등록된 공지사항을 한눈에 확인 가능해요.",
        accessory: button({
          customId: cid(shopSlug, "menu_notices"),
          label: settings.discordBtnLabelNotices || "공지",
          style: grey,
        }),
      }),
      separator(true, 1),
    );
  }

  if (settings.discordShowInfo !== false) {
    kids.push(
      section({
        text: "**정보확인**\n> 자판기에 등록된 정보를 확인할수있어요.",
        accessory: button({
          customId: cid(shopSlug, "menu_info"),
          label: settings.discordBtnLabelInfo || "정보",
          style: grey,
        }),
      }),
      separator(true, 1),
    );
  }

  const bottom: ReturnType<typeof button>[] = [];
  if (settings.discordShowProducts !== false) {
    bottom.push(
      button({
        customId: cid(shopSlug, "menu_products"),
        label: settings.discordBtnLabelProducts || "제품 보기",
        style: grey,
      }),
    );
  }
  if (settings.discordShowCharge !== false) {
    bottom.push(
      button({
        customId: cid(shopSlug, "menu_charge"),
        label: settings.discordBtnLabelCharge || "충전 하기",
        style: grey,
      }),
    );
  }
  if (settings.discordShowBuy !== false) {
    bottom.push(
      button({
        customId: cid(shopSlug, "menu_buy"),
        label: settings.discordBtnLabelBuy || "구매 하기",
        style: grey,
      }),
    );
  }
  if (settings.world?.parkourCoupon?.enabled !== false) {
    bottom.push(button({ customId: cid(shopSlug, "menu_coupon"), label: "쿠폰 사용", style: grey }));
  }

  if (bottom.length) {
    for (let i = 0; i < bottom.length; i += 5) {
      kids.push(actionRow(...bottom.slice(i, i + 5)));
    }
  } else {
    kids.push(...menuButtons(shopSlug, settings));
  }

  return v2Public([container(kids)]);
}

export function handleButtonPanelModal(shopSlug: string, roles: string[], permissions?: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return errorPanel("관리자 권한이 필요합니다.");
  }
  const title = settings.discordEmbedTitle || shop.name;
  const subtitle =
    settings.discordEmbedDescription?.trim() || "자판기 서비스 이용을 환영합니다.";

  return showModal({
    customId: cid(shopSlug, "btn_modal"),
    title: "버튼판 문구 수정",
    inputs: [
      textInput({
        customId: "vend_title",
        label: "큰 제목",
        placeholder: "예: 서버 이름",
        required: true,
        maxLength: 100,
        value: title.slice(0, 100),
      }),
      textInput({
        customId: "vend_subtitle",
        label: "작은 설명",
        placeholder: "예: 자판기 서비스 이용을 환영합니다.",
        required: false,
        maxLength: 150,
        value: subtitle.slice(0, 150),
      }),
    ],
  });
}

export async function handleButtonPanelSubmit(
  shopSlug: string,
  titleRaw: string,
  subtitleRaw: string,
  roles: string[],
  permissions?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return errorPanel("관리자 권한이 필요합니다.");
  }
  const title = titleRaw.trim() || shop.name;
  const subtitle = subtitleRaw.trim();
  updateShopSettings(shop.id, {
    discordEmbedTitle: title,
    discordEmbedDescription: subtitle || "자판기 서비스 이용을 환영합니다.",
  });
  await persistAsync();
  return buildMainMenu(shop.slug, shop.name);
}

export function handleVendingCommand(shopSlug: string, _discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  return buildMainMenu(shop.slug, shop.name);
}

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://vendix.team").replace(/\/$/, "");
}

function randomBoxOddsLine() {
  const total = RANDOM_BOX_TABLE.reduce((s, b) => s + b.weight, 0);
  const pct = (w: number) => `${Number(((w / total) * 100).toFixed(2))}%`;
  return [...RANDOM_BOX_TABLE]
    .reverse()
    .map((b) =>
      b.max <= 0
        ? `꽝 ${pct(b.weight)}`
        : `${b.min === b.max ? formatKRW(b.min) : `${b.min.toLocaleString("ko-KR")}~${formatKRW(b.max)}`} ${pct(b.weight)}`,
    )
    .join(" · ");
}

export function handleRandomBoxCommand(shopSlug: string, roles: string[], permissions?: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) {
    return errorPanel("랜덤박스 패널은 관리자만 올릴 수 있어요. 채널에 있는 **박스 열기** 버튼을 눌러 주세요.", "권한 없음");
  }

  const panel = v2Public(randomBoxPanelComponents(shop.id, shop.slug));
  return { ...panel, data: { ...panel.data, allowed_mentions: { parse: [] } } };
}

/** 랜덤박스 패널 본문 — 처음 올릴 때와, 누가 열 때마다 TOP 3 를 고쳐 쓸 때 같이 쓴다 */
function randomBoxPanelComponents(shopId: string, shopSlug: string) {
  const top = listTopRandomBoxDraws(shopId, 7, 3);
  const topLines = top.length
    ? top
        .map((d, i) => {
          const who = d.discordId ? `<@${d.discordId}>` : `**${d.name}**`;
          const when = Math.floor(new Date(d.createdAt).getTime() / 1000);
          return `${i + 1}위 ${who} **${formatKRW(d.amount)}** · <t:${when}:R>`;
        })
        .join("\n")
    : "아직 당첨 기록이 없어요. 첫 번째 주인공이 되어 보세요!";

  return [
      container([
        textDisplay("## 랜덤박스"),
        mediaGallery([`${appOrigin()}/brand/randombox.gif`]),
        textDisplay(
          [
            `하루에 한번 열 수 있어요. 최대 **${RANDOM_BOX_MAX.toLocaleString("ko-KR")}포인트**가 드랍되니 행운을 빌어요!`,
            "",
            "연속출석 **7일, 30일, 90일**에는 특별한 선물이 기다리고 있어요!",
            "",
            `-# 확률 ${randomBoxOddsLine()}`,
            "-# 상점 계정과 연동한 회원만 열 수 있어요.",
          ].join("\n"),
        ),
        separator(true, 1),
        textDisplay(`### 최근 7일 최고 당첨 TOP 3\n${topLines}`),
        textDisplay(`-# 마지막 갱신 <t:${Math.floor(Date.now() / 1000)}:R>`),
        actionRow(button({ customId: cid(shopSlug, "rbox_open"), label: "박스 열기" })),
      ]),
    ];
}

/** 박스를 연 뒤 그 패널 메시지의 TOP 3 를 최신으로 고친다 (실패해도 무시) */
function refreshRandomBoxPanel(shopId: string, shopSlug: string, channelId?: string, messageId?: string) {
  if (!channelId || !messageId) return;
  scheduleDiscordBackground(
    editChannelMessage(
      channelId,
      messageId,
      {
        flags: MessageFlags.IS_COMPONENTS_V2,
        components: randomBoxPanelComponents(shopId, shopSlug),
        allowed_mentions: { parse: [] },
      },
      shopId,
    ).catch((err) => console.error("[rbox] panel refresh failed", err)),
  );
}

/** /서버상황 — 관리자 온라인 여부 패널을 이 채널에 올린다 (관리자 전용) */
export async function handleServerStatusCommand(
  shopSlug: string,
  roles: string[],
  permissions: string | undefined,
  channelId: string | undefined,
  guildId: string | undefined,
  targetUserId?: string | null,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  if (!isDiscordAdmin(getShopSettings(shop.id), roles, permissions)) {
    return errorPanel("이 패널은 관리자만 올릴 수 있어요.", "권한 없음");
  }
  if (!channelId) return errorPanel("채널에서 다시 써 주세요.");
  const { postServerStatusPanel, pollAndRefresh } = await import("@/lib/discord/server-status");
  const posted = await postServerStatusPanel(shop.id, channelId, targetUserId);
  if (!posted.ok) return errorPanel("패널을 올리지 못했어요. 봇이 이 채널에 글을 쓸 수 있는지 확인해 주세요.");
  if (guildId) scheduleDiscordBackground(pollAndRefresh(shop.id, guildId).catch(() => null));
  return plainEphemeral("관리자 상황 패널을 올렸어요. 3분마다 자동으로 갱신돼요.");
}

/** /추천인 — 누구나 쓸 수 있다. 내 추천인 코드를 이미지와 함께 채널에 공개로 올린다 */
export function handleReferralCommand(shopSlug: string, discordId: string) {
  return handleReferralMine(shopSlug, discordId);
}

/** 내 추천인 코드 (공개 메시지 — 친구들에게 보여주기 좋게) */
export function handleReferralMine(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const linked = requireLinkedUser(shop, discordId);
  if ("error" in linked) return linked.error;
  const summary = getReferralSummary(shop.id, linked.user.id);
  if (!summary?.code) return errorPanel("추천인 코드를 만들지 못했어요. 잠시 후 다시 써 주세요.");
  scheduleDiscordBackground(persistAsync());
  const link = shopUrl(shop.slug, `/dashboard?tab=account&ref=${encodeURIComponent(summary.code)}`);
  const panel = v2Public([
    container(
      [
        mediaGallery([`${appOrigin()}/brand/referral.png`]),
        textDisplay(`<@${discordId}> 님의 추천인 코드`),
        textDisplay(`# \`${summary.code}\``),
        separator(true, 1),
        textDisplay(
          [
            `이 코드로 가입하면 <@${discordId}> 님에게 결제액의 **${summary.ratePercent}%** 가 보상으로 들어가요.`,
            `-# 초대 ${summary.invitedCount.toLocaleString("ko-KR")}명 · 받은 보상 ${formatKRW(summary.earned)}`,
          ].join("\n"),
        ),
        actionRow(
          button({ label: "이 코드로 가입하기", url: link, style: ButtonStyle.LINK }),
          button({ customId: cid(shop.slug, "ref_mine"), label: "내 코드 보기" }),
        ),
      ],
      0xa855f7,
    ),
  ]);
  return { ...panel, data: { ...panel.data, allowed_mentions: { parse: [] } } };
}

function randomBoxResultKids(discordId: string, amount: number) {
  const gifUrl = `${appOrigin()}${randomBoxGifPath(amount)}`;
  return [
    textDisplay(
      amount > 0
        ? `## <@${discordId}> 님 ${formatKRW(amount)} 당첨!`
        : `## <@${discordId}> 님 아쉽게도 꽝!`,
    ),
    textDisplay("-# 내일 0시(한국 시간)에 다시 도전해 보세요"),
    mediaGallery([gifUrl]),
  ];
}

export async function handleRandomBoxOpen(
  shopSlug: string,
  discordId: string,
  channelId?: string,
  panelMessageId?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점을 찾을 수 없어요.");
  const linked = requireLinkedUser(shop, discordId);
  if ("error" in linked) return linked.error;

  const result = await openRandomBoxOnce(shop.id, linked.user);
  if (!result.ok) return errorPanel(result.error);

  if (result.already) {
    return v2Ephemeral([
      container([
        textDisplay(`## 오늘은 이미 열었어요\n오늘 결과: **${result.amount > 0 ? formatKRW(result.amount) : "꽝"}**`),
        textDisplay("-# 내일 0시(한국 시간)에 다시 열 수 있어요"),
      ]),
    ]);
  }

  refreshRandomBoxPanel(shop.id, shop.slug, channelId, panelMessageId);
  const balanceLine = `-# 현재 잔액 ${formatKRW(result.balance)}`;
  // 결과는 연 사람에게만 보인다 (채널에 공개로 올리지 않음). 기록은 랜덤박스 로그 채널에 따로 남는다
  return v2Ephemeral([container([...randomBoxResultKids(discordId, result.amount), textDisplay(balanceLine)])]);
}

export function handleNotices(shopSlug: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  const notices = listNotices(shop.id).slice(0, 5);

  if (!notices.length) {
    return fieldEmbed({
      title: "공지사항",
      description: "등록된 공지사항이 없습니다.",
      fields: [],
    });
  }

  const body = notices
    .map((n) => `**${n.title}**\n${n.body}`.trim())
    .join("\n\n")
    .slice(0, 3900);

  return fieldEmbed({
    title: "공지사항",
    description: body,
    fields: [],
  });
}

export function handleProductsList(shopSlug: string, mode: "browse" | "buy") {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  const products = listProducts(shop.id).filter((p) => p.active);
  const categories = categoryChoices(shop.id, products);

  if (!categories.length) {
    return fieldEmbed({
      title: mode === "buy" ? "제품 구매" : "제품 목록",
      description: "등록된 카테고리가 없습니다.",
      fields: [],
    });
  }

  const catAction = mode === "buy" ? "buy_cat" : "browse_cat";
  return fieldEmbed({
    title: mode === "buy" ? "제품 구매" : "제품 목록",
    description:
      mode === "buy"
        ? "구매할 제품의 카테고리를 선택해주세요."
        : "카테고리를 선택해주세요.",
    fields: [],
    components: [
      actionRow(
        stringSelect({
          customId: cid(shopSlug, catAction),
          placeholder: "카테고리 선택",
          options: categories,
        }),
      ),
    ],
  });
}

export function handleBuyCategory(shopSlug: string, category: string) {
  return handleCatalogCategory(shopSlug, category, "buy");
}

export function handleBrowseCategory(shopSlug: string, category: string) {
  return handleCatalogCategory(shopSlug, category, "browse");
}

async function handleCatalogCategory(shopSlug: string, category: string, mode: "browse" | "buy") {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  await refreshMfaStockIfStale(shop.id);
  const allActive = listProducts(shop.id).filter((p) => p.active);
  const products = allActive.filter((p) => p.category === category);

  if (mode === "browse") {
    if (!products.length) {
      return fieldEmbed({
        title: "제품 목록",
        description: "해당 카테고리에 등록된 제품이 없습니다.",
        fields: [],
      });
    }
    const productText = products
      .map(
        (p) =>
          `**${p.name}**\n가격: ${p.price.toLocaleString()}원 | 재고: ${p.availableCount}개`,
      )
      .join("\n\n")
      .slice(0, 3900);
    return fieldEmbed({
      title: "제품 목록",
      description: productText,
      fields: [],
    });
  }

  if (!products.length) {
    return fieldEmbed({
      title: "제품 구매",
      description: "해당 카테고리에 등록된 제품이 없습니다.",
      fields: [],
    });
  }

  const productOptions = products.slice(0, 25).map((p) => ({
    label: p.name.slice(0, 100),
    value: p.id,
    description:
      `${p.price.toLocaleString()}원 · 재고 ${p.availableCount} · ${productReviewSummary(shop.id, p.id)}`.slice(
        0,
        100,
      ),
  }));

  return fieldEmbed({
    title: "제품 구매",
    description: "구매할 제품을 선택해주세요.",
    fields: [],
    components: [
      actionRow(
        stringSelect({
          customId: cid(shopSlug, "buy_select"),
          placeholder: "제품 선택",
          options: productOptions,
        }),
      ),
    ],
  });
}

/** Browse: product pick → detail view (not purchase) */
export function handleBrowseSelect(shopSlug: string, productId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const settings = getShopSettings(shop.id);
  const product = listProducts(shop.id).find((p) => p.id === productId);
  if (!product) return plainEphemeral("상품을 찾을 수 없어요.");

  const desc = (product.description || "").trim().slice(0, 800);

  return fieldEmbed({
    title: product.name,
    description: desc || undefined,
    color: accentOf(settings),
    fields: [
      { name: "가격", value: formatKRW(product.price), inline: true, fence: false },
      { name: "재고", value: String(product.availableCount), inline: true, fence: false },
      { name: "카테고리", value: product.category || "-", inline: true, fence: false },
    ],
    components: [
      actionRow(
        button({
          customId: cid(shopSlug, "menu_buy"),
          label: "구매하기",
          style: ButtonStyle.SUCCESS,
        }),
        button({
          customId: cid(shopSlug, "menu_products"),
          label: "목록으로",
          style: ButtonStyle.SECONDARY,
        }),
      ),
    ],
  });
}

function categoryChoices(
  shopId: string,
  products: ReturnType<typeof listProducts>,
) {
  const fromDb = listCategories(shopId).map((c) => c.name.trim()).filter(Boolean);
  const fromProducts = products.map((p) => p.category.trim()).filter(Boolean);
  const names = [...new Set([...fromDb, ...fromProducts])];
  if (!names.length) names.push("General");
  return names.slice(0, 25).map((name) => ({
    label: name.slice(0, 100),
    value: name.slice(0, 100),
  }));
}

export function handleInfo(shopSlug: string, discordId: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  const user = getUserByDiscordId(shop.id, discordId);

  if (!user) {
    return linkGuideMessage(shop.name, shop.slug);
  }

  return fieldEmbed({
    title: "내 정보",
    fields: [
      { name: "사용자", value: `<@${discordId}>`, fence: false },
      { name: "보유 금액", value: `${user.points.toLocaleString()}원`, fence: false },
    ],
  });
}

/** 구매는 웹에서만 — 디스코드에서는 상품 정보와 웹 구매 링크만 보여준다 */
function webOnlyBuyPanel(shopSlug: string, product: { name: string; slug: string; price: number; availableCount: number } | null) {
  const href = product ? shopUrl(shopSlug, `/product/${product.slug}`) : shopUrl(shopSlug, "/dashboard?tab=products");
  const lines = product
    ? [
        `### ${product.name}`,
        `가격 **${product.price.toLocaleString("ko-KR")}원** · ${product.availableCount > 0 ? `재고 ${product.availableCount.toLocaleString("ko-KR")}개` : "품절"}`,
      ]
    : [];
  return v2Ephemeral([
    container([
      textDisplay("## 구매는 웹사이트에서 할 수 있어요"),
      separator(true, 1),
      ...(lines.length ? [textDisplay(lines.join("\n"))] : []),
      textDisplay("-# 결제·지급 안전을 위해 디스코드에서는 구매를 받지 않아요. 아래 버튼으로 바로 이동해 주세요."),
      actionRow(button({ label: "웹에서 구매하기", url: href, style: ButtonStyle.LINK })),
    ]),
  ]);
}

export function handleBuySelect(shopSlug: string, discordId: string, productId: string) {
  void discordId;
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  const product = listProducts(shop.id).find((p) => p.id === productId) ?? null;
  return webOnlyBuyPanel(shopSlug, product);
}

export async function handleBuyConfirm(
  shopSlug: string,
  discordId: string,
  productId: string,
  _quantity = 1,
) {
  void discordId;
  void _quantity;
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  // 예전에 띄운 수량 모달이 남아 있어도 디스코드에서는 구매하지 않는다
  return webOnlyBuyPanel(shopSlug, listProducts(shop.id).find((p) => p.id === productId) ?? null);
}

export function handleCouponModal(shopSlug: string) {
  return showModal({
    customId: cid(shopSlug, "coupon_modal"),
    title: "자판기 쿠폰 사용",
    inputs: [
      textInput({
        customId: "code",
        label: "쿠폰 번호",
        placeholder: "DS-XXXX-XXXX-XXXX-XXXX",
        required: true,
        minLength: 18,
        maxLength: 30,
      }),
    ],
  });
}

export async function handleCouponSubmit(shopSlug: string, discordId: string, code: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const user = getUserByDiscordId(shop.id, discordId);
  if (!user) return linkGuideMessage(shop.name, shop.slug);
  const result = await redeemWorldCoupon(shop.id, user.id, code);
  if (!result.ok) return plainEphemeral(`쿠폰을 쓸 수 없어요 · ${result.error}`);
  await persistAsync();
  return plainEphemeral(
    `🎟️ 쿠폰 사용 완료! 자판기 잔액 **${formatKRW(result.amount)}** 충전\n-# 현재 잔액 ${formatKRW(result.balance)}`,
  );
}

export function handleReviewWriteModal(shopSlug: string, productId: string) {
  return showModal({
    customId: cid(shopSlug, "rev_modal", productId),
    title: "구매 후기 작성",
    inputs: [
      textInput({
        customId: "comment",
        label: "후기 내용",
        placeholder: "제품에 대한 솔직한 후기를 남겨주세요.",
        style: TextInputStyle.PARAGRAPH,
        required: true,
        minLength: 5,
        maxLength: 500,
      }),
    ],
  });
}

export async function handleReviewSubmit(
  shopSlug: string,
  discordId: string,
  productId: string,
  comment: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const linked = requireLinkedUser(shop, discordId);
  if ("error" in linked) return linked.error;
  const result = submitPurchaseReview(shop.id, linked.user.id, productId, comment);
  if (!result.ok) return plainEphemeral(result.error);
  await persistAsync();
  return plainEphemeral("후기가 등록됐어요. 감사합니다!");
}

export async function handleChargeCommand(
  shopSlug: string,
  discordId: string,
  amount: number,
  depositorNameInput?: string,
  interactionMeta?: { applicationId?: string; interactionToken?: string },
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  const linked = requireLinkedUser(shop, discordId);
  if ("error" in linked) return linked.error;
  const settings = getShopSettings(shop.id);
  if (amount < 1) {
    return errorPanel("1원 이상의 금액을 입력해주세요.", "충전 불가");
  }
  if (amount < settings.minChargeAmount) {
    return errorPanel(`최소 충전 금액은 ${formatKRW(settings.minChargeAmount)}입니다.`, "충전 불가");
  }

  const depositorBase = (() => {
    const locked = linked.user.bankDepositorName?.trim();
    if (locked) return locked;

    const incoming = depositorNameInput?.trim() || "";
    if (!incoming) return "";

    setUserBankDepositorName(linked.user.id, incoming);
    return incoming;
  })();
  if (!depositorBase) {
    return errorPanel(
      "입금자명을 아직 설정하지 않았어요.\n충전 모달에서 **최초 1회** 입금자명을 입력하면 이후 고정됩니다.",
    );
  }

  const bank = getShopBank(shop);
  if (!bank.bankName || !bank.accountNumber) {
    return errorPanel("충전 설정이 완료되지 않았습니다.\n관리자에게 문의하세요.", "설정 오류");
  }

  const depositor = settings.depositSuffixPhrase
    ? `${depositorBase}${settings.depositSuffixPhrase}`
    : depositorBase;
  // Store the exact name the user must deposit under (incl. suffix) for auto-match
  const charge = createPointCharge(shop.id, linked.user.id, amount, "bank", depositor);
  if (interactionMeta?.applicationId) {
    charge.discordApplicationId = interactionMeta.applicationId;
  }
  if (interactionMeta?.interactionToken) {
    charge.discordInteractionToken = interactionMeta.interactionToken;
  }

  const auto = hasAutoChargeReady(settings, shop.androidDeviceKey);

  const chargeFields = [
    { name: "입금 은행", value: bank.bankName, fence: false },
    { name: "계좌번호", value: bank.accountNumber, fence: false },
    { name: "예금주명", value: bank.accountHolder || "-", fence: false },
    { name: "입금자명", value: depositor, fence: false },
    { name: "입금 금액", value: `${amount.toLocaleString()}원`, fence: false },
  ];

  if (settings.discordChargeLogChannelId) {
    const posted = await postChannelMessage(
      settings.discordChargeLogChannelId,
      {
        flags: MessageFlags.IS_COMPONENTS_V2,
        components: [
          container([
            textDisplay("## 충전 요청"),
            separator(true, 1),
            textDisplay(`**요청자**\n<@${discordId}>`),
            textDisplay(`**입금자명**\n${depositor}`),
            textDisplay(`**충전 금액**\n${amount.toLocaleString()}원`),
            separator(true, 2),
            actionRow(
              button({
                customId: cid(shopSlug, "chg_ok", charge.id),
                label: "승인",
                style: ButtonStyle.SUCCESS,
              }),
              button({
                customId: cid(shopSlug, "chg_no", charge.id),
                label: "거절",
                style: ButtonStyle.DANGER,
              }),
            ),
          ]),
        ],
      },
      shop.id,
    );
    if (posted.ok && posted.json && typeof posted.json === "object" && "id" in posted.json) {
      charge.discordLogChannelId = settings.discordChargeLogChannelId;
      charge.discordLogMessageId = String((posted.json as { id?: string }).id || "") || null;
    }
  }

  await persistAsync();

  return fieldEmbed({
    title: "충전 안내",
    description: auto
      ? [
          "위 계좌로 **입금자명 그대로** 입금해 주세요.",
          "안드로이드(푸시불릿·MacroDroid)로 입금 알림이 오면 자동 충전됩니다.",
          "_입금 확인까지 보통 수분, 최대 약 10분 걸릴 수 있습니다._",
        ].join("\n")
      : "위 계좌로 입금해주세요.\n관리자가 확인 후 수동으로 충전해드립니다.",
    fields: chargeFields,
  });
}

export function handleChargeUi(shopSlug: string, discordId?: string) {
  return handleChargeAmountModal(shopSlug, discordId);
}

/** Opens Discord modal for charge amount (+ depositor name on first use only) */
export function handleChargeAmountModal(
  shopSlug: string,
  discordId?: string,
  opts?: { amountPrefill?: number },
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");

  const locked =
    discordId != null
      ? getUserByDiscordId(shop.id, discordId)?.bankDepositorName?.trim() || ""
      : "";

  const inputs = [
    textInput({
      customId: "amount",
      label: "충전할 금액",
      placeholder: "숫자만 입력해주세요 (예: 10000)",
      required: true,
      minLength: 1,
      maxLength: 10,
      ...(opts?.amountPrefill && opts.amountPrefill > 0
        ? { value: String(Math.floor(opts.amountPrefill)) }
        : {}),
    }),
  ];

  if (!locked) {
    inputs.push(
      textInput({
        customId: "depositor",
        label: "입금자명 (최초 1회 · 이후 고정)",
        placeholder: "예: 홍길동",
        required: true,
        minLength: 1,
        maxLength: 20,
      }),
    );
  }

  return showModal({
    customId: cid(shopSlug, "chg_modal"),
    title: locked ? `충전하기 · ${locked}` : "충전하기",
    inputs,
  });
}

export function handlePendingCharges(shopSlug: string, roles: string[], permissions?: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return plainEphemeral("관리자만 사용할 수 있어요.");
  }
  const pending = listPendingCharges(shop.id).filter((c) => c.method === "bank").slice(0, 5);
  if (!pending.length) return plainEphemeral("대기 중인 충전이 없어요.");

  const components: unknown[] = [];
  for (const c of pending) {
    components.push(
      actionRow(
        button({
          customId: cid(shopSlug, "chg_ok", c.id),
          label: `승인 ${formatKRW(c.amount)}`,
          style: ButtonStyle.SUCCESS,
        }),
        button({
          customId: cid(shopSlug, "chg_no", c.id),
          label: "거절",
          style: ButtonStyle.DANGER,
        }),
      ),
    );
  }

  return fieldEmbed({
    title: `대기 충전 ${pending.length}건`,
    color: accentOf(settings),
    fields: pending.map((c, i) => ({
      name: `${i + 1}. ${formatKRW(c.amount)}`,
      value: `${c.depositorName ?? "-"}\n${inlineCode(c.reference)}`,
      inline: true,
      fence: false,
    })),
    components,
  });
}

export async function handleChargeApprove(
  shopSlug: string,
  chargeId: string,
  roles: string[],
  permissions: string | undefined,
  processorMention?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return plainEphemeral("관리자만 가능해요.");
  }
  // 입금자명은 요청 시 저장된 값을 유지 (라벨로 덮어쓰지 않음)
  const result = approvePointCharge(chargeId, shop.id);
  if (!result.ok) return plainEphemeral(result.error);
  await persistAsync();

  return {
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container([
          textDisplay("## 충전 요청"),
          separator(true, 1),
          textDisplay(`**입금자명**\n${result.charge.depositorName || "-"}`),
          textDisplay(`**충전 금액**\n${result.charge.amount.toLocaleString()}원`),
          separator(true, 1),
          textDisplay(
            `**처리 결과**\n승인됨${processorMention ? ` (처리자: ${processorMention})` : ""}`,
          ),
        ]),
      ],
    },
  };
}

export async function handleChargeReject(
  shopSlug: string,
  chargeId: string,
  roles: string[],
  permissions: string | undefined,
  processorMention?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return errorPanel("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return errorPanel("관리자 권한이 필요합니다.");
  }
  const result = cancelPointCharge(chargeId, shop.id);
  if (!result.ok) return errorPanel(result.error);
  await persistAsync();

  const user = getUserById(result.charge.userId);
  if (user?.discordId) {
    scheduleDiscordBackground(
      sendDiscordDm(
        user.discordId,
        {
          flags: MessageFlags.IS_COMPONENTS_V2,
          components: [
            container([
              textDisplay("## 충전 거절 안내"),
              separator(true, 1),
              textDisplay("충전 요청이 거절되었습니다."),
              textDisplay(`**충전 금액**\n${result.charge.amount.toLocaleString()}원`),
              textDisplay("입금 내역을 다시 확인 후 문의해주세요."),
            ]),
          ],
        },
        shop.id,
      ),
    );
  }

  return {
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: [
        container([
          textDisplay("## 충전 요청"),
          separator(true, 1),
          textDisplay(`**입금자명**\n${result.charge.depositorName || "-"}`),
          textDisplay(`**충전 금액**\n${result.charge.amount.toLocaleString()}원`),
          separator(true, 1),
          textDisplay(
            `**처리 결과**\n거절됨${processorMention ? ` (처리자: ${processorMention})` : ""}`,
          ),
        ]),
      ],
    },
  };
}

export function handleSettingsPanel(shopSlug: string, roles: string[], permissions?: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return plainEphemeral("관리자만 사용할 수 있어요.");
  }

  return fieldEmbed({
    title: `${shop.name} 봇 설정`,
    fields: [
      { name: "길드 ID", value: settings.discordGuildId ?? "-", fence: false },
      {
        name: "구매 로그",
        value: settings.discordPurchaseLogChannelId
          ? `<#${settings.discordPurchaseLogChannelId}>`
          : "미설정",
        fence: false,
      },
      {
        name: "충전 로그",
        value: settings.discordChargeLogChannelId
          ? `<#${settings.discordChargeLogChannelId}>`
          : "미설정",
        fence: false,
      },
      {
        name: "후기 로그",
        value: settings.discordReviewLogChannelId
          ? `<#${settings.discordReviewLogChannelId}>`
          : "미설정",
        fence: false,
      },
      {
        name: "입고 로그",
        value: settings.discordRestockLogChannelId
          ? `<#${settings.discordRestockLogChannelId}>${settings.discordRestockRoleId ? ` · <@&${settings.discordRestockRoleId}> 멘션` : ""}`
          : "미설정",
        fence: false,
      },
      {
        name: "랜덤박스 로그",
        value: settings.discordRandomBoxLogChannelId
          ? `<#${settings.discordRandomBoxLogChannelId}>`
          : "미설정",
        fence: false,
      },
    ],
    components: [
      actionRow(
        button({
          customId: cid(shopSlug, "set_plog"),
          label: "구매로그",
          style: ButtonStyle.PRIMARY,
        }),
        button({
          customId: cid(shopSlug, "set_clog"),
          label: "충전로그",
          style: ButtonStyle.PRIMARY,
        }),
        button({
          customId: cid(shopSlug, "set_rlog"),
          label: "후기로그",
          style: ButtonStyle.PRIMARY,
        }),
        button({
          customId: cid(shopSlug, "set_slog"),
          label: "입고로그",
          style: ButtonStyle.PRIMARY,
        }),
        button({
          customId: cid(shopSlug, "set_bbox"),
          label: "랜덤박스",
          style: ButtonStyle.PRIMARY,
        }),
      ),
      actionRow(
        button({
          customId: cid(shopSlug, "bind_guild"),
          label: "이 서버 연결",
          style: ButtonStyle.SUCCESS,
        }),
      ),
    ],
  });
}

export function handleSetLogPrompt(
  shopSlug: string,
  kind: "plog" | "clog" | "rlog" | "slog" | "bbox",
) {
  const shop = getShopBySlug(shopSlug);
  const settings = shop ? getShopSettings(shop.id) : null;
  const titles = {
    plog: "구매 로그 채널 선택",
    clog: "충전 로그 채널 선택",
    rlog: "후기 로그 채널 선택",
    slog: "입고 로그 채널 선택",
    bbox: "랜덤박스 로그 채널 선택",
  } as const;
  const actions = {
    plog: "set_plog_ch",
    clog: "set_clog_ch",
    rlog: "set_rlog_ch",
    slog: "set_slog_ch",
    bbox: "set_bbox_ch",
  } as const;
  const title = titles[kind];
  const row = actionRow(
    channelSelect({
      customId: cid(shopSlug, actions[kind]),
      placeholder: "로그를 보낼 채널",
    }),
  );
  if (!settings) {
    return v2Ephemeral([textDisplay(`## ${title}`), row]);
  }
  return v2Panel(settings, {
    title,
    body: "아래에서 채널을 선택해 주세요.",
    components: [row],
  });
}

export async function handleSetLogChannel(
  shopSlug: string,
  kind: "plog" | "clog" | "rlog" | "slog" | "bbox",
  channelId: string,
  roles: string[],
  permissions?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return plainEphemeral("관리자만 가능해요.");
  }
  const patch =
    kind === "plog"
      ? { discordPurchaseLogChannelId: channelId }
      : kind === "clog"
        ? { discordChargeLogChannelId: channelId }
        : kind === "rlog"
          ? { discordReviewLogChannelId: channelId }
          : kind === "bbox"
            ? { discordRandomBoxLogChannelId: channelId }
            : { discordRestockLogChannelId: channelId };
  updateShopSettings(shop.id, patch);
  await persistAsync();
  const label =
    kind === "plog"
      ? "구매"
      : kind === "clog"
        ? "충전"
        : kind === "rlog"
          ? "후기"
          : kind === "bbox"
            ? "랜덤박스"
            : "입고";
  return plainEphemeral(`${label} 로그 채널을 <#${channelId}> 로 설정했어요.`);
}

export async function handleBindGuild(
  shopSlug: string,
  guildId: string | undefined,
  roles: string[],
  permissions?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  if (!guildId) return plainEphemeral("서버에서만 사용할 수 있어요.");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return plainEphemeral("관리자만 가능해요.");
  }
  updateShopSettings(shop.id, {
    discordBotEnabled: true,
    discordGuildId: guildId,
  });
  await persistAsync();
  return plainEphemeral(`이 서버(\`${guildId}\`)를 상점에 연결했어요.`);
}

export function handleProductAutocomplete(shopSlug: string, query: string) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return { type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT, data: { choices: [] } };
  const q = query.trim().toLowerCase();
  const choices = listProducts(shop.id)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
    .slice(0, 25)
    .map((p) => ({ name: p.name.slice(0, 100), value: p.id }));
  return {
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices },
  };
}

export async function handleStockBoardAdd(
  shopSlug: string,
  productId: string,
  listingKind: "vending" | "individual",
  roles: string[],
  permissions?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) return plainEphemeral("관리자만 가능해요.");
  const product = listProducts(shop.id).find((p) => p.id === productId);
  if (!product) return plainEphemeral("상품을 찾지 못했어요. 웹에서 먼저 등록해 주세요.");
  updateProduct(shop.id, productId, { listingKind, stockBoardHidden: false });
  await persistAsync();
  scheduleDiscordBackground(
    import("@/lib/discord/stock-board").then(({ refreshStockBoard }) => refreshStockBoard(shop.id)),
  );
  return plainEphemeral(
    `**${product.name}** 을(를) 재고현황 **${listingKind === "individual" ? "개별상품" : "자판기상품"}** 에 올렸어요.`,
  );
}

export async function handleStockBoardRemove(
  shopSlug: string,
  productId: string,
  listingKind: "vending" | "individual",
  roles: string[],
  permissions?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) return plainEphemeral("관리자만 가능해요.");
  const product = listProducts(shop.id).find((p) => p.id === productId);
  if (!product) return plainEphemeral("상품을 찾지 못했어요.");
  const current = product.listingKind === "individual" ? "individual" : "vending";
  if (current !== listingKind) {
    return plainEphemeral("그 분류에 올라가 있지 않아요.");
  }
  updateProduct(shop.id, productId, { stockBoardHidden: true });
  await persistAsync();
  scheduleDiscordBackground(
    import("@/lib/discord/stock-board").then(({ refreshStockBoard }) => refreshStockBoard(shop.id)),
  );
  return plainEphemeral(`**${product.name}** 을(를) 재고현황에서 내렸어요.`);
}

/**
 * /재고현황 — 누구나 실시간 재고를 나만 보이게 확인.
 * 관리자가 채널을 고르면 그 채널에 재고판을 올리고, 이후 재고가 바뀔 때마다 자동으로 고친다.
 */
export async function handleStockCommand(
  shopSlug: string,
  channelId: string | null,
  roles: string[],
  permissions?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  await refreshMfaStockIfStale(shop.id);
  const { buildStockPanel, refreshStockBoard } = await import("@/lib/discord/stock-board");
  if (!channelId) return v2Ephemeral(buildStockPanel(shop.id, "view").components);

  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) {
    return plainEphemeral("재고판을 채널에 올리는 건 관리자만 할 수 있어요. 채널 없이 `/재고현황` 만 쓰면 재고를 볼 수 있어요.");
  }
  if (settings.discordStockChannelId !== channelId) {
    updateShopSettings(shop.id, { discordStockChannelId: channelId, discordStockMessageId: null });
    await persistAsync();
  }
  const result = await refreshStockBoard(shop.id);
  if (!result.ok) {
    return plainEphemeral(`<#${channelId}> 에 재고판을 올리지 못했어요. 봇에게 그 채널의 메시지 보내기 권한이 있는지 확인해 주세요.`);
  }
  return fieldEmbed({
    title: "재고판을 올렸어요",
    description: `<#${channelId}> 의 재고판은 구매 · 입고로 재고가 바뀔 때마다 자동으로 고쳐져요.`,
    fields: [],
  });
}

/** 재고현황 버튼 — 새로 열기(view) 또는 지금 메시지를 다시 그리기(refresh) */
export async function handleStockView(shopSlug: string, update: boolean) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  await refreshMfaStockIfStale(shop.id);
  const { buildStockPanel } = await import("@/lib/discord/stock-board");
  const { components } = buildStockPanel(shop.id, "view");
  return update ? v2Update(components) : v2Ephemeral(components);
}

/** /입고알림 — 입고 알림을 보낼 채널과 함께 멘션할 역할 */
export async function handleRestockChannelCommand(
  shopSlug: string,
  channelId: string,
  roleId: string | null,
  roles: string[],
  permissions?: string,
) {
  const shop = getShopBySlug(shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  const settings = getShopSettings(shop.id);
  if (!isDiscordAdmin(settings, roles, permissions)) return plainEphemeral("관리자만 가능해요.");
  if (!channelId) return plainEphemeral("알림을 보낼 채널을 골라 주세요.");
  updateShopSettings(shop.id, { discordRestockLogChannelId: channelId, discordRestockRoleId: roleId });
  await persistAsync();
  return fieldEmbed({
    title: "입고 알림을 켰어요",
    fields: [
      { name: "알림 채널", value: `<#${channelId}>`, fence: false },
      { name: "멘션 역할", value: roleId ? `<@&${roleId}>` : "없음", fence: false },
    ],
    description: "상품 재고가 늘어나면 이 채널에 어떤 상품이 몇 개 들어왔는지 알려 드려요.",
  });
}
