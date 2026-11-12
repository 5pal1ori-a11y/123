import {
  actionRow,
  button,
  ButtonStyle,
  channelSelect,
  cid,
  container,
  mediaGallery,
  MessageFlags,
  modalFieldValue,
  plainEphemeral,
  sectionText,
  separator,
  showModal,
  stringSelect,
  textDisplay,
  textInput,
  TextInputStyle,
  thumbnail,
  v2Ephemeral,
  v2Update,
  type DiscordInteraction,
} from "@/lib/discord/components";
import { isDiscordAdmin } from "@/lib/discord/handlers";
import { postChannelMessage } from "@/lib/discord/rest";
import { getShopBySlug, getShopSettings } from "@/lib/store";
import { kvGetJson, kvPutJson } from "@/lib/world/kv";

/** /임배드생성 — 미리보기를 보면서 항목을 하나씩 넣고, 고른 채널로 보내는 Components V2 메시지 만들기 */

type TextField = "top" | "title" | "subtitle" | "body" | "footer" | "image" | "thumbnail";

export type EmbedDraft = Partial<Record<TextField, string>> & {
  divider?: boolean;
  buttons?: { label: string; url: string }[];
};

type Ctx = {
  shopSlug: string;
  guildId: string;
  userId: string;
  roles: string[];
  permissions?: string;
};

const FIELDS: Record<TextField, { label: string; placeholder: string; max: number; paragraph?: boolean; url?: boolean }> = {
  title: { label: "제목", placeholder: "예: 신규 상품 입고 안내", max: 200 },
  subtitle: { label: "부제목", placeholder: "제목 아래 작게 들어가는 한 줄", max: 200 },
  body: { label: "내용", placeholder: "본문 내용 (**굵게**, 줄바꿈 사용 가능)", max: 3000, paragraph: true },
  footer: { label: "푸터", placeholder: "맨 아래 작은 글씨", max: 300 },
  image: { label: "이미지 URL", placeholder: "https:// 로 시작하는 큰 이미지 주소", max: 1000, url: true },
  thumbnail: { label: "썸네일 URL", placeholder: "https:// 로 시작하는 오른쪽 작은 이미지 주소", max: 1000, url: true },
  top: { label: "메시지 위 텍스트", placeholder: "박스 위에 따로 보이는 글 (@역할 멘션 등)", max: 1000, paragraph: true },
};

const MAX_BUTTONS = 5;
const DRAFT_TTL_SEC = 3 * 24 * 60 * 60;

const draftKey = (c: Ctx) => `does:embed:${c.guildId}:${c.userId}`;

async function loadDraft(c: Ctx) {
  return (await kvGetJson<EmbedDraft>(draftKey(c))) ?? {};
}

function saveDraft(c: Ctx, draft: EmbedDraft) {
  return kvPutJson(draftKey(c), draft, DRAFT_TTL_SEC);
}

function isEmpty(d: EmbedDraft) {
  return !d.top && !d.title && !d.subtitle && !d.body && !d.footer && !d.image && !d.thumbnail && !d.buttons?.length;
}

function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** 이미지가 아닌 주소를 미디어로 넣으면 Discord 가 메시지 전체를 거절하므로 미리 걸러 낸다. 확인이 안 되면 통과 */
async function isImageUrl(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return res.status === 405 || res.status === 403;
    const type = res.headers.get("content-type") ?? "";
    return !type || type.startsWith("image/") || type.startsWith("application/octet-stream");
  } catch {
    return true;
  }
}

/** 실제로 채널에 보내질 모양 그대로 — 미리보기와 전송이 같은 함수를 쓴다 */
export function renderDraft(d: EmbedDraft): unknown[] {
  if (isEmpty(d)) return [container([textDisplay("비어있습니다")])];

  const kids: unknown[] = d.image ? [mediaGallery([d.image])] : [];
  const head = [d.title && `## ${d.title}`, d.subtitle && `### ${d.subtitle}`].filter(Boolean).join("\n");
  let body = d.body;
  if (d.thumbnail && (head || body)) {
    kids.push(sectionText({ text: head || body!, accessory: thumbnail(d.thumbnail) }));
    if (!head) body = undefined;
  } else {
    if (head) kids.push(textDisplay(head));
    if (d.thumbnail) kids.push(mediaGallery([d.thumbnail]));
  }
  if (body) {
    if (d.divider && (head || d.thumbnail)) kids.push(separator(true, 1));
    kids.push(textDisplay(body));
  }
  if (d.buttons?.length) {
    kids.push(actionRow(...d.buttons.map((b) => button({ label: b.label, url: b.url, style: ButtonStyle.LINK }))));
  }
  if (d.footer) {
    kids.push(separator(true, 1));
    kids.push(textDisplay(`-# ${d.footer}`));
  }
  if (!kids.length) kids.push(textDisplay("비어있습니다"));

  return [...(d.top ? [textDisplay(d.top)] : []), container(kids)];
}

