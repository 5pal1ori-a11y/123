// DOES 랭킹 이미지 — satori 레이아웃(모든 div 는 flex). kind: "purchase" | "invite"
const h = (type, style, ...children) => ({ type, props: { style, children: children.flat().filter((c) => c !== null && c !== false && c !== undefined) } });
const img = (src, style) => ({ type: "img", props: { src, style } });

const num = (n) => Math.round(n).toLocaleString("en-US");
const THEME = {
  purchase: { accent: "#818cf8", accent2: "#22d3ee", bg1: "#1e1b4b", eyebrow: "PURCHASE RANKING", value: (r) => `₩${num(r.amount)}`, sub: (r) => `${r.count}건 · ${(r.share * 100).toFixed(1)}%` },
  invite: { accent: "#fbbf24", accent2: "#f472b6", bg1: "#3b1d0a", eyebrow: "INVITE RANKING", value: (r) => `${num(r.amount)}명`, sub: (r) => `누적 ${num(r.count)}명 초대` },
};
const MEDAL = [
  { ring: "#fcd34d", glow: "rgba(252,211,77,0.30)", grad: "linear-gradient(135deg,#fef3c7 0%,#fbbf24 45%,#b45309 100%)", text: "#3b2300" },
  { ring: "#e2e8f0", glow: "rgba(226,232,240,0.22)", grad: "linear-gradient(135deg,#ffffff 0%,#cbd5e1 50%,#64748b 100%)", text: "#1e293b" },
  { ring: "#fdba74", glow: "rgba(253,186,116,0.24)", grad: "linear-gradient(135deg,#ffedd5 0%,#fb923c 50%,#9a3412 100%)", text: "#3b1306" },
];

function avatar(src, size, ring, glow) {
  return h(
    "div",
    { display: "flex", width: size, height: size, borderRadius: size, padding: 4, background: ring, boxShadow: glow ? `0 0 34px ${glow}` : "none" },
    src
      ? img(src, { width: size - 8, height: size - 8, borderRadius: size, objectFit: "cover" })
      : h("div", { display: "flex", width: size - 8, height: size - 8, borderRadius: size, background: "#1f2937" }),
  );
}

