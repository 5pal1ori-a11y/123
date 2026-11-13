/** Discord Interaction / Components V2 helpers */

export const DISCORD_API = "https://discord.com/api/v10";

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const;

export const TextInputStyle = {
  SHORT: 1,
  PARAGRAPH: 2,
} as const;

export const MessageFlags = {
  EPHEMERAL: 1 << 6,
  IS_COMPONENTS_V2: 1 << 15,
} as const;

export const ComponentType = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  USER_SELECT: 5,
  ROLE_SELECT: 6,
  MENTIONABLE_SELECT: 7,
  CHANNEL_SELECT: 8,
  SECTION: 9,
  TEXT_DISPLAY: 10,
  THUMBNAIL: 11,
  MEDIA_GALLERY: 12,
  FILE: 13,
  SEPARATOR: 14,
  CONTAINER: 17,
} as const;

export const ButtonStyle = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5,
} as const;

export type DiscordInteraction = {
  id: string;
  token: string;
  type: number;
  application_id: string;
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: { id: string; username: string; global_name?: string | null };
    roles: string[];
    permissions?: string;
  };
  user?: { id: string; username: string; global_name?: string | null };
  /** 버튼·셀렉트를 누른 그 메시지 (컴포넌트 상호작용일 때만) */
  message?: { id: string; channel_id?: string };
  data?: {
    id?: string;
    name?: string;
    custom_id?: string;
    component_type?: number;
    values?: string[];
    options?: { name: string; type: number; value: string | number | boolean; focused?: boolean }[];
    components?: unknown[];
    resolved?: {
      users?: Record<string, { id?: string; username?: string; global_name?: string | null }>;
    };
  };
};

export function actorFromInteraction(i: DiscordInteraction) {
  const user = i.member?.user ?? i.user;
  if (!user) return null;
  return {
    id: user.id,
    username: user.username || user.global_name || user.id,
    roles: i.member?.roles ?? [],
  };
}

export function optionValue(i: DiscordInteraction, name: string) {
  const opt = i.data?.options?.find((o) => o.name === name);
  return opt?.value;
}

export function textDisplay(content: string) {
  return { type: ComponentType.TEXT_DISPLAY, content };
}

export function separator(divider = true, spacing: 1 | 2 = 1) {
  return { type: ComponentType.SEPARATOR, divider, spacing };
}

export function mediaGallery(urls: string[]) {
  return {
    type: ComponentType.MEDIA_GALLERY,
    items: urls
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((url) => ({ media: { url } })),
  };
}

export function container(components: unknown[], accentColor?: number | null) {
  return {
    type: ComponentType.CONTAINER,
    components,
    ...(accentColor != null ? { accent_color: accentColor } : {}),
  };
}

export function thumbnail(url: string) {
  return {
    type: ComponentType.THUMBNAIL,
    media: { url: url.slice(0, 2048) },
  };
}

export function sectionText(opts: { text: string; accessory?: unknown }) {
  return {
    type: ComponentType.SECTION,
    components: [textDisplay(opts.text.slice(0, 4000))],
    ...(opts.accessory ? { accessory: opts.accessory } : {}),
  };
}

/** Components V2 Section — text on the left, button/thumbnail accessory on the right */
export function section(opts: {
  text: string;
  accessory: ReturnType<typeof button>;
}) {
  return {
    type: ComponentType.SECTION,
    components: [textDisplay(opts.text.slice(0, 4000))],
    accessory: opts.accessory,
  };
}

export function actionRow(...components: unknown[]) {
  return { type: ComponentType.ACTION_ROW, components };
}

/** DOES 봇 버튼은 링크를 빼고 모두 secondary(회색) 하나로 통일한다 — style 은 LINK 여부만 본다 */
export function button(opts: {
  customId?: string;
  label: string;
  style?: number;
  disabled?: boolean;
  emoji?: string;
  url?: string;
}) {
  const isLink = opts.style === ButtonStyle.LINK || Boolean(opts.url);
  return {
    type: ComponentType.BUTTON,
    style: isLink ? ButtonStyle.LINK : ButtonStyle.SECONDARY,
    label: opts.label.slice(0, 80),
    disabled: opts.disabled ?? false,
    ...(isLink
      ? { url: (opts.url ?? "").slice(0, 512) }
      : { custom_id: (opts.customId ?? "btn").slice(0, 100) }),
    ...(opts.emoji ? { emoji: { name: opts.emoji } } : {}),
  };
}

export function stringSelect(opts: {
  customId: string;
  placeholder: string;
  options: { label: string; value: string; description?: string }[];
  minValues?: number;
  maxValues?: number;
}) {
  return {
    type: ComponentType.STRING_SELECT,
    custom_id: opts.customId,
    placeholder: opts.placeholder.slice(0, 150),
    min_values: opts.minValues ?? 1,
    max_values: opts.maxValues ?? 1,
    options: opts.options.slice(0, 25).map((o) => ({
      label: o.label.slice(0, 100),
      value: o.value.slice(0, 100),
      ...(o.description ? { description: o.description.slice(0, 100) } : {}),
    })),
  };
}

/** 컨테이너 하나짜리 Components V2 메시지 본문 (채널 전송 · DM 용) */
export function v2Message(kids: unknown[], before: unknown[] = []) {
  return {
    flags: MessageFlags.IS_COMPONENTS_V2,
    components: [...before, container(kids)],
  };
}

