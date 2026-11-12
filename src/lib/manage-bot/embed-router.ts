import {
  actionRow,
  button,
  ButtonStyle,
  channelSelect,
  InteractionResponseType,
  MessageFlags,
  showModal,
  textDisplay,
  textInput,
  TextInputStyle,
} from "@/lib/discord/components";
import { scheduleDiscordBackground } from "@/lib/discord/schedule";
import { embedV2Payload, hasEmbedBody } from "@/lib/manage-bot/embed";
import { postManageChannelMessage } from "@/lib/manage-bot/rest";
import {
  appendManageAudit,
  getEmbedDraft,
  patchEmbedDraft,
  persistManageStore,
  resetEmbedDraft,
  upsertUserEmbedDraft,
} from "@/lib/manage-bot/store";
import type { ManageEmbedDraft } from "@/lib/manage-bot/types";

export function canManageEmbeds(permissions?: string) {
  if (!permissions) return false;
  try {
    const p = BigInt(permissions);
    return (
      (p & BigInt(0x8)) === BigInt(0x8) ||
      (p & BigInt(0x20)) === BigInt(0x20) ||
      (p & BigInt(0x2000)) === BigInt(0x2000)
    );
  } catch {
    return false;
  }
}

function cid(guildId: string, draftId: string, action: string) {
  return `mg|${guildId}|emb|${draftId}|${action}`.slice(0, 100);
}

function mid(guildId: string, draftId: string, action: string) {
  return `mg|${guildId}|embm|${draftId}|${action}`.slice(0, 100);
}

function persistLater() {
  scheduleDiscordBackground(persistManageStore());
}

function embedBuilderPayload(draft: ManageEmbedDraft, update: boolean) {
  const controls = [
    actionRow(
      button({ customId: cid(draft.guildId, draft.id, "title"), label: "제목 / 링크", style: ButtonStyle.SECONDARY }),
      button({ customId: cid(draft.guildId, draft.id, "desc"), label: "내용", style: ButtonStyle.SECONDARY }),
      button({ customId: cid(draft.guildId, draft.id, "author"), label: "부제목", style: ButtonStyle.SECONDARY }),
      button({ customId: cid(draft.guildId, draft.id, "color"), label: "색상", style: ButtonStyle.SECONDARY }),
    ),
    actionRow(
      button({ customId: cid(draft.guildId, draft.id, "image"), label: "이미지", style: ButtonStyle.SECONDARY }),
      button({ customId: cid(draft.guildId, draft.id, "footer"), label: "푸터", style: ButtonStyle.SECONDARY }),
      button({ customId: cid(draft.guildId, draft.id, "field"), label: "필드 추가", style: ButtonStyle.SECONDARY }),
      button({
        customId: cid(draft.guildId, draft.id, "fielddel"),
        label: "필드 삭제",
        style: ButtonStyle.SECONDARY,
        disabled: draft.fields.length === 0,
      }),
    ),
    actionRow(
      button({ customId: cid(draft.guildId, draft.id, "body"), label: "본문 메시지", style: ButtonStyle.SECONDARY }),
      button({
        customId: cid(draft.guildId, draft.id, "ts"),
        label: draft.timestamp ? "시간 ON" : "시간 OFF",
        style: draft.timestamp ? ButtonStyle.SUCCESS : ButtonStyle.SECONDARY,
      }),
      button({ customId: cid(draft.guildId, draft.id, "reset"), label: "초기화", style: ButtonStyle.DANGER }),
    ),
    actionRow(
      channelSelect({
        customId: cid(draft.guildId, draft.id, "ch"),
        placeholder: "전송할 채널 선택",
        channelTypes: [0, 5],
      }),
    ),
    actionRow(
      button({ customId: cid(draft.guildId, draft.id, "send"), label: "채널로 전송", style: ButtonStyle.SUCCESS }),
    ),
  ];
  const payload = embedV2Payload(draft, { preview: true, ephemeral: true, extra: controls });
  return {
    type: update
      ? InteractionResponseType.UPDATE_MESSAGE
      : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: payload,
  };
}

function ephemeralText(content: string) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.EPHEMERAL | MessageFlags.IS_COMPONENTS_V2,
      components: [textDisplay(content.slice(0, 4000))],
    },
  };
}