function crown(color) {
  // 1위 왕관 (SVG)
  return img(
    `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40"><path d="M4 12l14 12L32 2l14 22 14-12-6 26H10z" fill="${color}" stroke="#7c4a03" stroke-width="2.5" stroke-linejoin="round"/><circle cx="32" cy="27" r="4" fill="#fff7"/></svg>`)}`,
    { width: 64, height: 40, marginBottom: -6 },
  );
}

function column(row, i, t) {
  const m = MEDAL[i];
  const first = i === 0;
  const size = first ? 150 : 120;
  const ped = [190, 140, 105][i];
  return h(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "center", width: 310 },
    first ? crown(m.ring) : null,
    avatar(row?.avatar, size, m.grad, m.glow),
    h("div", { display: "flex", marginTop: 16, fontSize: first ? 30 : 25, fontWeight: 700, color: "#fff", maxWidth: 290, overflow: "hidden", whiteSpace: "nowrap" }, row ? row.name : "—"),
    h("div", { display: "flex", marginTop: 2, fontSize: first ? 40 : 31, fontWeight: 900, color: m.ring, letterSpacing: -1 }, row ? t.value(row) : ""),
    h("div", { display: "flex", marginTop: 2, marginBottom: 18, fontSize: 16, fontWeight: 500, color: "#94a3b8" }, row ? t.sub(row) : ""),
    // 단상 (윗면 + 앞면)
    h("div", { display: "flex", flexDirection: "column", width: 300 },
      h("div", { display: "flex", height: 16, borderRadius: "14px 14px 0 0", background: m.grad, opacity: 0.95 }),
      h(
        "div",
        { display: "flex", height: ped, alignItems: "flex-start", justifyContent: "center", paddingTop: 10, background: `linear-gradient(180deg, ${m.glow.replace(/0\.\d+\)/, "0.55)")} 0%, rgba(255,255,255,0.02) 100%)` },
        h("div", { display: "flex", fontSize: first ? 96 : 76, fontWeight: 900, color: "rgba(255,255,255,0.16)", letterSpacing: -4 }, String(i + 1)),
      ),
    ),
  );
}

function line(row, t, last) {
  return h(
    "div",
    { display: "flex", alignItems: "center", width: "100%", padding: "16px 8px", borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.07)" },
    h("div", { display: "flex", width: 64, fontSize: 26, fontWeight: 900, color: "#475569" }, String(row.rank).padStart(2, "0")),
    avatar(row.avatar, 54, "rgba(255,255,255,0.14)"),
    h("div", { display: "flex", flexDirection: "column", marginLeft: 18, flexGrow: 1 },
      h("div", { display: "flex", fontSize: 24, fontWeight: 700, color: "#f1f5f9", maxWidth: 460, overflow: "hidden", whiteSpace: "nowrap" }, row.name),
      h("div", { display: "flex", marginTop: 11 }, premiumBar(460, row.barShare, [t.accent, t.accent === "#fbbf24" ? "#fb923c" : "#a78bfa", t.accent2], 10)),
    ),
    h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" },
      h("div", { display: "flex", fontSize: 27, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }, t.value(row)),
      h("div", { display: "flex", marginTop: 2, fontSize: 15, fontWeight: 500, color: "#64748b" }, t.sub(row)),
    ),
  );
}

export function rankTree(d) {
  const t = THEME[d.kind] ?? THEME.purchase;
  const rows = d.rows ?? [];
  const max = rows[0]?.amount || 1;
  const rest = rows.slice(3).map((r) => ({ ...r, barShare: r.amount / max }));
  const top = [rows[1], rows[0], rows[2]];
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "48px 60px 36px",
      background: `radial-gradient(ellipse 60% 45% at 50% 30%, ${t.bg1} 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)`,
      fontFamily: "Pretendard",
      color: "#fff",
    },
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 76, height: 76, marginRight: 18 }) : null,
        h("div", { display: "flex", flexDirection: "column" },
          h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: t.accent, letterSpacing: 5 }, t.eyebrow),
          h("div", { display: "flex", fontSize: 48, fontWeight: 900, marginTop: 2, letterSpacing: -1.5 }, d.title ?? "랭킹"),
        ),
      ),
      h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" },
        h("div", { display: "flex", fontSize: 17, fontWeight: 500, color: "#94a3b8" }, d.statLabel ?? ""),
        h("div", { display: "flex", fontSize: 32, fontWeight: 900, marginTop: 2, letterSpacing: -0.5 }, d.statValue ?? ""),
      ),
    ),
    h("div", { display: "flex", justifyContent: "center", alignItems: "flex-end", marginTop: 36 }, ...top.map((r, k) => column(r, [1, 0, 2][k], t))),
    // 단상 아래 바닥선
    h("div", { display: "flex", height: 2, background: `linear-gradient(90deg, rgba(255,255,255,0), ${t.accent}88, rgba(255,255,255,0))` }),
    h("div", { display: "flex", flexDirection: "column", marginTop: 14 }, ...rest.map((r, k) => line(r, t, k === rest.length - 1))),
    h("div", { display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 20, fontSize: 15, fontWeight: 500, color: "#475569" },
      h("div", { display: "flex" }, d.note ?? ""),
      h("div", { display: "flex" }, d.updated ?? ""),
    ),
  );
}

export function rankHeight(d) {
  const n = Math.max(0, (d.rows?.length ?? 0) - 3);
  return 130 + 36 + 570 + 16 + n * 87 + 60;
}

/* ───────── 문의 대기 현황 ───────── */
const ADMIN = {
  online: { color: "#22c55e", label: "관리자 온라인", sub: "지금 바로 답변받을 수 있어요" },
  idle: { color: "#f59e0b", label: "관리자 자리 비움", sub: "곧 돌아와 답변드려요" },
  dnd: { color: "#f59e0b", label: "관리자 다른 용무 중", sub: "조금 늦을 수 있어요" },
  offline: { color: "#ef4444", label: "관리자 오프라인", sub: "답변이 늦을 수 있어요" },
};

function stat(label, value, color) {
  return h(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "center", flexGrow: 1 },
    h("div", { display: "flex", fontSize: 18, fontWeight: 500, color: "#94a3b8" }, label),
    h("div", { display: "flex", fontSize: 44, fontWeight: 900, color: color ?? "#fff", marginTop: 4, letterSpacing: -1 }, value),
  );
}

export function queueTree(d) {
  const a = ADMIN[d.admin] ?? ADMIN.offline;
  const q = (d.queue ?? []).slice(0, 8);
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "46px 60px 34px",
      background: `radial-gradient(ellipse 55% 50% at 50% 36%, ${a.color}33 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)`,
      fontFamily: "Pretendard",
      color: "#fff",
    },
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 70, height: 70, marginRight: 18 }) : null,
        h("div", { display: "flex", flexDirection: "column" },
          h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: "#38bdf8", letterSpacing: 5 }, "SUPPORT QUEUE"),
          h("div", { display: "flex", fontSize: 44, fontWeight: 900, marginTop: 2, letterSpacing: -1.5 }, d.title ?? "문의 대기 현황"),
        ),
      ),
      h("div", { display: "flex", alignItems: "center", padding: "10px 18px", borderRadius: 40, background: `${a.color}1f`, border: `1.5px solid ${a.color}88` },
        h("div", { display: "flex", width: 14, height: 14, borderRadius: 14, background: a.color, boxShadow: `0 0 14px ${a.color}`, marginRight: 10 }),
        h("div", { display: "flex", flexDirection: "column" },
          h("div", { display: "flex", fontSize: 20, fontWeight: 700, color: "#fff" }, a.label),
          h("div", { display: "flex", fontSize: 14, fontWeight: 500, color: "#cbd5e1" }, a.sub),
        ),
      ),
    ),
    // 큰 숫자: 예상 대기시간
    h("div", { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 34 },
      h("div", { display: "flex", fontSize: 22, fontWeight: 500, color: "#94a3b8" }, "지금 문의하면 예상 대기시간"),
      h("div", { display: "flex", fontSize: 96, fontWeight: 900, letterSpacing: -4, marginTop: 2, color: "#fff" }, d.wait ?? "-"),
    ),
    h("div", { display: "flex", height: 2, marginTop: 24, background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(56,189,248,0.6), rgba(255,255,255,0))" }),
    h("div", { display: "flex", marginTop: 22 },
      stat("처리 중인 문의", `${d.open ?? 0}건`, "#38bdf8"),
      h("div", { display: "flex", width: 1, background: "rgba(255,255,255,0.1)" }),
      stat("오늘 완료", `${d.closed ?? 0}건`, "#22c55e"),
      h("div", { display: "flex", width: 1, background: "rgba(255,255,255,0.1)" }),
      stat("한 건 평균", `${d.perTicket ?? 10}분`, "#e2e8f0"),
    ),
    // 대기 줄
    h("div", { display: "flex", flexDirection: "column", marginTop: 30 },
      h("div", { display: "flex", fontSize: 18, fontWeight: 700, color: "#94a3b8" }, q.length ? "대기 순서" : "대기 중인 문의가 없어요 · 지금 바로 문의해 보세요"),
      q.length
        ? h("div", { display: "flex", marginTop: 14, gap: 14 },
            ...q.map((x, i) =>
              h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: 108 },
                h("div", { display: "flex", position: "relative" },
                  avatar(x.avatar, 76, i === 0 ? "linear-gradient(135deg,#7dd3fc,#2563eb)" : "rgba(255,255,255,0.16)", i === 0 ? "rgba(56,189,248,0.35)" : null),
                  h("div", { display: "flex", position: "absolute", top: -6, left: -6, width: 30, height: 30, borderRadius: 30, background: i === 0 ? "#38bdf8" : "#334155", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: i === 0 ? "#04263b" : "#e2e8f0", border: "3px solid #0b0f1a" }, String(i + 1)),
                ),
                h("div", { display: "flex", marginTop: 8, fontSize: 15, fontWeight: 700, color: "#e2e8f0", maxWidth: 104, overflow: "hidden", whiteSpace: "nowrap" }, x.name),
                h("div", { display: "flex", fontSize: 13, fontWeight: 500, color: "#64748b" }, x.waited),
              ),
            ),
            (d.queue?.length ?? 0) > 8 ? h("div", { display: "flex", alignItems: "center", fontSize: 22, fontWeight: 900, color: "#64748b" }, `+${d.queue.length - 8}`) : null,
          )
        : null,
    ),
    h("div", { display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 16, fontSize: 15, fontWeight: 500, color: "#475569" },
      h("div", { display: "flex" }, "예상 시간은 한 건에 약 10분으로 계산해요"),
      h("div", { display: "flex" }, d.updated ?? ""),
    ),
  );
}

/* ───────── 재고현황 ───────── */
const STOCK_COL = 476;

function stockThumb(it) {
  const box = { display: "flex", width: 56, height: 56, borderRadius: 14, background: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 };
  if (it.img && it.imgKind === "cape") {
    // 망토 텍스처(가로:세로 2:1)에서 앞면(10×16칸)만 보이게 잘라 낸다
    return h("div", box,
      h("div", { display: "flex", width: 30, height: 48, overflow: "hidden", borderRadius: 3 },
        img(it.img, { width: 192, height: 96, marginLeft: -3, marginTop: -3 }),
      ),
    );
  }
  if (it.img && it.imgKind === "skin") return h("div", { ...box, alignItems: "flex-end" }, img(it.img, { width: 56, height: 56, objectFit: "contain", objectPosition: "top" }));
  if (it.img) return h("div", box, img(it.img, { width: 56, height: 56, objectFit: "cover" }));
  return h("div", box, h("div", { display: "flex", width: 22, height: 22, borderRadius: 6, background: "rgba(255,255,255,0.15)" }));
}

function stockItem(it) {
  return h(
    "div",
    { display: "flex", alignItems: "center", width: STOCK_COL, padding: "10px 4px", borderBottom: "1px solid rgba(255,255,255,0.06)", opacity: it.sold ? 0.42 : 1 },
    stockThumb(it),
    h("div", { display: "flex", flexDirection: "column", marginLeft: 14, flexGrow: 1, minWidth: 0 },
      h("div", { display: "flex", fontSize: 19, fontWeight: 700, color: "#f1f5f9", maxWidth: 250, overflow: "hidden", whiteSpace: "nowrap" }, it.name),
      h("div", { display: "flex", marginTop: 4, fontSize: 19, fontWeight: 900, color: "#fff", letterSpacing: -0.3 }, `₩${num(it.price)}`),
    ),
    it.sold
      ? h("div", { display: "flex", padding: "6px 12px", borderRadius: 30, fontSize: 15, fontWeight: 700, background: "rgba(148,163,184,0.12)", color: "#cbd5e1", border: "1px solid rgba(148,163,184,0.35)" }, "품절")
      : h("div", { display: "flex", padding: "6px 12px", borderRadius: 30, fontSize: 15, fontWeight: 700, background: it.low ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.14)", color: it.low ? "#fbbf24" : "#4ade80", border: `1px solid ${it.low ? "rgba(245,158,11,0.4)" : "rgba(34,197,94,0.35)"}` }, it.stock),
  );
}

export function stockTree(d) {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "46px 56px 32px",
      background: "radial-gradient(ellipse 60% 30% at 50% 0%, #0f3b2e 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)",
      fontFamily: "Pretendard",
      color: "#fff",
    },
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 70, height: 70, marginRight: 18 }) : null,
        h("div", { display: "flex", flexDirection: "column" },
          h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: "#34d399", letterSpacing: 5 }, "LIVE STOCK"),
          h("div", { display: "flex", fontSize: 44, fontWeight: 900, marginTop: 2, letterSpacing: -1.5 }, d.title ?? "재고현황"),
        ),
      ),
      h("div", { display: "flex", alignItems: "flex-end", gap: 26 },
        h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" },
          h("div", { display: "flex", fontSize: 16, fontWeight: 500, color: "#94a3b8" }, "구매 가능"),
          h("div", { display: "flex", fontSize: 34, fontWeight: 900, color: "#4ade80" }, `${d.inStock ?? 0}종`),
        ),
        h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" },
          h("div", { display: "flex", fontSize: 16, fontWeight: 500, color: "#94a3b8" }, "품절"),
          h("div", { display: "flex", fontSize: 34, fontWeight: 900, color: "#64748b" }, `${d.soldOut ?? 0}종`),
        ),
      ),
    ),
    ...(d.groups ?? []).map((g) =>
      h("div", { display: "flex", flexDirection: "column", marginTop: 30 },
        h("div", { display: "flex", alignItems: "center" },
          h("div", { display: "flex", fontSize: 24, fontWeight: 900, letterSpacing: -0.5 }, g.name),
          h("div", { display: "flex", marginLeft: 12, fontSize: 16, fontWeight: 700, color: "#4ade80" }, `${g.items.filter((x) => !x.sold).length}종 판매중`),
          g.soldCount ? h("div", { display: "flex", marginLeft: 10, fontSize: 16, fontWeight: 500, color: "#64748b" }, `· 품절 ${g.soldCount}`) : null,
          h("div", { display: "flex", flexGrow: 1, height: 1, marginLeft: 16, background: "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0))" }),
        ),
        g.items.length
          ? h("div", { display: "flex", flexWrap: "wrap", justifyContent: "space-between", marginTop: 6 }, ...g.items.map(stockItem))
          : h("div", { display: "flex", marginTop: 10, fontSize: 16, fontWeight: 500, color: "#64748b" }, "지금은 모두 품절이에요"),
        g.more ? h("div", { display: "flex", marginTop: 8, fontSize: 15, fontWeight: 500, color: "#64748b" }, `외 ${g.more}개 더 · 사이트에서 전체 보기`) : null,
      ),
    ),
    h("div", { display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 22, fontSize: 15, fontWeight: 500, color: "#475569" },
      h("div", { display: "flex" }, "doesmc.xyz 에서 바로 구매할 수 있어요"),
      h("div", { display: "flex" }, d.updated ?? ""),
    ),
  );
}

export function stockHeight(d) {
  let hgt = 130 + 70;
  for (const g of d.groups ?? []) hgt += 30 + 36 + (g.items.length ? Math.ceil(g.items.length / 2) * 77 + 6 : 34) + (g.more ? 28 : 0);
  return hgt;
}

/* ───────── 관리자 상황 ───────── */
export function statusTree(d) {
  const a = ADMIN[d.status] ?? ADMIN.offline;
  const online = d.status !== "offline";
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "44px 60px 34px",
      background: `radial-gradient(ellipse 50% 60% at 50% 55%, ${a.color}40 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)`,
      fontFamily: "Pretendard",
      color: "#fff",
    },
    h("div", { display: "flex", alignItems: "center" },
      d.logo ? img(d.logo, { width: 62, height: 62, marginRight: 16 }) : null,
      h("div", { display: "flex", flexDirection: "column" },
        h("div", { display: "flex", fontSize: 15, fontWeight: 700, color: a.color, letterSpacing: 5 }, "ADMIN STATUS"),
        h("div", { display: "flex", fontSize: 38, fontWeight: 900, marginTop: 2, letterSpacing: -1.2 }, d.title ?? "관리자 상황"),
      ),
    ),
    h("div", { display: "flex", alignItems: "center", justifyContent: "center", marginTop: 26 },
      h("div", { display: "flex", position: "relative" },
        h("div", { display: "flex", width: 196, height: 196, borderRadius: 196, padding: 6, background: `linear-gradient(135deg, ${a.color}, ${a.color}55)`, boxShadow: `0 0 60px ${a.color}88` },
          d.avatar
            ? img(d.avatar, { width: 184, height: 184, borderRadius: 184, objectFit: "cover", filter: online ? "none" : "grayscale(0.85) brightness(0.7)" })
            : h("div", { display: "flex", width: 184, height: 184, borderRadius: 184, background: "#1f2937" }),
        ),
        h("div", { display: "flex", position: "absolute", right: 6, bottom: 6, width: 46, height: 46, borderRadius: 46, background: a.color, border: "7px solid #0b0f1a" }),
      ),
      h("div", { display: "flex", flexDirection: "column", marginLeft: 44 },
        h("div", { display: "flex", fontSize: 26, fontWeight: 700, color: "#cbd5e1" }, d.name ?? "관리자"),
        h("div", { display: "flex", fontSize: 64, fontWeight: 900, letterSpacing: -2.5, marginTop: 2, color: "#fff" }, a.label.replace("관리자 ", "")),
        h("div", { display: "flex", alignItems: "center", marginTop: 10, padding: "8px 16px", borderRadius: 30, background: `${a.color}22`, border: `1.5px solid ${a.color}77`, fontSize: 19, fontWeight: 700, color: "#fff" }, a.sub),
        d.since ? h("div", { display: "flex", marginTop: 12, fontSize: 18, fontWeight: 500, color: "#94a3b8" }, d.since) : null,
      ),
    ),
    (d.services && d.services.length)
      ? h("div", { display: "flex", justifyContent: "center", gap: 12, marginTop: 30, flexWrap: "wrap" },
          ...d.services.map((sv) =>
            h("div", { display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: 16, background: "rgba(255,255,255,0.045)", border: `1px solid ${sv.ok ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}` },
              h("div", { display: "flex", width: 12, height: 12, borderRadius: 12, background: sv.ok ? "#22c55e" : "#ef4444", boxShadow: `0 0 12px ${sv.ok ? "#22c55e" : "#ef4444"}` }),
              h("div", { display: "flex", flexDirection: "column" },
                h("div", { display: "flex", fontSize: 18, fontWeight: 700, color: "#e2e8f0" }, sv.label),
                h("div", { display: "flex", fontSize: 14, fontWeight: 500, color: sv.ok ? "#4ade80" : "#f87171" }, sv.ok ? "정상 작동" : "점검 중"),
              ),
            ),
          ),
        )
      : null,
    h("div", { display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 18, fontSize: 15, fontWeight: 500, color: "#475569" },
      h("div", { display: "flex" }, "문의는 티켓으로 남겨 주세요 · 돌아오면 순서대로 답변해요"),
      h("div", { display: "flex" }, d.updated ?? ""),
    ),
  );
}

/* ───────── 구매 로그 ───────── */
export function purchaseTree(d) {
  const art = (() => {
    if (d.img && d.imgKind === "cape")
      return h("div", { display: "flex", width: 150, height: 240, overflow: "hidden", borderRadius: 8, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" },
        img(d.img, { width: 960, height: 480, marginLeft: -15, marginTop: -15 }));
    if (d.img && d.imgKind === "skin") return img(d.img, { width: 250, height: 290, objectFit: "contain" });
    if (d.img) return img(d.img, { width: 230, height: 230, borderRadius: 36, objectFit: "cover", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" });
    return h("div", { display: "flex", width: 200, height: 200, borderRadius: 40, background: "rgba(255,255,255,0.08)" });
  })();
  const dots = [[70, 40, "#f472b6"], [330, 70, "#facc15"], [40, 300, "#22d3ee"], [360, 330, "#a78bfa"], [120, 360, "#4ade80"], [300, 20, "#fb923c"]];
  return h(
    "div",
    {
      display: "flex",
      width: "100%",
      height: "100%",
      background: "radial-gradient(ellipse 40% 70% at 20% 50%, rgba(99,102,241,0.38) 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)",
      fontFamily: "Pretendard",
      color: "#fff",
    },
    // 왼쪽: 상품 그림
    h("div", { display: "flex", position: "relative", width: 420, alignItems: "center", justifyContent: "center" },
      ...dots.map(([x, y, c]) => h("div", { display: "flex", position: "absolute", left: x, top: y, width: 12, height: 12, borderRadius: 3, background: c, transform: "rotate(30deg)", opacity: 0.8 })),
      art,
    ),
    // 오른쪽: 내용
    h("div", { display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, padding: "40px 56px 40px 10px" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 40, height: 40, marginRight: 12 }) : null,
        h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: "#a5b4fc", letterSpacing: 5 }, "NEW PURCHASE"),
      ),
      h("div", { display: "flex", fontSize: 46, fontWeight: 900, marginTop: 10, letterSpacing: -1.5 }, "구매 감사합니다!"),
      h("div", { display: "flex", alignItems: "center", marginTop: 18 },
        avatar(d.avatar, 52, "linear-gradient(135deg,#a5b4fc,#6366f1)"),
        h("div", { display: "flex", marginLeft: 14, fontSize: 24, fontWeight: 700, color: "#e2e8f0", maxWidth: 420, overflow: "hidden", whiteSpace: "nowrap" }, d.buyer ?? "회원"),
        h("div", { display: "flex", marginLeft: 8, fontSize: 20, fontWeight: 500, color: "#94a3b8" }, "님"),
      ),
      h("div", { display: "flex", height: 1, marginTop: 22, background: "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0))" }),
      h("div", { display: "flex", marginTop: 20, fontSize: 30, fontWeight: 900, letterSpacing: -0.8, maxWidth: 600, overflow: "hidden", whiteSpace: "nowrap" }, d.product ?? ""),
      h("div", { display: "flex", alignItems: "baseline", marginTop: 8 },
        h("div", { display: "flex", fontSize: 22, fontWeight: 700, color: "#cbd5e1" }, `${d.quantity ?? 1}개`),
        d.amount ? h("div", { display: "flex", marginLeft: 14, fontSize: 30, fontWeight: 900, color: "#facc15" }, `₩${num(d.amount)}`) : null,
      ),
      h("div", { display: "flex", alignItems: "center", marginTop: 20 },
        h("div", { display: "flex", padding: "7px 14px", borderRadius: 30, background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.35)", fontSize: 16, fontWeight: 700, color: "#4ade80" }, `누적 판매 ${num(d.totalSold ?? 0)}개`),
        h("div", { display: "flex", marginLeft: 14, fontSize: 16, fontWeight: 500, color: "#64748b" }, d.time ?? ""),
      ),
    ),
  );
}

/* ───────── 충전 완료 로그 ───────── */
const COIN_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#facc15"/><stop offset="1" stop-color="#b45309"/></linearGradient>
<linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d97706"/><stop offset="1" stop-color="#78350f"/></linearGradient></defs>
<ellipse cx="120" cy="196" rx="86" ry="22" fill="url(#e)"/><rect x="34" y="176" width="172" height="20" fill="url(#e)"/><ellipse cx="120" cy="176" rx="86" ry="22" fill="url(#g)"/>
<ellipse cx="120" cy="160" rx="86" ry="22" fill="url(#e)"/><rect x="34" y="140" width="172" height="20" fill="url(#e)"/><ellipse cx="120" cy="140" rx="86" ry="22" fill="url(#g)"/>
<circle cx="120" cy="86" r="70" fill="url(#e)"/><circle cx="120" cy="80" r="70" fill="url(#g)"/><circle cx="120" cy="80" r="54" fill="none" stroke="#b45309" stroke-width="5" opacity=".6"/>

<path d="M88 52h64" stroke="#92400e" stroke-width="0"/><ellipse cx="96" cy="44" rx="20" ry="9" fill="#fff" opacity=".55" transform="rotate(-25 96 44)"/></svg>`)}`;

export function chargeTree(d) {
  const dots = [[60, 50, "#4ade80"], [340, 70, "#facc15"], [50, 310, "#22d3ee"], [350, 320, "#a3e635"], [130, 360, "#fbbf24"], [290, 30, "#34d399"]];
  return h(
    "div",
    {
      display: "flex",
      width: "100%",
      height: "100%",
      background: "radial-gradient(ellipse 40% 70% at 20% 50%, rgba(34,197,94,0.32) 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)",
      fontFamily: "Pretendard",
      color: "#fff",
    },
    h("div", { display: "flex", position: "relative", width: 420, alignItems: "center", justifyContent: "center" },
      ...dots.map(([x, y, c]) => h("div", { display: "flex", position: "absolute", left: x, top: y, width: 12, height: 12, borderRadius: 12, background: c, opacity: 0.75 })),
      img(COIN_SVG, { width: 250, height: 250 }),
    ),
    h("div", { display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, padding: "40px 56px 40px 10px" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 40, height: 40, marginRight: 12 }) : null,
        h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: "#4ade80", letterSpacing: 5 }, "CHARGE COMPLETE"),
      ),
      h("div", { display: "flex", fontSize: 46, fontWeight: 900, marginTop: 10, letterSpacing: -1.5 }, "충전 완료!"),
      h("div", { display: "flex", alignItems: "center", marginTop: 18 },
        avatar(d.avatar, 52, "linear-gradient(135deg,#86efac,#16a34a)"),
        h("div", { display: "flex", marginLeft: 14, fontSize: 24, fontWeight: 700, color: "#e2e8f0", maxWidth: 420, overflow: "hidden", whiteSpace: "nowrap" }, d.user ?? "회원"),
        h("div", { display: "flex", marginLeft: 8, fontSize: 20, fontWeight: 500, color: "#94a3b8" }, "님"),
      ),
      h("div", { display: "flex", height: 1, marginTop: 22, background: "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0))" }),
      h("div", { display: "flex", alignItems: "baseline", marginTop: 16 },
        h("div", { display: "flex", fontSize: 58, fontWeight: 900, color: "#4ade80", letterSpacing: -2 }, `+₩${num(d.amount ?? 0)}`),
      ),
      h("div", { display: "flex", alignItems: "center", marginTop: 16, gap: 10 },
        d.method ? h("div", { display: "flex", padding: "7px 14px", borderRadius: 30, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", fontSize: 16, fontWeight: 700, color: "#e2e8f0" }, d.method) : null,
        d.depositor ? h("div", { display: "flex", padding: "7px 14px", borderRadius: 30, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", fontSize: 16, fontWeight: 700, color: "#e2e8f0" }, `입금자 ${d.depositor}`) : null,
        h("div", { display: "flex", padding: "7px 14px", borderRadius: 30, background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.35)", fontSize: 16, fontWeight: 700, color: "#facc15" }, `잔액 ₩${num(d.balance ?? 0)}`),
        h("div", { display: "flex", marginLeft: 4, fontSize: 16, fontWeight: 500, color: "#64748b" }, d.time ?? ""),
      ),
    ),
  );
}

/* ───────── 입장 환영 ───────── */
export function welcomeTree(d) {
  const dots = [[90, 60, "#f472b6"], [980, 80, "#facc15"], [60, 330, "#22d3ee"], [1020, 340, "#a78bfa"], [200, 380, "#4ade80"], [880, 30, "#fb923c"], [300, 40, "#38bdf8"], [760, 390, "#f472b6"]];
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      position: "relative",
      width: "100%",
      height: "100%",
      padding: "34px 60px 30px",
      background: "radial-gradient(ellipse 45% 60% at 50% 42%, rgba(52,211,153,0.30) 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)",
      fontFamily: "Pretendard",
      color: "#fff",
    },
    ...dots.map(([x, y, c]) => h("div", { display: "flex", position: "absolute", left: x, top: y, width: 12, height: 12, borderRadius: 3, background: c, transform: "rotate(25deg)", opacity: 0.75 })),
    h("div", { display: "flex", alignItems: "center" },
      d.logo ? img(d.logo, { width: 34, height: 34, marginRight: 10 }) : null,
      h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: "#6ee7b7", letterSpacing: 6 }, "WELCOME"),
    ),
    h("div", { display: "flex", marginTop: 18 },
      h("div", { display: "flex", width: 168, height: 168, borderRadius: 168, padding: 6, background: "linear-gradient(135deg,#6ee7b7,#10b981 50%,#3b82f6)", boxShadow: "0 0 60px rgba(52,211,153,0.5)" },
        d.avatar ? img(d.avatar, { width: 156, height: 156, borderRadius: 156, objectFit: "cover" }) : h("div", { display: "flex", width: 156, height: 156, borderRadius: 156, background: "#1f2937" }),
      ),
    ),
    h("div", { display: "flex", alignItems: "baseline", marginTop: 18 },
      h("div", { display: "flex", fontSize: 44, fontWeight: 900, letterSpacing: -1.5, maxWidth: 760, overflow: "hidden", whiteSpace: "nowrap" }, d.name ?? "새 멤버"),
      h("div", { display: "flex", marginLeft: 10, fontSize: 26, fontWeight: 700, color: "#94a3b8" }, "님"),
    ),
    h("div", { display: "flex", marginTop: 4, fontSize: 24, fontWeight: 700, color: "#e2e8f0" }, `${d.shop ?? "DOES"}에 오신 걸 환영해요!`),
    h("div", { display: "flex", marginTop: 18, gap: 10 },
      d.memberCount ? h("div", { display: "flex", padding: "8px 16px", borderRadius: 30, background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.4)", fontSize: 17, fontWeight: 700, color: "#6ee7b7" }, `${num(d.memberCount)}번째 멤버`) : null,
      d.created ? h("div", { display: "flex", padding: "8px 16px", borderRadius: 30, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", fontSize: 17, fontWeight: 700, color: "#cbd5e1" }, `디스코드 가입 ${d.created}`) : null,
    ),
  );
}

/* ───────── 후기 ───────── */
export function reviewTree(d) {
  const body = (d.body ?? "").slice(0, 260) + ((d.body ?? "").length > 260 ? "…" : "");
  const thumb = (() => {
    if (d.img && d.imgKind === "cape")
      return h("div", { display: "flex", width: 40, height: 64, overflow: "hidden", borderRadius: 4 }, img(d.img, { width: 256, height: 128, marginLeft: -4, marginTop: -4 }));
    if (d.img) return img(d.img, { width: 64, height: 64, objectFit: d.imgKind === "skin" ? "contain" : "cover", borderRadius: 12 });
    return h("div", { display: "flex", width: 64, height: 64, borderRadius: 12, background: "rgba(255,255,255,0.08)" });
  })();
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "40px 60px 34px",
      background: "radial-gradient(ellipse 50% 60% at 15% 20%, rgba(236,72,153,0.22) 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)",
      fontFamily: "Pretendard",
      color: "#fff",
    },
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 38, height: 38, marginRight: 12 }) : null,
        h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: "#f9a8d4", letterSpacing: 5 }, "NEW REVIEW"),
      ),
      d.rating ? h("div", { display: "flex", fontSize: 30, color: "#facc15", letterSpacing: 4 }, "★".repeat(Math.min(5, d.rating)) + "☆".repeat(Math.max(0, 5 - d.rating))) : null,
    ),
    h("div", { display: "flex", marginTop: 6 },
      h("div", { display: "flex", fontSize: 120, fontWeight: 900, color: "rgba(244,114,182,0.35)", lineHeight: 1, marginRight: 14, marginTop: -10 }, "“"),
      h("div", { display: "flex", flexGrow: 1, marginTop: 24, fontSize: 30, fontWeight: 700, lineHeight: 1.5, color: "#f8fafc", wordBreak: "keep-all" }, body || "-"),
    ),
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.08)" },
      h("div", { display: "flex", alignItems: "center" },
        avatar(d.avatar, 56, "linear-gradient(135deg,#f9a8d4,#db2777)"),
        h("div", { display: "flex", flexDirection: "column", marginLeft: 14 },
          h("div", { display: "flex", fontSize: 22, fontWeight: 700 }, d.author ?? "회원"),
          h("div", { display: "flex", fontSize: 15, fontWeight: 500, color: "#64748b", marginTop: 2 }, d.time ?? ""),
        ),
      ),
      !d.product || (d.product === "상품" && !d.img) ? null : h("div", { display: "flex", alignItems: "center", padding: "8px 16px 8px 8px", borderRadius: 18, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" },
        h("div", { display: "flex", width: 64, height: 64, alignItems: "center", justifyContent: "center" }, thumb),
        h("div", { display: "flex", flexDirection: "column", marginLeft: 12 },
          h("div", { display: "flex", fontSize: 14, fontWeight: 500, color: "#94a3b8" }, "구매한 상품"),
          h("div", { display: "flex", fontSize: 20, fontWeight: 900, maxWidth: 360, overflow: "hidden", whiteSpace: "nowrap" }, d.product ?? ""),
        ),
      ),
    ),
  );
}

export function reviewHeight(d) {
  const len = Math.min(261, (d.body ?? "").length);
  const lines = Math.max(1, Math.ceil(len / 32));
  return Math.max(400, 250 + lines * 45);
}

/* ───────── 공용: 상품 그림 ───────── */
function productArt(d, big) {
  const W = big ? 250 : 120;
  if (d.img && d.imgKind === "cape") {
    const k = big ? 15 : 7;
    return h("div", { display: "flex", width: k * 10, height: k * 16, overflow: "hidden", borderRadius: 6, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }, img(d.img, { width: k * 64, height: k * 32, marginLeft: -k, marginTop: -k }));
  }
  if (d.img && d.imgKind === "skin") return img(d.img, { width: W, height: Math.round(W * 1.16), objectFit: "contain" });
  if (d.img) return img(d.img, { width: W - 20, height: W - 20, borderRadius: big ? 36 : 20, objectFit: "cover", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" });
  return h("div", { display: "flex", width: W - 50, height: W - 50, borderRadius: 30, background: "rgba(255,255,255,0.08)" });
}
const chip = (text, color, bg, border) => h("div", { display: "flex", padding: "7px 14px", borderRadius: 30, background: bg, border: `1px solid ${border}`, fontSize: 16, fontWeight: 700, color }, text);

/* ───────── 재입고 알림 ───────── */
export function restockTree(d) {
  return h(
    "div",
    { display: "flex", width: "100%", height: "100%", background: "radial-gradient(ellipse 40% 70% at 20% 50%, rgba(56,189,248,0.32) 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)", fontFamily: "Pretendard", color: "#fff" },
    h("div", { display: "flex", width: 420, alignItems: "center", justifyContent: "center" }, productArt(d, true)),
    h("div", { display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, padding: "40px 56px 40px 10px" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 40, height: 40, marginRight: 12 }) : null,
        h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: "#7dd3fc", letterSpacing: 5 }, "RESTOCK"),
      ),
      h("div", { display: "flex", fontSize: 46, fontWeight: 900, marginTop: 10, letterSpacing: -1.5 }, "재입고됐어요!"),
      h("div", { display: "flex", marginTop: 16, fontSize: 32, fontWeight: 900, letterSpacing: -0.8, maxWidth: 600, overflow: "hidden", whiteSpace: "nowrap" }, d.product ?? ""),
      d.price ? h("div", { display: "flex", marginTop: 6, fontSize: 30, fontWeight: 900, color: "#facc15" }, `₩${num(d.price)}`) : null,
      h("div", { display: "flex", alignItems: "center", marginTop: 20, gap: 10 },
        chip(`+${num(d.added ?? 0)}개 입고`, "#7dd3fc", "rgba(56,189,248,0.14)", "rgba(56,189,248,0.4)"),
        chip(`현재 재고 ${num(d.total ?? 0)}개`, "#4ade80", "rgba(34,197,94,0.14)", "rgba(34,197,94,0.35)"),
        h("div", { display: "flex", marginLeft: 4, fontSize: 16, fontWeight: 500, color: "#64748b" }, d.time ?? ""),
      ),
    ),
  );
}

/* ───────── 구매 영수증 (DM) ───────── */
export function receiptTree(d) {
  const row = (k, v, strong) =>
    h("div", { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
      h("div", { display: "flex", fontSize: 18, fontWeight: 500, color: "#94a3b8" }, k),
      h("div", { display: "flex", fontSize: strong ? 26 : 19, fontWeight: strong ? 900 : 700, color: strong ? "#facc15" : "#f1f5f9", maxWidth: 420, overflow: "hidden", whiteSpace: "nowrap" }, v),
    );
  return h(
    "div",
    { display: "flex", width: "100%", height: "100%", background: "linear-gradient(180deg, #0d1120 0%, #070910 100%)", fontFamily: "Pretendard", color: "#fff", padding: 34 },
    h("div", { display: "flex", width: "100%", borderRadius: 28, background: "linear-gradient(135deg, rgba(99,102,241,0.16), rgba(255,255,255,0.03))", border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden" },
      h("div", { display: "flex", width: 330, alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.35), rgba(0,0,0,0) 70%)", borderRight: "2px dashed rgba(255,255,255,0.14)" }, productArt(d, true)),
      h("div", { display: "flex", flexDirection: "column", flexGrow: 1, padding: "30px 40px" },
        h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
          h("div", { display: "flex", alignItems: "center" },
            d.logo ? img(d.logo, { width: 36, height: 36, marginRight: 10 }) : null,
            h("div", { display: "flex", fontSize: 15, fontWeight: 700, color: "#a5b4fc", letterSpacing: 5 }, "RECEIPT"),
          ),
          chip("결제 완료", "#4ade80", "rgba(34,197,94,0.14)", "rgba(34,197,94,0.35)"),
        ),
        h("div", { display: "flex", marginTop: 12, fontSize: 32, fontWeight: 900, letterSpacing: -1, maxWidth: 560, overflow: "hidden", whiteSpace: "nowrap" }, d.product ?? ""),
        h("div", { display: "flex", height: 1, marginTop: 14, background: "rgba(255,255,255,0.1)" }),
        row("주문번호", d.order ?? ""),
        row("구매자", d.buyer ?? ""),
        row("수량", `${d.quantity ?? 1}개`),
        row("구매 시각", d.time ?? ""),
        h("div", { display: "flex", height: 1, marginTop: 14, background: "rgba(255,255,255,0.1)" }),
        row("결제 금액", `₩${num(d.amount ?? 0)}`, true),
        h("div", { display: "flex", marginTop: 14, fontSize: 15, fontWeight: 500, color: "#64748b" }, d.note ?? ""),
      ),
    ),
  );
}

/* ───────── 내 정보 카드 ───────── */
export function profileTree(d) {
  const PLAN = { plus: { label: "DOES PASS+", color: "#f0abfc", bg: "rgba(217,70,239,0.16)" }, basic: { label: "BASIC PASS", color: "#7dd3fc", bg: "rgba(56,189,248,0.14)" } };
  const plan = PLAN[d.plan] ?? null;
  const stat = (label, value, color) =>
    h("div", { display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, padding: "16px 20px", borderRadius: 20, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" },
      h("div", { display: "flex", fontSize: 16, fontWeight: 500, color: "#94a3b8" }, label),
      h("div", { display: "flex", marginTop: 4, fontSize: 30, fontWeight: 900, color: color ?? "#fff", letterSpacing: -0.8 }, value),
    );
  return h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "40px 52px 34px", background: "radial-gradient(ellipse 45% 70% at 12% 30%, rgba(99,102,241,0.32) 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)", fontFamily: "Pretendard", color: "#fff" },
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 34, height: 34, marginRight: 10 }) : null,
        h("div", { display: "flex", fontSize: 15, fontWeight: 700, color: "#a5b4fc", letterSpacing: 5 }, "MY PROFILE"),
      ),
      d.rank ? chip(`구매 랭킹 ${d.rank}위`, "#facc15", "rgba(250,204,21,0.12)", "rgba(250,204,21,0.35)") : null,
    ),
    h("div", { display: "flex", alignItems: "center", marginTop: 22 },
      avatar(d.avatar, 132, "linear-gradient(135deg,#a5b4fc,#6366f1 50%,#ec4899)", "rgba(99,102,241,0.45)"),
      h("div", { display: "flex", flexDirection: "column", marginLeft: 28 },
        h("div", { display: "flex", fontSize: 46, fontWeight: 900, letterSpacing: -1.5, maxWidth: 640, overflow: "hidden", whiteSpace: "nowrap" }, d.name ?? "회원"),
        h("div", { display: "flex", alignItems: "center", marginTop: 10, gap: 8 },
          plan ? chip(plan.label, plan.color, plan.bg, `${plan.color}66`) : chip("무료 회원", "#cbd5e1", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.14)"),
          d.tier ? chip(d.tier, "#fde68a", "rgba(250,204,21,0.1)", "rgba(250,204,21,0.3)") : null,
          d.joined ? h("div", { display: "flex", marginLeft: 6, fontSize: 16, fontWeight: 500, color: "#64748b" }, `가입 ${d.joined}`) : null,
        ),
      ),
    ),
    h("div", { display: "flex", marginTop: 30, gap: 14 },
      stat("누적 구매", `₩${num(d.spent ?? 0)}`, "#facc15"),
      stat("구매 횟수", `${num(d.orders ?? 0)}건`),
      stat("보유 포인트", `${num(d.points ?? 0)}P`, "#4ade80"),
      stat("작성한 후기", `${num(d.reviews ?? 0)}개`, "#f9a8d4"),
    ),
  );
}

/* ───────── 공용 발표 카드 ───────── */
const CARD_THEME = {
  party: { a: "#f472b6", glow: "rgba(236,72,153,0.30)", ring: "linear-gradient(135deg,#fde68a,#f472b6 50%,#8b5cf6)" },
  gold: { a: "#facc15", glow: "rgba(250,204,21,0.28)", ring: "linear-gradient(135deg,#fef3c7,#fbbf24 50%,#b45309)" },
  green: { a: "#4ade80", glow: "rgba(34,197,94,0.28)", ring: "linear-gradient(135deg,#bbf7d0,#22c55e 50%,#0e7490)" },
  blue: { a: "#7dd3fc", glow: "rgba(56,189,248,0.28)", ring: "linear-gradient(135deg,#e0f2fe,#38bdf8 50%,#6366f1)" },
  pink: { a: "#f9a8d4", glow: "rgba(236,72,153,0.26)", ring: "linear-gradient(135deg,#fce7f3,#ec4899 50%,#7c3aed)" },
  red: { a: "#f87171", glow: "rgba(239,68,68,0.28)", ring: "linear-gradient(135deg,#fecaca,#ef4444 50%,#7f1d1d)" },
};
export function cardTree(d) {
  const t = CARD_THEME[d.theme] ?? CARD_THEME.party;
  const people = (d.people ?? []).slice(0, 6);
  const big = people.length <= 1;
  const size = big ? 140 : people.length <= 3 ? 110 : 88;
  const dots = [[80, 60, "#f472b6"], [1000, 70, "#facc15"], [60, 360, "#22d3ee"], [1020, 380, "#a78bfa"], [200, 410, "#4ade80"], [900, 30, "#fb923c"], [320, 40, "#38bdf8"], [780, 420, "#f472b6"]];
  return h(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "center", position: "relative", width: "100%", height: "100%", padding: "34px 60px 30px", background: `radial-gradient(ellipse 45% 60% at 50% 45%, ${t.glow} 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)`, fontFamily: "Pretendard", color: "#fff" },
    ...(d.confetti === false ? [] : dots.map(([x, y, c]) => h("div", { display: "flex", position: "absolute", left: x, top: y, width: 12, height: 12, borderRadius: 3, background: c, transform: "rotate(25deg)", opacity: 0.75 }))),
    h("div", { display: "flex", alignItems: "center" },
      d.logo ? img(d.logo, { width: 32, height: 32, marginRight: 10 }) : null,
      h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: t.a, letterSpacing: 6 }, d.eyebrow ?? ""),
    ),
    h("div", { display: "flex", marginTop: 8, fontSize: 42, fontWeight: 900, letterSpacing: -1.5 }, d.title ?? ""),
    people.length
      ? h("div", { display: "flex", marginTop: 20, gap: 26, alignItems: "flex-start" },
          ...people.map((p, i) =>
            h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: size + 40 },
              h("div", { display: "flex", alignItems: "center" },
                avatar(p.avatar, size, t.ring, t.glow),
              ),
              h("div", { display: "flex", marginTop: 10, fontSize: big ? 26 : 19, fontWeight: 700, maxWidth: size + 40, overflow: "hidden", whiteSpace: "nowrap" }, p.name ?? "회원"),
              p.label ? h("div", { display: "flex", fontSize: 14, fontWeight: 500, color: "#94a3b8", marginTop: 2 }, p.label) : null,
            ),
          ),
        )
      : null,
    d.subtitle ? h("div", { display: "flex", marginTop: 16, fontSize: 30, fontWeight: 900, color: t.a, letterSpacing: -0.8, maxWidth: 960, overflow: "hidden", whiteSpace: "nowrap" }, d.subtitle) : null,
    (d.chips ?? []).length
      ? h("div", { display: "flex", marginTop: 14, gap: 10 }, ...(d.chips ?? []).slice(0, 4).map((c) => chip(c, "#e2e8f0", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.14)")))
      : null,
    d.note ? h("div", { display: "flex", marginTop: "auto", paddingTop: 12, fontSize: 15, fontWeight: 500, color: "#64748b" }, d.note) : null,
  );
}

/* ───────── 구매 랭킹과 같은 톤의 공용 조각 (상점 통계 · 프록시) ───────── */
const ACC = "#818cf8";
const ACC2 = "#22d3ee";
const fmtN = (n) => Number(n || 0).toLocaleString("ko-KR");

function brandHeader(d, eyebrow, title, statLabel, statValue, opts = {}) {
  return h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
    h("div", { display: "flex", alignItems: "center" },
      opts.avatar !== undefined
        ? h("div", { display: "flex", marginRight: 18 }, avatar(opts.avatar, 76, `linear-gradient(135deg, ${ACC}, ${ACC2})`, "rgba(129,140,248,0.30)"))
        : d.logo ? img(d.logo, { width: 72, height: 72, marginRight: 18 }) : null,
      h("div", { display: "flex", flexDirection: "column" },
        h("div", { display: "flex", fontSize: 16, fontWeight: 700, color: ACC, letterSpacing: 5 }, eyebrow),
        h("div", { display: "flex", fontSize: opts.titleSize ?? 44, fontWeight: 900, marginTop: 2, letterSpacing: -1.5, maxWidth: 640, overflow: "hidden", whiteSpace: "nowrap" }, title),
      ),
    ),
    h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" },
      h("div", { display: "flex", fontSize: 17, fontWeight: 500, color: "#94a3b8" }, statLabel),
      h("div", { display: "flex", fontSize: 32, fontWeight: 900, marginTop: 2, letterSpacing: -0.5 }, statValue),
    ),
  );
}

/**
 * 고급 진행 막대 — 안쪽 그림자가 있는 트랙 + 3단 그라데이션 채움 + 윗면 광택 + 빛나는 끝점
 * width: px 숫자, share: 0~1
 */
const BAR_DEFAULT = ["#6366f1", "#a78bfa", "#22d3ee"];
const BAR_SOLD = ["#10b981", "#4ade80", "#22d3ee"];
function premiumBar(width, share, colors = BAR_DEFAULT, height = 12) {
  const fill = Math.max(height + 4, Math.round(width * Math.min(1, Math.max(0, share ?? 0))));
  const [c1, c2, c3] = colors;
  return h("div", {
      display: "flex", position: "relative", width, height, borderRadius: height,
      background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(255,255,255,0.04) 100%)",
      border: "1px solid rgba(255,255,255,0.07)",
      boxShadow: "inset 0 1px 3px rgba(0,0,0,0.6)",
    },
    // 채움
    h("div", { display: "flex", position: "absolute", left: 0, top: -1, width: fill, height, borderRadius: height,
      background: `linear-gradient(90deg, ${c1} 0%, ${c2} 55%, ${c3} 100%)`,
      boxShadow: `0 0 14px ${c2}88, 0 0 4px ${c3}aa` }),
    // 윗면 광택
    h("div", { display: "flex", position: "absolute", left: 3, top: 1, width: Math.max(0, fill - 6), height: Math.max(2, Math.round(height * 0.32)), borderRadius: height,
      background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))" }),
    // 끝점
    h("div", { display: "flex", position: "absolute", left: fill - height - 2, top: -3, width: height + 4, height: height + 4, borderRadius: height + 4,
      background: "radial-gradient(circle at 40% 35%, #ffffff 0%, #e0e7ff 45%, " + c3 + " 100%)",
      boxShadow: `0 0 10px ${c3}, 0 0 22px ${c2}99` }),
  );
}

function glowLine() {
  return h("div", { display: "flex", height: 2, background: `linear-gradient(90deg, rgba(255,255,255,0), ${ACC}88, rgba(255,255,255,0))` });
}

/** 큰 숫자 칸 (구분선으로만 나눈다) — share 가 있으면 랭킹처럼 진행 막대 */
function bigStat(label, value, unit, color, share, last) {
  return h("div", { display: "flex", flexDirection: "column", flex: 1, padding: "0 28px", borderRight: last ? "none" : "1px solid rgba(255,255,255,0.08)" },
    h("div", { display: "flex", fontSize: 18, fontWeight: 700, color: "#94a3b8" }, label),
    h("div", { display: "flex", alignItems: "flex-end", marginTop: 8 },
      h("div", { display: "flex", fontSize: String(value).length > 9 ? 40 : 54, fontWeight: 900, color, letterSpacing: -1.5, lineHeight: 1 }, value),
      unit ? h("div", { display: "flex", fontSize: 22, fontWeight: 700, color: "#cbd5e1", marginLeft: 6, marginBottom: 4 }, unit) : null,
    ),
    h("div", { display: "flex", marginTop: 18 }, premiumBar(270, share ?? 1, color === "#86efac" ? BAR_SOLD : BAR_DEFAULT)),
  );
}

function footer(left, right) {
  return h("div", { display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 18, fontSize: 15, fontWeight: 500, color: "#475569" },
    h("div", { display: "flex" }, left),
    h("div", { display: "flex" }, right),
  );
}

const PAGE = (bg) => ({
  display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "40px 56px 30px",
  background: `radial-gradient(ellipse 60% 55% at 50% 20%, ${bg} 0%, rgba(11,15,26,0) 100%), linear-gradient(180deg, #0d1120 0%, #070910 100%)`,
  fontFamily: "Pretendard", color: "#fff",
});