export function channelSelect(opts: {
  customId: string;
  placeholder: string;
  channelTypes?: number[];
}) {
  return {
    type: ComponentType.CHANNEL_SELECT,
    custom_id: opts.customId,
    placeholder: opts.placeholder.slice(0, 150),
    min_values: 1,
    max_values: 1,
    channel_types: opts.channelTypes ?? [0], // GUILD_TEXT
  };
}

/** Ephemeral Components V2 response */
export function v2Ephemeral(components: unknown[]) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.EPHEMERAL | MessageFlags.IS_COMPONENTS_V2,
      components,
    },
  };
}

/** Public Components V2 (visible to everyone in the channel) */
export function v2Public(components: unknown[]) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components,
    },
  };
}

export function v2Update(components: unknown[]) {
  return {
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      flags: MessageFlags.IS_COMPONENTS_V2,
      components,
    },
  };
}

export function plainEphemeral(content: string) {
  return v2Ephemeral([textDisplay(content.slice(0, 4000))]);
}

/** Triple-backtick fence for Discord values */
export function codeFence(value: string) {
  const safe = String(value ?? "").replace(/```/g, "'''").slice(0, 1000);
  return `\`\`\`\n${safe}\n\`\`\``;
}

export function inlineCode(value: string) {
  return `\`${String(value ?? "").replace(/`/g, "'").slice(0, 100)}\``;
}

function formatFieldValue(f: { value: string; fence?: boolean }) {
  if (f.fence === false) return f.value.slice(0, 1024);
  if (f.value.includes("```")) return f.value.slice(0, 1024);
  return codeFence(f.value);
}

/** Components V2 panel — each field is its own TextDisplay (버튼자판기 style) */
export function fieldEmbed(opts: {
  title?: string;
  description?: string;
  color?: number;
  fields: { name: string; value: string; inline?: boolean; fence?: boolean }[];
  components?: unknown[];
  ephemeral?: boolean;
  public?: boolean;
  /** Update the message that triggered the component interaction */
  update?: boolean;
}) {
  const kids: unknown[] = [];
  if (opts.title) {
    kids.push(textDisplay(`## ${opts.title}`.slice(0, 4000)));
    if (opts.description || opts.fields.length || opts.components?.length) {
      kids.push(separator(true, 1));
    }
  }
  const descFirst = Boolean(opts.description && !opts.fields.length);
  if (descFirst && opts.description) {
    kids.push(textDisplay(opts.description.slice(0, 4000)));
  }
  for (const f of opts.fields) {
    kids.push(
      textDisplay(`**${f.name}**\n${formatFieldValue(f)}`.slice(0, 4000)),
    );
  }
  if (!descFirst && opts.description) {
    kids.push(separator(true, 1));
    kids.push(textDisplay(opts.description.slice(0, 4000)));
  }
  if (opts.components?.length) {
    kids.push(separator(true, 2));
    kids.push(...opts.components);
  }

  const wrapped = [container(kids)];
  if (opts.update) return v2Update(wrapped);
  if (opts.public) return v2Public(wrapped);
  return v2Ephemeral(wrapped);
}

/** ## 오류 / ## 안내 스타일 ephemeral */
export function errorPanel(message: string, title = "오류") {
  return fieldEmbed({
    title,
    description: message,
    fields: [],
  });
}

export function textInput(opts: {
  customId: string;
  label: string;
  style?: number;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  value?: string;
}) {
  return {
    type: ComponentType.TEXT_INPUT,
    custom_id: opts.customId,
    label: opts.label.slice(0, 45),
    style: opts.style ?? TextInputStyle.SHORT,
    required: opts.required ?? true,
    ...(opts.placeholder ? { placeholder: opts.placeholder.slice(0, 100) } : {}),
    ...(opts.minLength != null ? { min_length: opts.minLength } : {}),
    ...(opts.maxLength != null ? { max_length: opts.maxLength } : {}),
    ...(opts.value ? { value: opts.value.slice(0, 4000) } : {}),
  };
}

/** Open a Discord modal (interaction response type 9) */
export function showModal(opts: {
  customId: string;
  title: string;
  inputs: ReturnType<typeof textInput>[];
}) {
  return {
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: opts.customId.slice(0, 100),
      title: opts.title.slice(0, 45),
      components: opts.inputs.slice(0, 5).map((input) => actionRow(input)),
    },
  };
}

/** Read a text input value from a modal submit payload */
export function modalFieldValue(interaction: DiscordInteraction, fieldId: string): string {
  const rows = interaction.data?.components;
  if (!Array.isArray(rows)) return "";
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const comps = (row as { components?: unknown[] }).components;
    if (!Array.isArray(comps)) continue;
    for (const c of comps) {
      if (!c || typeof c !== "object") continue;
      const field = c as { custom_id?: string; value?: string };
      if (field.custom_id === fieldId) return String(field.value ?? "").trim();
    }
  }
  return "";
}

/** custom_id: vx|{shopSlug}|{action}|{payload?} */
export function cid(shopSlug: string, action: string, payload = "") {
  const base = `vx|${shopSlug}|${action}`;
  const full = payload ? `${base}|${payload}` : base;
  return full.slice(0, 100);
}

export function parseCid(customId: string) {
  const parts = customId.split("|");
  if (parts[0] !== "vx" || parts.length < 3) return null;
  return {
    shopSlug: parts[1]!,
    action: parts[2]!,
    payload: parts.slice(3).join("|"),
  };
}