export function openEmbedBuilder(input: {
  guildId: string;
  ownerDiscordId: string;
  channelId?: string | null;
}) {
  const draft = upsertUserEmbedDraft({
    guildId: input.guildId,
    ownerDiscordId: input.ownerDiscordId,
    targetChannelId: input.channelId || null,
  });
  persistLater();
  return embedBuilderPayload(draft, false);
}

function modalFor(draft: ManageEmbedDraft, action: string) {
  const g = draft.guildId;
  const d = draft.id;
  if (action === "title") {
    return showModal({
      customId: mid(g, d, "title"),
      title: "제목 / 링크",
      inputs: [
        textInput({
          customId: "title",
          label: "제목",
          required: false,
          maxLength: 256,
          value: draft.title,
          placeholder: "임베드 제목",
        }),
        textInput({
          customId: "url",
          label: "제목 링크 (https://)",
          required: false,
          maxLength: 400,
          value: draft.url,
          placeholder: "https://",
        }),
      ],
    });
  }
  if (action === "desc") {
    return showModal({
      customId: mid(g, d, "desc"),
      title: "내용",
      inputs: [
        textInput({
          customId: "description",
          label: "내용",
          style: TextInputStyle.PARAGRAPH,
          required: false,
          maxLength: 4000,
          value: draft.description,
          placeholder: "본문 설명",
        }),
      ],
    });
  }
  if (action === "author") {
    return showModal({
      customId: mid(g, d, "author"),
      title: "부제목 (작성자)",
      inputs: [
        textInput({
          customId: "authorName",
          label: "부제목",
          required: false,
          maxLength: 256,
          value: draft.authorName,
        }),
        textInput({
          customId: "authorUrl",
          label: "부제목 링크",
          required: false,
          maxLength: 400,
          value: draft.authorUrl,
        }),
        textInput({
          customId: "authorIcon",
          label: "부제목 아이콘 URL",
          required: false,
          maxLength: 400,
          value: draft.authorIcon,
        }),
      ],
    });
  }
  if (action === "color") {
    return showModal({
      customId: mid(g, d, "color"),
      title: "색상",
      inputs: [
        textInput({
          customId: "color",
          label: "색상 (비우면 없음)",
          required: false,
          maxLength: 20,
          value: draft.color,
          placeholder: "#RRGGBB 또는 비움",
        }),
      ],
    });
  }
  if (action === "image") {
    return showModal({
      customId: mid(g, d, "image"),
      title: "이미지",
      inputs: [
        textInput({
          customId: "imageUrl",
          label: "큰 이미지 URL",
          required: false,
          maxLength: 400,
          value: draft.imageUrl,
        }),
        textInput({
          customId: "thumbnailUrl",
          label: "썸네일 URL",
          required: false,
          maxLength: 400,
          value: draft.thumbnailUrl,
        }),
      ],
    });
  }
  if (action === "footer") {
    return showModal({
      customId: mid(g, d, "footer"),
      title: "푸터",
      inputs: [
        textInput({
          customId: "footerText",
          label: "푸터 텍스트",
          required: false,
          maxLength: 2048,
          value: draft.footerText,
        }),
        textInput({
          customId: "footerIcon",
          label: "푸터 아이콘 URL",
          required: false,
          maxLength: 400,
          value: draft.footerIcon,
        }),
      ],
    });
  }
  if (action === "field") {
    return showModal({
      customId: mid(g, d, "field"),
      title: "필드 추가",
      inputs: [
        textInput({ customId: "name", label: "필드 제목", required: true, maxLength: 256 }),
        textInput({
          customId: "value",
          label: "필드 내용",
          style: TextInputStyle.PARAGRAPH,
          required: true,
          maxLength: 1024,
        }),
        textInput({
          customId: "inline",
          label: "한 줄에 나란히 (예 / 아니오)",
          required: false,
          maxLength: 10,
          placeholder: "아니오",
        }),
      ],
    });
  }
  if (action === "body") {
    return showModal({
      customId: mid(g, d, "body"),
      title: "본문 메시지",
      inputs: [
        textInput({
          customId: "content",
          label: "임베드 위에 붙는 메시지",
          style: TextInputStyle.PARAGRAPH,
          required: false,
          maxLength: 2000,
          value: draft.content,
        }),
      ],
    });
  }
  return null;
}