/**
 * 상점 통계 (디스코드 링크 미리보기 맨 아래) — d: { sold, buyers, reviews, avg, since? }
 */
export function shopStatsTree(d) {
  const top = Math.max(d.sold || 0, d.buyers || 0, d.reviews || 0, 1);
  return h("div", PAGE("#1e1b4b"),
    brandHeader(d, "DOES STORE", "실시간 판매 현황", "평균 평점", `★ ${Number(d.avg || 0).toFixed(1)}`),
    h("div", { display: "flex", marginTop: 34 },
      bigStat("판매된 계정", fmtN(d.sold), "개", "#c7d2fe", (d.sold || 0) / top),
      bigStat("구매자", fmtN(d.buyers), "명", "#67e8f9", (d.buyers || 0) / top),
      bigStat("후기", fmtN(d.reviews), "개", "#f9a8d4", (d.reviews || 0) / top, true),
    ),
    footer(d.since ? `${d.since} · 실제 주문·후기 기준` : "실제 주문·후기 기준", "doesmc.xyz"),
  );
}

/**
 * /프록시등록 패널 — d: { registrants, selling, sold, soldAmount, pending, time }
 */
export function proxyPanelTree(d) {
  const top = Math.max(d.registrants || 0, d.selling || 0, d.sold || 0, 1);
  return h("div", PAGE("#1e1b4b"),
    brandHeader(d, "PROXY RESALE", "DOES 프록시 대리판매", "누적 판매액", `₩${fmtN(d.soldAmount)}`),
    h("div", { display: "flex", marginTop: 34 },
      bigStat("프록시 등록자", fmtN(d.registrants), "명", "#c7d2fe", (d.registrants || 0) / top),
      bigStat("판매 중", fmtN(d.selling), "개", "#67e8f9", (d.selling || 0) / top),
      bigStat("판매 완료", fmtN(d.sold), "개", "#86efac", (d.sold || 0) / top, true),
    ),
    h("div", { display: "flex", marginTop: 26 }, glowLine()),
    footer(d.pending ? `지금 검토 중인 신청 ${fmtN(d.pending)}건 · 실제 등록·주문 기준` : "실제 등록·주문 기준", d.time ? `${d.time} 갱신` : "doesmc.xyz"),
  );
}