function preview(value: string | undefined) {
  if (!value) return "비어 있음";
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

function builderComponents(shopSlug: string, d: EmbedDraft, notice?: string) {
  const buttons = d.buttons ?? [];
  const options = [
    ...(["title", "subtitle", "body", "footer", "image", "thumbnail", "top"] as const).map((f) => ({
      label: FIELDS[f].label,
      value: f,
      description: preview(d[f]),
    })),
    {
      label: "링크 버튼 추가",
      value: "button",
      description: buttons.length >= MAX_BUTTONS ? `최대 ${MAX_BUTTONS}개까지 넣을 수 있어요` : `지금 ${buttons.length}개`,
    },
    ...(buttons.length ? [{ label: "링크 버튼 모두 지우기", value: "clear_buttons", description: `${buttons.length}개 삭제` }] : []),
    { label: d.divider ? "구분선 빼기" : "구분선 넣기", value: "divider", description: "제목과 내용 사이 가로줄" },
  ];
  return [
    ...renderDraft(d),
    textDisplay(`-# ↑ 미리보기 · 넣을 항목을 고르면 바로 반영돼요${notice ? `\n${notice}` : ""}`),
    actionRow(stringSelect({ customId: cid(shopSlug, "emb_pick"), placeholder: "넣을 항목을 선택하세요", options })),
    actionRow(
      button({ label: "전송하기", customId: cid(shopSlug, "emb_send") }),
      button({ label: "처음부터", customId: cid(shopSlug, "emb_reset") }),
    ),
  ];
}

function channelComponents(shopSlug: string, d: EmbedDraft) {
  return [
    ...renderDraft(d),
    textDisplay("**전송할 채널을 선택해 주세요**"),
    actionRow(channelSelect({ customId: cid(shopSlug, "emb_ch"), placeholder: "보낼 채널", channelTypes: [0, 5] })),
    actionRow(button({ label: "뒤로", customId: cid(shopSlug, "emb_back") })),
  ];
}

function denyUnlessAdmin(c: Ctx) {
  const shop = getShopBySlug(c.shopSlug);
  if (!shop) return plainEphemeral("상점 없음");
  if (!isDiscordAdmin(getShopSettings(shop.id), c.roles, c.permissions)) {
    return plainEphemeral("관리자만 사용할 수 있어요.");
  }
  return null;
}

export async function handleEmbedCommand(c: Ctx) {
  const denied = denyUnlessAdmin(c);
  if (denied) return denied;
  await saveDraft(c, {});
  return v2Ephemeral(builderComponents(c.shopSlug, {}));
}

/** 셀렉트에서 항목을 고르면 입력 모달을 띄우거나(텍스트 · 버튼), 바로 반영한다(구분선 · 버튼 지우기) */
export async function handleEmbedPick(c: Ctx, value: string) {
  const denied = denyUnlessAdmin(c);
  if (denied) return denied;
  const d = await loadDraft(c);

  if (value === "divider" || value === "clear_buttons") {
    if (value === "divider") d.divider = !d.divider;
    else d.buttons = [];
    await saveDraft(c, d);
    return v2Update(builderComponents(c.shopSlug, d));
  }

  if (value === "button") {
    if ((d.buttons?.length ?? 0) >= MAX_BUTTONS) {
      return v2Update(builderComponents(c.shopSlug, d, `링크 버튼은 최대 ${MAX_BUTTONS}개까지예요.`));
    }
    return showModal({
      customId: cid(c.shopSlug, "emb_modal", "button"),
      title: "링크 버튼 추가",
      inputs: [
        textInput({ customId: "label", label: "버튼 글자", placeholder: "예: 구매하러 가기", maxLength: 80 }),
        textInput({ customId: "url", label: "이동할 주소", placeholder: "https://", maxLength: 512 }),
      ],
    });
  }

  if (!(value in FIELDS)) return v2Update(builderComponents(c.shopSlug, d));
  const field = FIELDS[value as TextField];
  return showModal({
    customId: cid(c.shopSlug, "emb_modal", value),
    title: `${field.label} 넣기`,
    inputs: [
      textInput({
        customId: "value",
        label: `${field.label} (비우면 삭제)`,
        placeholder: field.placeholder,
        style: field.paragraph ? TextInputStyle.PARAGRAPH : TextInputStyle.SHORT,
        required: false,
        maxLength: field.max,
        value: d[value as TextField],
      }),
    ],
  });
}

export async function handleEmbedModal(c: Ctx, field: string, interaction: DiscordInteraction) {
  const denied = denyUnlessAdmin(c);
  if (denied) return denied;
  const d = await loadDraft(c);

  if (field === "button") {
    const label = modalFieldValue(interaction, "label");
    const url = modalFieldValue(interaction, "url");
    if (!label || !isHttpUrl(url)) {
      return v2Update(builderComponents(c.shopSlug, d, "버튼 주소는 https:// 로 시작해야 해요."));
    }
    d.buttons = [...(d.buttons ?? []), { label, url }].slice(0, MAX_BUTTONS);
  } else if (field in FIELDS) {
    const key = field as TextField;
    const value = modalFieldValue(interaction, "value");
    if (value && FIELDS[key].url && !isHttpUrl(value)) {
      return v2Update(builderComponents(c.shopSlug, d, `${FIELDS[key].label}은(는) https:// 로 시작하는 주소여야 해요.`));
    }
    if (value && FIELDS[key].url && !(await isImageUrl(value))) {
      return v2Update(builderComponents(c.shopSlug, d, "그 주소는 이미지가 아니에요. 이미지 파일 주소(.png · .jpg · .gif 등)를 넣어 주세요."));
    }
    if (value) d[key] = value;
    else delete d[key];
  }

  await saveDraft(c, d);
  return v2Update(builderComponents(c.shopSlug, d));
}

export async function handleEmbedStep(c: Ctx, step: "send" | "back" | "reset") {
  const denied = denyUnlessAdmin(c);
  if (denied) return denied;
  if (step === "reset") {
    await saveDraft(c, {});
    return v2Update(builderComponents(c.shopSlug, {}));
  }
  const d = await loadDraft(c);
  if (step === "send") {
    if (isEmpty(d)) return v2Update(builderComponents(c.shopSlug, d, "비어 있는 메시지는 보낼 수 없어요. 먼저 항목을 넣어 주세요."));
    return v2Update(channelComponents(c.shopSlug, d));
  }
  return v2Update(builderComponents(c.shopSlug, d));
}

export async function handleEmbedChannel(c: Ctx, channelId: string) {
  const denied = denyUnlessAdmin(c);
  if (denied) return denied;
  const d = await loadDraft(c);
  if (isEmpty(d)) return v2Update(builderComponents(c.shopSlug, d, "비어 있는 메시지는 보낼 수 없어요."));

  const shop = getShopBySlug(c.shopSlug);
  const posted = await postChannelMessage(
    channelId,
    {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components: renderDraft(d),
      allowed_mentions: { parse: ["users", "roles", "everyone"] },
    },
    shop?.id,
  );
  if (!posted.ok) {
    const reason =
      posted.status === 403
        ? "봇에게 그 채널의 보기 · 메시지 보내기 권한이 없어요."
        : posted.status === 400
          ? "Discord 가 메시지를 거절했어요. 이미지 · 버튼 주소가 올바른지 확인해 주세요."
          : "전송하지 못했어요. 잠시 후 다시 시도해 주세요.";
    return v2Update(builderComponents(c.shopSlug, d, `<#${channelId}> 전송 실패 — ${reason}`));
  }
  return v2Update(builderComponents(c.shopSlug, d, `<#${channelId}> 에 전송했어요. 이어서 고쳐서 다른 채널에도 보낼 수 있어요.`));
}