export async function handleEmbedComponent(input: {
  parts: string[];
  actorId: string;
  values?: string[];
  fields: Map<string, string>;
  isModal: boolean;
}) {
  const guildId = input.parts[1] || "";
  const draftId = input.parts[3] || "";
  const action = input.parts[4] || "";
  const draft = getEmbedDraft(draftId);
  if (!draft || draft.guildId !== guildId) {
    return ephemeralText("임베드 초안을 찾을 수 없어요. `/임배드생성`을 다시 실행해 주세요.");
  }
  if (draft.ownerDiscordId !== input.actorId) {
    return ephemeralText("직접 만든 임베드만 수정할 수 있어요.");
  }

  if (!input.isModal) {
    if (action === "ch") {
      const channelId = String(input.values?.[0] || "");
      patchEmbedDraft(draft.id, { targetChannelId: channelId || null });
      persistLater();
      return embedBuilderPayload(getEmbedDraft(draft.id)!, true);
    }
    if (action === "ts") {
      patchEmbedDraft(draft.id, { timestamp: !draft.timestamp });
      persistLater();
      return embedBuilderPayload(getEmbedDraft(draft.id)!, true);
    }
    if (action === "reset") {
      resetEmbedDraft(draft.id);
      persistLater();
      return embedBuilderPayload(getEmbedDraft(draft.id)!, true);
    }
    if (action === "fielddel") {
      patchEmbedDraft(draft.id, { fields: draft.fields.slice(0, -1) });
      persistLater();
      return embedBuilderPayload(getEmbedDraft(draft.id)!, true);
    }
    if (action === "send") {
      return sendDraft(getEmbedDraft(draft.id)!);
    }
    const modal = modalFor(draft, action);
    if (modal) return modal;
    return ephemeralText("알 수 없는 버튼이에요.");
  }

  const f = input.fields;
  if (action === "title") {
    patchEmbedDraft(draft.id, { title: f.get("title") || "", url: f.get("url") || "" });
  } else if (action === "desc") {
    patchEmbedDraft(draft.id, { description: f.get("description") || "" });
  } else if (action === "author") {
    patchEmbedDraft(draft.id, {
      authorName: f.get("authorName") || "",
      authorUrl: f.get("authorUrl") || "",
      authorIcon: f.get("authorIcon") || "",
    });
  } else if (action === "color") {
    patchEmbedDraft(draft.id, { color: (f.get("color") || "").trim() });
  } else if (action === "image") {
    patchEmbedDraft(draft.id, {
      imageUrl: f.get("imageUrl") || "",
      thumbnailUrl: f.get("thumbnailUrl") || "",
    });
  } else if (action === "footer") {
    patchEmbedDraft(draft.id, {
      footerText: f.get("footerText") || "",
      footerIcon: f.get("footerIcon") || "",
    });
  } else if (action === "body") {
    patchEmbedDraft(draft.id, { content: f.get("content") || "" });
  } else if (action === "field") {
    const name = (f.get("name") || "").trim();
    const value = (f.get("value") || "").trim();
    if (name && value) {
      const inline = /^(1|y|yes|true|예|ㅇ)/i.test((f.get("inline") || "").trim());
      patchEmbedDraft(draft.id, { fields: [...draft.fields, { name, value, inline }].slice(0, 25) });
    }
  }
  persistLater();
  return embedBuilderPayload(getEmbedDraft(draft.id)!, true);
}

async function sendDraft(draft: ManageEmbedDraft) {
  if (!hasEmbedBody(draft)) {
    return ephemeralText("아직 아무것도 안 적었어요. 제목 / 부제목 / 내용 / 링크 중 하나 이상을 적어 주세요.");
  }
  if (!draft.targetChannelId) {
    return ephemeralText("전송할 채널을 먼저 선택해 주세요.");
  }
  const payload = embedV2Payload(draft);
  const posted = await postManageChannelMessage(draft.targetChannelId, payload);
  if (!posted.ok) {
    const msg =
      posted.json && typeof posted.json === "object" && "message" in posted.json
        ? String((posted.json as { message?: string }).message)
        : `전송 실패 (${posted.status})`;
    return ephemeralText(msg);
  }
  appendManageAudit({
    guildId: draft.guildId,
    actor: draft.ownerDiscordId,
    action: "embed_send",
    detail: `<#${draft.targetChannelId}> · ${draft.title || "임베드"}`,
  });
  persistLater();
  return ephemeralText(`전송했어요. <#${draft.targetChannelId}>`);
}