/**
 * 내 프록시 현황 — d: { name, avatar, rows: [{ ign, price, payout, status }], totals: { selling, sold, payoutDue } }
 */
const PROXY_STATUS = {
  pending: ["검토 중", "#fde68a", "rgba(250,204,21,0.14)"],
  selling: ["판매 중", "#67e8f9", "rgba(34,211,238,0.14)"],
  sold: ["판매 완료", "#86efac", "rgba(74,222,128,0.16)"],
  rejected: ["반려", "#fca5a5", "rgba(248,113,113,0.14)"],
  cancelled: ["취소", "#94a3b8", "rgba(148,163,184,0.14)"],
};
export function proxyStatusHeight(d) {
  return 40 + 82 + 30 + 2 + 14 + Math.max(1, (d.rows ?? []).length) * 87 + 70;
}
export function proxyStatusTree(d) {
  const rows = (d.rows ?? []).slice(0, 6);
  const t = d.totals ?? {};
  const max = Math.max(1, ...rows.map((r) => r.price || 0));
  return h("div", PAGE("#1e1b4b"),
    brandHeader(d, "MY PROXY", `${d.name ?? "회원"} 님의 프록시`, `판매 중 ${fmtN(t.selling)} · 판매 완료 ${fmtN(t.sold)}`, `정산 예정 ₩${fmtN(t.payoutDue)}`, { avatar: d.avatar ?? null, titleSize: 40 }),
    h("div", { display: "flex", marginTop: 30 }, glowLine()),
    h("div", { display: "flex", flexDirection: "column", marginTop: 14 },
      ...(rows.length
        ? rows.map((r, k) => {
            const [label, color, bg] = PROXY_STATUS[r.status] ?? PROXY_STATUS.pending;
            const share = (r.price || 0) / max;
            return h("div", { display: "flex", alignItems: "center", width: "100%", padding: "16px 8px", borderBottom: k === rows.length - 1 ? "none" : "1px solid rgba(255,255,255,0.07)" },
              h("div", { display: "flex", width: 64, fontSize: 26, fontWeight: 900, color: "#475569" }, String(k + 1).padStart(2, "0")),
              h("div", { display: "flex", flexDirection: "column", flexGrow: 1 },
                h("div", { display: "flex", alignItems: "center" },
                  h("div", { display: "flex", fontSize: 24, fontWeight: 700, color: "#f1f5f9", maxWidth: 360, overflow: "hidden", whiteSpace: "nowrap" }, String(r.ign ?? "")),
                  h("div", { display: "flex", marginLeft: 12, padding: "3px 12px", borderRadius: 999, background: bg, color, fontSize: 15, fontWeight: 700 }, label),
                ),
                h("div", { display: "flex", marginTop: 11 }, premiumBar(460, share, r.status === "sold" ? BAR_SOLD : BAR_DEFAULT, 10)),
              ),
              h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" },
                h("div", { display: "flex", fontSize: 27, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }, `₩${fmtN(r.price)}`),
                h("div", { display: "flex", marginTop: 2, fontSize: 15, fontWeight: 500, color: "#64748b" }, `정산 ₩${fmtN(r.payout)}`),
              ),
            );
          })
        : [h("div", { display: "flex", justifyContent: "center", padding: "26px 0", fontSize: 22, fontWeight: 700, color: "#64748b" }, "아직 등록한 프록시가 없어요")]),
    ),
    footer("판매되면 관리자가 확인 후 등록한 계좌로 정산해 드려요", "doesmc.xyz"),
  );
}

