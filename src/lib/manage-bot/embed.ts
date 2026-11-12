import {
  container,
  mediaGallery,
  MessageFlags,
  sectionText,
  separator,
  textDisplay,
  thumbnail,
} from "@/lib/discord/components";
import type { ManageEmbedDraft, ManageEmbedField } from "@/lib/manage-bot/types";

export function emptyEmbedDraft(input: {
  id: string;
  guildId: string;
  ownerDiscordId: string;
  targetChannelId?: string | null;
}): ManageEmbedDraft {
  return {
    id: input.id,
    guildId: input.guildId,
    ownerDiscordId: input.ownerDiscordId,
    content: "",
    title: "",
    url: "",
    description: "",
    color: "",
    authorName: "",
    authorUrl: "",
    authorIcon: "",
    footerText: "",
    footerIcon: "",
    thumbnailUrl: "",
    imageUrl: "",
    timestamp: false,
    fields: [],
    targetChannelId: input.targetChannelId ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function httpUrl(raw: string) {
  const s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s.slice(0, 2048);
}

export function parseEmbedColor(raw: string): number | undefined {
  const s = raw.trim().replace(/^#/, "");
  if (!s) return undefined;
  if (/^[0-9a-fA-F]{6}$/.test(s)) return Number.parseInt(s, 16);
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    const [r, g, b] = s.split("");
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0 && n <= 0xffffff) return Math.floor(n);
  return undefined;
}

export function hasEmbedBody(d: Pick<
  ManageEmbedDraft,
  | "title"
  | "description"
  | "authorName"
  | "footerText"
  | "imageUrl"
  | "thumbnailUrl"
  | "fields"
  | "content"
>) {
  return Boolean(
    d.title.trim() ||
      d.description.trim() ||
      d.authorName.trim() ||
      d.footerText.trim() ||
      d.imageUrl.trim() ||
      d.thumbnailUrl.trim() ||
      d.fields.some((f) => f.name.trim() || f.value.trim()) ||
      d.content.trim(),
  );
}

export function normalizeEmbedFields(fields: ManageEmbedField[] | undefined): ManageEmbedField[] {
  return (fields || [])
    .map((f) => ({
      name: String(f?.name || "").slice(0, 256),
      value: String(f?.value || "").slice(0, 1024),
      inline: Boolean(f?.inline),
    }))
    .filter((f) => f.name.trim() && f.value.trim())
    .slice(0, 25);
}

function mdLink(label: string, url: string | null) {
  if (!url) return label;
  return `[${label}](${url})`;
}

function containerKids(d: ManageEmbedDraft, preview: boolean): unknown[] {
  const filled = hasEmbedBody({ ...d, content: "" });
  if (!filled) {
    if (!preview) return [];
    return [
      textDisplay("## 임베드 생성"),
      separator(true, 1),
      textDisplay("아직 아무것도 안 적었어요.\n**제목 · 부제목 · 내용 · 링크** 등 넣고 싶은 걸 입력해 주세요."),
      separator(true, 1),
      textDisplay(
        d.targetChannelId
          ? `미리보기 · 전송 <#${d.targetChannelId}>`
          : "미리보기 · 전송할 채널을 선택해 주세요",
      ),
    ];
  }

  const kids: unknown[] = [];
  const thumb = httpUrl(d.thumbnailUrl);
  const authorIcon = httpUrl(d.authorIcon);

  if (d.authorName.trim()) {
    const author = mdLink(d.authorName.trim().slice(0, 256), httpUrl(d.authorUrl));
    if (authorIcon) {
      kids.push(sectionText({ text: `**${author}**`, accessory: thumbnail(authorIcon) }));
    } else {
      kids.push(textDisplay(`**${author}**`));
    }
  }

  if (d.title.trim()) {
    const title = mdLink(d.title.trim().slice(0, 256), httpUrl(d.url));
    const heading = `## ${title}`;
    if (thumb && !authorIcon) {
      kids.push(sectionText({ text: heading, accessory: thumbnail(thumb) }));
    } else {
      kids.push(textDisplay(heading));
    }
  } else if (thumb && !authorIcon) {
    kids.push(sectionText({ text: " ", accessory: thumbnail(thumb) }));
  }

  if (d.description.trim()) kids.push(textDisplay(d.description.trim().slice(0, 4000)));

  for (const f of normalizeEmbedFields(d.fields)) {
    kids.push(textDisplay(`**${f.name}**\n${f.value}`));
  }

  const image = httpUrl(d.imageUrl);
  if (image) kids.push(mediaGallery([image]));
  if (thumb && (authorIcon || d.title.trim()) && !image) {
    /* thumbnail already used as accessory */
  } else if (thumb && !d.title.trim() && authorIcon) {
    kids.push(mediaGallery([thumb]));
  }

  const footerBits: string[] = [];
  if (d.footerText.trim()) footerBits.push(d.footerText.trim().slice(0, 2048));
  if (d.timestamp) {
    footerBits.push(
      new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }),
    );
  }
  if (preview) {
    footerBits.push(
      d.targetChannelId ? `전송 <#${d.targetChannelId}>` : "전송할 채널을 선택해 주세요",
    );
  }
  if (footerBits.length) {
    kids.push(separator(true, 1));
    kids.push(textDisplay(footerBits.join(" · ")));
  }

  return kids;
}

export function embedV2Payload(
  d: ManageEmbedDraft,
  opts?: { preview?: boolean; ephemeral?: boolean; extra?: unknown[] },
) {
  const preview = Boolean(opts?.preview);
  const top: unknown[] = [];
  if (preview) {
    top.push(
      textDisplay(
        d.targetChannelId
          ? `전송 채널: <#${d.targetChannelId}>`
          : "전송할 채널을 아래에서 선택해 주세요.",
      ),
    );
    if (!hasEmbedBody(d)) {
      top.push(textDisplay("아직 아무것도 안 적었어요. 제목 / 부제목 / 내용 / 링크를 입력해 주세요."));
    }
  }
  if (d.content.trim()) top.push(textDisplay(d.content.trim().slice(0, 4000)));

  const kids = containerKids(d, preview);
  const accent = parseEmbedColor(d.color);
  const components: unknown[] = [...top];
  if (kids.length) components.push(container(kids, accent ?? null));
  if (opts?.extra?.length) components.push(...opts.extra);

  return {
    flags:
      (opts?.ephemeral ? MessageFlags.EPHEMERAL : 0) | MessageFlags.IS_COMPONENTS_V2,
    components,
  };
}
