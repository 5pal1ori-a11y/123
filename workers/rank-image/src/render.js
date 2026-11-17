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
      h("div", { display: "flex", marginTop: 9, width: 460, height: 6, borderRadius: 6, background: "rgba(255,255,255,0.06)" },
        h("div", { display: "flex", width: Math.max(10, Math.round(460 * row.barShare)), height: 6, borderRadius: 6, background: `linear-gradient(90deg,${t.accent},${t.accent2})` }),
      ),
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