/* ───────── 다이아 캐기 (광석 · 곡괭이 · 서버 공동 목표) ───────── */
const ORE_STYLE = {
  stone: { name: "돌멩이", light: "#cbd5e1", dark: "#475569", rock: true },
  coal: { name: "석탄", light: "#64748b", dark: "#0f172a", rock: true },
  iron: { name: "철", light: "#fff7ed", dark: "#fb923c" },
  gold: { name: "금", light: "#fef9c3", dark: "#f59e0b" },
  diamond: { name: "다이아", light: "#ecfeff", dark: "#06b6d4" },
  emerald: { name: "에메랄드", light: "#d1fae5", dark: "#059669" },
  netherite: { name: "네더라이트", light: "#ede9fe", dark: "#6d28d9" },
};
const svgUri = (svg) => `data:image/svg+xml;base64,${btoa(svg)}`;

/** 직접 그린 광석 아이콘 — 돌·석탄은 바위, 나머지는 깎은 보석 */
function oreIcon(key, size) {
  const o = ORE_STYLE[key] ?? ORE_STYLE.stone;
  const svg = o.rock
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.light}"/><stop offset="1" stop-color="${o.dark}"/></linearGradient></defs><path d="M10 40 L16 18 L34 8 L52 16 L58 38 L46 56 L22 57 Z" fill="url(#g)" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/><path d="M16 18 L34 8 L30 30 Z" fill="#ffffff" fill-opacity="0.18"/><circle cx="26" cy="38" r="4" fill="#000" fill-opacity="0.25"/><circle cx="41" cy="30" r="3" fill="#000" fill-opacity="0.22"/><circle cx="38" cy="46" r="2.5" fill="#000" fill-opacity="0.2"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${o.light}"/><stop offset="1" stop-color="${o.dark}"/></linearGradient></defs><polygon points="32,4 58,24 46,58 18,58 6,24" fill="url(#g)" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2"/><polygon points="6,24 58,24 32,58" fill="#000" fill-opacity="0.12"/><polygon points="20,24 32,4 44,24 32,58" fill="#ffffff" fill-opacity="0.22"/><polygon points="20,24 32,4 26,24" fill="#ffffff" fill-opacity="0.45"/></svg>`;
  return img(svgUri(svg), { width: size, height: size });
}

