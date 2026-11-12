"use client";

import type { ReactNode } from "react";

/** Discord 스타일 메시지 본문을 웹용으로 가볍게 렌더 */
export function TicketRichContent({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const text = content?.trim() || "";
  if (!text) {
    return <span className={`text-[var(--ad-muted)] ${className}`}>(빈 메시지)</span>;
  }

  const blocks = splitBlocks(text);

  return (
    <div className={`space-y-2 text-left text-[13px] leading-relaxed sm:text-sm ${className}`}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

type Block =
  | { type: "h"; text: string }
  | { type: "p"; text: string }
  | { type: "buttons"; labels: string[] }
  | { type: "card"; rows: { label: string; value: string }[] };

function splitBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  let buttons: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join("\n").trim();
    para = [];
    if (!joined) return;
    const card = tryParseCard(joined);
    if (card) out.push({ type: "card", rows: card });
    else out.push({ type: "p", text: joined });
  };

  const flushButtons = () => {
    if (!buttons.length) return;
    out.push({ type: "buttons", labels: buttons });
    buttons = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const btn = line.match(/^\[버튼:\s*(.+?)\]\s*$/);
    if (btn) {
      flushPara();
      buttons.push(btn[1].trim());
      continue;
    }
    flushButtons();

    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      flushPara();
      out.push({ type: "h", text: h[1].trim() });
      continue;
    }

    if (!line.trim()) {
      flushPara();
      continue;
    }
    para.push(line);
  }
  flushButtons();
  flushPara();
  return out;
}

function tryParseCard(text: string): { label: string; value: string }[] | null {
  const rows: { label: string; value: string }[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  for (const line of lines) {
    const m =
      line.match(/^\*?\*?([^*\n：:]+)\*?\*?\s*[：:]\s*`?([^`\n]+)`?\s*$/) ||
      line.match(/^([^：:\n]{1,20})\s*[：:]\s*(.+)$/);
    if (!m) return null;
    rows.push({ label: m[1].replace(/\*/g, "").trim(), value: m[2].trim() });
  }
  if (rows.length < 2) return null;
  const labels = rows.map((r) => r.label);
  const looksFinancial = labels.some((l) => /금액|입금|은행|계좌|포인트|충전/.test(l));
  return looksFinancial ? rows : null;
}

function Block({ block }: { block: Block }) {
  if (block.type === "h") {
    return (
      <p className="text-[15px] font-bold tracking-tight text-[var(--ad-text)] sm:text-base">
        {inlineFormat(block.text)}
      </p>
    );
  }
  if (block.type === "buttons") {
    return (
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {block.labels.map((label) => (
          <span
            key={label}
            className="inline-flex items-center rounded-lg border border-sky-400/25 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100"
          >
            {label}
          </span>
        ))}
      </div>
    );
  }
  if (block.type === "card") {
    return (
      <div className="grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:grid-cols-2">
        {block.rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ad-muted)]">
              {row.label}
            </p>
            <p className="mt-0.5 truncate font-mono text-[12px] text-[var(--ad-text)]">{row.value}</p>
          </div>
        ))}
      </div>
    );
  }
  return <p className="whitespace-pre-wrap break-words text-[var(--ad-text)]">{inlineFormat(block.text)}</p>;
}

function inlineFormat(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // split by code, bold, mentions
  const re = /(`[^`]+`|\*\*[^*]+\*\*|<@[!&]?\d+>|<#[\d]+>)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-black/40 px-1 py-0.5 font-mono text-[12px] text-sky-100"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("<@")) {
      const id = token.replace(/[<@!&>]/g, "");
      nodes.push(
        <span
          key={key++}
          className="inline-flex rounded bg-[#5865f2]/25 px-1.5 py-0.5 text-[12px] font-medium text-[#c9cdfb]"
        >
          @{id.slice(-4)}
        </span>,
      );
    } else if (token.startsWith("<#")) {
      nodes.push(
        <span
          key={key++}
          className="inline-flex rounded bg-sky-400/15 px-1.5 py-0.5 text-[12px] font-medium text-sky-200"
        >
          #채널
        </span>,
      );
    } else {
      nodes.push(token);
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function cleanTicketLabel(raw: string) {
  return raw
    .replace(/^[『」\[\(]*\s*[🔒🔐]*\s*[』」\]\)]*\s*[|｜·•\-–—]*\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ticketListLabels(openerName: string, topicName: string) {
  const opener = cleanTicketLabel(openerName) || openerName;
  const topic = cleanTicketLabel(topicName) || topicName || "문의";
  const openerLooksLikeChannel =
    /[『』｜|]/.test(openerName) ||
    openerName === topicName ||
    (openerName.length > 16 && !/\s/.test(openerName) && /로그|공지|관리/.test(openerName));

  if (openerLooksLikeChannel) {
    return {
      title: topic,
      meta: opener !== topic ? opener : "채널에서 복구됨",
    };
  }
  return { title: opener, meta: topic };
}