/** 직접 그린 곡괭이 아이콘 */
function pickaxeIcon(color, size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="0.35" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.75"/></linearGradient></defs><rect x="29" y="18" width="7" height="42" rx="3" transform="rotate(38 32 39)" fill="#92400e"/><rect x="31" y="18" width="2.5" height="42" rx="1" transform="rotate(38 32 39)" fill="#fbbf24" fill-opacity="0.35"/><path d="M8 22 C20 6, 44 4, 58 14 L54 20 C42 13, 24 15, 14 28 Z" fill="url(#h)" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.5"/></svg>`;
  return img(svgUri(svg), { width: size, height: size });
}

const ORE_ORDER = ["stone", "coal", "iron", "gold", "diamond", "emerald", "netherite"];
const GOLD_BAR = ["#f59e0b", "#fbbf24", "#fde68a"];

/** 서버 공동 목표 막대 + 축제 표시 */
function goalBlock(d, width) {
  const share = (d.attempts || 0) / Math.max(1, d.target || 1);
  return h("div", { display: "flex", flexDirection: "column" },
    h("div", { display: "flex", alignItems: "flex-end", justifyContent: "space-between" },
      h("div", { display: "flex", flexDirection: "column" },
        h("div", { display: "flex", fontSize: 17, fontWeight: 700, color: "#94a3b8" }, "서버 공동 목표 · 이번 주 채굴"),
        h("div", { display: "flex", alignItems: "flex-end", marginTop: 4 },
          h("div", { display: "flex", fontSize: 46, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: d.festivalActive ? "#fde68a" : "#fff" }, fmtN(d.attempts)),
          h("div", { display: "flex", fontSize: 24, fontWeight: 700, color: "#64748b", marginLeft: 8, marginBottom: 3 }, `/ ${fmtN(d.target)}회`),
        ),
      ),
      d.festivalActive
        ? h("div", { display: "flex", padding: "8px 18px", borderRadius: 999, background: "linear-gradient(90deg, rgba(245,158,11,0.25), rgba(253,230,138,0.18))", border: "1.5px solid rgba(253,230,138,0.6)", color: "#fde68a", fontSize: 19, fontWeight: 900 }, `채굴 축제 · 무료 채굴 2배 ${d.festivalUntil ? `~${d.festivalUntil}` : ""}`)
        : h("div", { display: "flex", fontSize: 18, fontWeight: 700, color: "#a5b4fc" }, share >= 1 ? "목표 달성!" : `${fmtN(Math.max(0, (d.target || 0) - (d.attempts || 0)))}회 더 캐면 24시간 무료 채굴 2배`),
    ),
    h("div", { display: "flex", marginTop: 14 }, premiumBar(width, share, d.festivalActive || share >= 1 ? GOLD_BAR : BAR_DEFAULT, 14)),
  );
}

/**
 * 다이아 캐기 패널 — d: { attempts, target, participants, totalPoints, festivalActive, festivalUntil, odds: [{key,pct}], time }
 */
export function minePanelTree(d) {
  const odds = d.odds ?? [];
  return h("div", PAGE(d.festivalActive ? "#3b2a0a" : "#1e1b4b"),
    brandHeader(d, "DOES MINING", "다이아 캐기", "이번 주 참여", `${fmtN(d.participants)}명 · ${fmtN(d.totalPoints)}P`),
    h("div", { display: "flex", marginTop: 30 }, goalBlock(d, 988)),
    h("div", { display: "flex", marginTop: 26 }, glowLine()),
    h("div", { display: "flex", justifyContent: "space-between", marginTop: 22 },
      ...ORE_ORDER.map((k) => {
        const o = ORE_STYLE[k];
        const pct = odds.find((x) => x.key === k)?.pct ?? 0;
        return h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: 130 },
          h("div", { display: "flex", width: 74, height: 74, borderRadius: 22, alignItems: "center", justifyContent: "center", background: `radial-gradient(circle at 50% 40%, ${o.dark}55 0%, rgba(255,255,255,0.03) 70%)`, border: "1.5px solid rgba(255,255,255,0.08)" }, oreIcon(k, 52)),
          h("div", { display: "flex", marginTop: 10, fontSize: 18, fontWeight: 700, color: "#e2e8f0" }, o.name),
          h("div", { display: "flex", marginTop: 2, fontSize: 16, fontWeight: 700, color: k === "netherite" ? "#c4b5fd" : "#64748b" }, `${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`),
        );
      }),
    ),
    footer("하루 1회 무료 · 500P 채굴은 보상 ×1.5 · 확률은 기본 곡괭이 기준", d.time ? `${d.time} 갱신` : "doesmc.xyz"),
  );
}

/**
 * 채굴 결과 — d: { name, avatar, ore, amount, base, mult, pickaxeName, pickaxeColor, festivalActive, attempts, target, already }
 */
export function mineResultTree(d) {
  const o = ORE_STYLE[d.ore] ?? ORE_STYLE.stone;
  const miss = d.ore === "stone" || !d.amount;
  return h("div", PAGE(miss ? "#1e293b" : `${o.dark}55`),
    brandHeader(d, d.already ? "TODAY'S MINING" : d.paid ? "500P MINING" : "MINING RESULT", `${d.name ?? "회원"} 님의 채굴`, d.already ? "오늘 이미 캤어요" : "오늘 획득", miss ? "꽝" : `+${fmtN(d.amount)}P`, { avatar: d.avatar ?? null, titleSize: 38 }),
    h("div", { display: "flex", alignItems: "center", marginTop: 26, padding: "26px 34px", borderRadius: 28, background: `radial-gradient(ellipse 45% 90% at 18% 50%, ${o.dark}44 0%, rgba(255,255,255,0.02) 100%)`, border: "1.5px solid rgba(255,255,255,0.08)" },
      h("div", { display: "flex", width: 190, height: 190, alignItems: "center", justifyContent: "center", borderRadius: 190, background: `radial-gradient(circle, ${o.dark}66 0%, rgba(0,0,0,0) 70%)` }, oreIcon(d.ore, 150)),
      h("div", { display: "flex", flexDirection: "column", marginLeft: 34, flex: 1 },
        h("div", { display: "flex", fontSize: 20, fontWeight: 700, color: "#94a3b8" }, miss ? "아쉽게도…" : "채굴 성공!"),
        h("div", { display: "flex", fontSize: 64, fontWeight: 900, letterSpacing: -2, color: miss ? "#cbd5e1" : o.light, marginTop: 2 }, o.name),
        h("div", { display: "flex", fontSize: 40, fontWeight: 900, marginTop: 4, color: miss ? "#64748b" : "#fff" }, miss ? "꽝 · 내일 다시 도전해요" : `+${fmtN(d.amount)}P`),
        h("div", { display: "flex", gap: 10, marginTop: 14 },
          h("div", { display: "flex", alignItems: "center", padding: "6px 14px 6px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)", fontSize: 17, fontWeight: 700, color: "#e2e8f0" }, pickaxeIcon(d.pickaxeColor ?? "#b45309", 26), h("div", { display: "flex", marginLeft: 6 }, d.pickaxeName ?? "나무 곡괭이")),
          (d.mult ?? 1) > 1 ? h("div", { display: "flex", padding: "6px 14px", borderRadius: 999, background: "rgba(245,158,11,0.18)", border: "1.5px solid rgba(253,230,138,0.5)", fontSize: 17, fontWeight: 900, color: "#fde68a" }, `× ${d.mult} 배율 (기본 ${fmtN(d.base)}P)`) : null,
        ),
      ),
    ),
    h("div", { display: "flex", marginTop: 24 }, goalBlock(d, 988)),
    footer(d.paid ? "500P 채굴은 보상 ×1.5 · 원하는 만큼 다시 캘 수 있어요" : "무료 채굴은 내일 0시(한국 시간)에 다시 · 더 캐려면 500P", "doesmc.xyz"),
  );
}

/**
 * 곡괭이 강화 카드 — d: { level, balance, ladder: [{name,color,cost}], now: [{key,pct}], next: [{key,pct}] | null }
 */
export function pickaxeCardTree(d) {
  const ladder = d.ladder ?? [];
  const next = d.next;
  return h("div", PAGE("#1e1b4b"),
    brandHeader(d, "PICKAXE", "곡괭이 강화", "보유 포인트", `${fmtN(d.balance)}P`),
    h("div", { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 30 },
      ...ladder.map((p, i) => {
        const cur = i === d.level;
        const done = i < d.level;
        return h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: 180, opacity: i > d.level + 1 ? 0.45 : 1 },
          h("div", { display: "flex", width: 104, height: 104, borderRadius: 30, alignItems: "center", justifyContent: "center",
            background: cur ? `radial-gradient(circle at 50% 40%, ${p.color}55 0%, rgba(255,255,255,0.04) 75%)` : "rgba(255,255,255,0.035)",
            border: cur ? `2.5px solid ${p.color}` : "1.5px solid rgba(255,255,255,0.08)",
            boxShadow: cur ? `0 0 30px ${p.color}66` : "none" }, pickaxeIcon(p.color, 72)),
          h("div", { display: "flex", marginTop: 10, fontSize: 18, fontWeight: 900, color: cur ? "#fff" : done ? "#94a3b8" : "#cbd5e1" }, p.name),
          h("div", { display: "flex", marginTop: 2, fontSize: 15, fontWeight: 700, color: cur ? p.color : "#64748b" }, cur ? "사용 중" : done ? "완료" : `${fmtN(p.cost)}P`),
        );
      }),
    ),
    h("div", { display: "flex", marginTop: 26 }, glowLine()),
    h("div", { display: "flex", marginTop: 18, fontSize: 18, fontWeight: 700, color: "#94a3b8" }, next ? "강화하면 이렇게 바뀌어요" : "최고 등급 곡괭이예요 · 현재 확률"),
    h("div", { display: "flex", justifyContent: "space-between", marginTop: 14 },
      ...ORE_ORDER.map((k) => {
        const a = (d.now ?? []).find((x) => x.key === k)?.pct ?? 0;
        const b = next ? (next.find((x) => x.key === k)?.pct ?? 0) : null;
        const up = b !== null && b > a + 0.001;
        const down = b !== null && b < a - 0.001;
        const f = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`;
        return h("div", { display: "flex", flexDirection: "column", alignItems: "center", width: 130 },
          oreIcon(k, 44),
          h("div", { display: "flex", marginTop: 6, fontSize: 16, fontWeight: 700, color: "#e2e8f0" }, ORE_STYLE[k].name),
          h("div", { display: "flex", marginTop: 2, fontSize: 15, fontWeight: 700, color: "#64748b" }, f(a)),
          b !== null ? h("div", { display: "flex", marginTop: 1, fontSize: 16, fontWeight: 900, color: up ? "#86efac" : down ? "#fca5a5" : "#94a3b8" }, `${up ? "▲" : down ? "▼" : ""} ${f(b)}`) : null,
        );
      }),
    ),
    footer(next ? `다음 단계 ${d.nextName} · ${fmtN(d.nextCost)}P` : "모든 단계를 강화했어요", "doesmc.xyz"),
  );
}

/* ───────── 출석 상점 (DOES 커뮤니티 봇 뽑기) ───────── */
function prizeIcon(kind, size) {
  const svgs = {
    points: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef3c7"/><stop offset="0.5" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs><circle cx="32" cy="32" r="27" fill="url(#c)" stroke="#fff" stroke-opacity="0.5" stroke-width="2"/><circle cx="32" cy="32" r="20" fill="none" stroke="#92400e" stroke-opacity="0.35" stroke-width="2"/><text x="32" y="42" font-size="26" font-weight="900" text-anchor="middle" fill="#78350f" font-family="Arial">P</text></svg>`,
    mc: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon points="32,6 58,19 32,32 6,19" fill="#4ade80"/><polygon points="6,19 32,32 32,60 6,46" fill="#a16207"/><polygon points="58,19 32,32 32,60 58,46" fill="#854d0e"/><polygon points="6,19 32,32 32,38 6,25" fill="#22c55e"/><polygon points="58,19 32,32 32,38 58,25" fill="#16a34a"/></svg>`,
    nitro: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="8" y="26" width="48" height="32" rx="5" fill="#a78bfa"/><rect x="5" y="17" width="54" height="12" rx="4" fill="#c4b5fd"/><rect x="28" y="17" width="8" height="41" fill="#f472b6"/><path d="M32 17 C24 4, 12 10, 20 17 Z M32 17 C40 4, 52 10, 44 17 Z" fill="#f472b6"/></svg>`,
    charge: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M6 18 h52 v9 a5 5 0 0 0 0 10 v9 h-52 v-9 a5 5 0 0 0 0 -10 z" fill="#f9a8d4" stroke="#fff" stroke-opacity="0.5" stroke-width="2"/><line x1="40" y1="20" x2="40" y2="44" stroke="#be185d" stroke-width="2" stroke-dasharray="3 3"/><text x="23" y="38" font-size="16" font-weight="900" text-anchor="middle" fill="#831843" font-family="Arial">W</text></svg>`,
    none: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#334155" stroke="#64748b" stroke-width="2"/><path d="M22 22 L42 42 M42 22 L22 42" stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/></svg>`,
  };
  return img(svgUri(svgs[kind] ?? svgs.none), { width: size, height: size });
}
const PRIZE_TINT = { points: "#fbbf24", mc: "#4ade80", nitro: "#a78bfa", charge: "#f472b6", none: "#64748b" };

/**
 * 출석 상점 패널 — d: { cost, prizes: [{ name, kind, pct }] }
 */
export function attShopHeight(d) {
  return 40 + 82 + 28 + 2 + 14 + Math.max(1, (d.prizes ?? []).length) * 72 + 70;
}
export function attShopTree(d) {
  const prizes = (d.prizes ?? []).slice(0, 9);
  const max = Math.max(1, ...prizes.map((p) => p.pct || 0));
  const f = (v) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`;
  return h("div", PAGE("#2a1b4b"),
    brandHeader(d, "ATTENDANCE SHOP", "출석 상점", "뽑기권 1장", `${fmtN(d.cost)}P`),
    h("div", { display: "flex", marginTop: 28 }, glowLine()),
    h("div", { display: "flex", flexDirection: "column", marginTop: 14 },
      ...prizes.map((p, k) =>
        h("div", { display: "flex", alignItems: "center", width: "100%", padding: "11px 8px", borderBottom: k === prizes.length - 1 ? "none" : "1px solid rgba(255,255,255,0.07)" },
          h("div", { display: "flex", width: 58, height: 50, alignItems: "center" }, prizeIcon(p.kind, 44)),
          h("div", { display: "flex", flexDirection: "column", flexGrow: 1, marginLeft: 8 },
            h("div", { display: "flex", fontSize: 23, fontWeight: 700, color: "#f1f5f9" }, p.name),
            h("div", { display: "flex", marginTop: 8 }, premiumBar(460, (p.pct || 0) / max, [PRIZE_TINT[p.kind] ?? ACC, "#a78bfa", "#22d3ee"], 8)),
          ),
          h("div", { display: "flex", fontSize: 26, fontWeight: 900, color: PRIZE_TINT[p.kind] ?? "#fff" }, f(p.pct || 0)),
        ),
      ),
    ),
    footer(`꽝 ${f(Math.max(0, 100 - prizes.reduce((s, p) => s + (p.pct || 0), 0)))} · 포인트 상품은 바로 지급 · 실물 상품은 관리자가 전달`, "매일 /출석 으로 포인트 모으기"),
  );
}

/**
 * 출석 상점 뽑기 결과 — d: { name, avatar, prize, pkind, cost, balance, log }
 */
export function attResultTree(d) {
  const kind = d.pkind ?? "none";
  const tint = PRIZE_TINT[kind] ?? "#64748b";
  const miss = kind === "none";
  return h("div", PAGE(miss ? "#1e293b" : `${tint}33`),
    brandHeader(d, d.log ? "DRAW LOG" : "ATTENDANCE DRAW", `${d.name ?? "회원"} 님의 뽑기`, "남은 포인트", `${fmtN(d.balance)}P`, { avatar: d.avatar ?? null, titleSize: 38 }),
    h("div", { display: "flex", alignItems: "center", marginTop: 26, padding: "24px 34px", borderRadius: 28, background: `radial-gradient(ellipse 45% 90% at 16% 50%, ${tint}33 0%, rgba(255,255,255,0.02) 100%)`, border: "1.5px solid rgba(255,255,255,0.08)" },
      h("div", { display: "flex", width: 170, height: 170, alignItems: "center", justifyContent: "center", borderRadius: 170, background: `radial-gradient(circle, ${tint}55 0%, rgba(0,0,0,0) 70%)` }, prizeIcon(kind, 128)),
      h("div", { display: "flex", flexDirection: "column", marginLeft: 34, flex: 1 },
        h("div", { display: "flex", fontSize: 20, fontWeight: 700, color: "#94a3b8" }, miss ? "아쉽게도…" : "당첨!"),
        h("div", { display: "flex", fontSize: 58, fontWeight: 900, letterSpacing: -2, color: miss ? "#cbd5e1" : "#fff", marginTop: 2 }, miss ? "꽝" : d.prize ?? ""),
        h("div", { display: "flex", fontSize: 22, fontWeight: 700, color: miss ? "#64748b" : tint, marginTop: 8 },
          miss ? "다음 기회에!" : kind === "points" ? "출석 포인트로 바로 지급됐어요" : "관리자에게 문의하면 전달해 드려요"),
      ),
    ),
    footer(`뽑기권 ${fmtN(d.cost)}P 사용`, d.time ? `${d.time}` : "doesmc.xyz"),
  );
}

/**
 * /코인대행 패널 — d: { wallet (원|null), premium (%|null), volume (원), orders, coins: [{ sym, icon }], time }
 * 큰 숫자 3칸만 크게 보여 준다 (막대·칩 없음)
 */
function coinTile(label, value, sub, color, last) {
  const v = String(value);
  return h("div", {
      display: "flex", flexDirection: "column", flex: 1, padding: "26px 28px", marginRight: last ? 0 : 18,
      borderRadius: 26, background: "linear-gradient(160deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.02) 100%)",
      border: "1px solid rgba(255,255,255,0.10)",
    },
    h("div", { display: "flex", alignItems: "center", fontSize: 19, fontWeight: 700, color: "#94a3b8" },
      h("div", { display: "flex", width: 10, height: 10, borderRadius: 10, background: color, boxShadow: `0 0 12px ${color}`, marginRight: 10 }),
      label,
    ),
    h("div", { display: "flex", marginTop: 14, fontSize: v.length > 12 ? 36 : v.length > 10 ? 42 : v.length > 8 ? 46 : 56, fontWeight: 900, color, letterSpacing: -1.5, lineHeight: 1 }, v),
    h("div", { display: "flex", marginTop: 14, fontSize: 17, fontWeight: 500, color: "#64748b" }, sub),
  );
}

export function coinPanelTree(d) {
  const coins = (d.coins ?? []).slice(0, 4);
  const wallet = typeof d.wallet === "number" ? `₩${fmtN(Math.floor(d.wallet))}` : "확인 중";
  const prem = typeof d.premium === "number" ? `${d.premium >= 0 ? "+" : ""}${d.premium.toFixed(2)}%` : "—";
  return h("div", { ...PAGE("#064e3b"), padding: "42px 52px 30px" },
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 74, height: 74, marginRight: 20 }) : null,
        h("div", { display: "flex", flexDirection: "column" },
          h("div", { display: "flex", fontSize: 17, fontWeight: 700, color: "#34d399", letterSpacing: 6 }, "COIN EXCHANGE"),
          h("div", { display: "flex", fontSize: 50, fontWeight: 900, marginTop: 2, letterSpacing: -1.5 }, "DOES 코인대행"),
        ),
      ),
      h("div", { display: "flex" },
        ...coins.map((c, i) =>
          h("div", { display: "flex", alignItems: "center", marginLeft: i ? 12 : 0, padding: "10px 20px 10px 12px", borderRadius: 999,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" },
            c.icon ? img(c.icon, { width: 40, height: 40, marginRight: 10 }) : null,
            h("div", { display: "flex", fontSize: 24, fontWeight: 900 }, c.sym),
          ),
        ),
      ),
    ),
    h("div", { display: "flex", marginTop: 34 },
      coinTile("지갑 재고", wallet, "지금 바로 보낼 수 있는 금액", "#6ee7b7"),
      coinTile("김치 프리미엄", prem, "업비트 vs 해외 시세", "#fcd34d"),
      coinTile("누적 이용금액", `₩${fmtN(d.volume)}`, `${fmtN(d.orders)}건 송금 완료`, "#93c5fd", true),
    ),
    footer("실시간 업비트 시세 · 결제하면 자동 송금", d.time ? `${d.time} 기준` : "doesmc.xyz"),
  );
}
