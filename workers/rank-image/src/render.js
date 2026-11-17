// DOES 구매 랭킹 이미지 — satori 레이아웃(모든 div 는 flex)
const h = (type, style, ...children) => ({ type, props: { style, children: children.flat().filter((c) => c !== null && c !== false && c !== undefined) } });
const img = (src, style) => ({ type: "img", props: { src, style } });

const won = (n) => `₩${Math.round(n).toLocaleString("en-US")}`;
const MEDAL = [
  { ring: "#facc15", glow: "rgba(250,204,21,0.35)", label: "1", grad: "linear-gradient(180deg,#fde68a,#f59e0b)" },
  { ring: "#cbd5e1", glow: "rgba(203,213,225,0.28)", label: "2", grad: "linear-gradient(180deg,#f1f5f9,#94a3b8)" },
  { ring: "#fb923c", glow: "rgba(251,146,60,0.28)", label: "3", grad: "linear-gradient(180deg,#fed7aa,#ea580c)" },
];

function avatar(src, size, ring) {
  return h(
    "div",
    { display: "flex", width: size, height: size, borderRadius: size, padding: 4, background: ring, boxShadow: `0 0 24px ${ring}` },
    src
      ? img(src, { width: size - 8, height: size - 8, borderRadius: size, objectFit: "cover" })
      : h("div", { display: "flex", width: size - 8, height: size - 8, borderRadius: size, background: "#1f2937" }),
  );
}

function podium(row, i) {
  const m = MEDAL[i];
  const tall = i === 0;
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: 300,
      padding: "26px 18px 22px",
      marginTop: tall ? 0 : 34,
      borderRadius: 26,
      background: `linear-gradient(180deg, ${m.glow}, rgba(255,255,255,0.03))`,
      border: `2px solid ${m.ring}55`,
    },
    h("div", { display: "flex", position: "relative" },
      avatar(row?.avatar, tall ? 132 : 112, m.ring),
      h("div", { display: "flex", position: "absolute", bottom: -10, right: -6, width: 46, height: 46, borderRadius: 46, background: m.grad, alignItems: "center", justifyContent: "center", fontSize: 26, color: "#111827", border: "3px solid #0b0f1a" }, m.label),
    ),
    h("div", { display: "flex", marginTop: 20, fontSize: tall ? 30 : 26, color: "#fff", maxWidth: 260, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }, row ? row.name : "-"),
    h("div", { display: "flex", marginTop: 8, fontSize: tall ? 34 : 28, color: m.ring }, row ? won(row.amount) : "-"),
    h("div", { display: "flex", marginTop: 8, fontSize: 18, color: "#94a3b8" }, row ? `${row.count}건 · ${(row.share * 100).toFixed(1)}%` : ""),
  );
}

function line(row) {
  return h(
    "div",
    { display: "flex", alignItems: "center", width: "100%", padding: "12px 20px", borderRadius: 18, background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.07)", marginTop: 10 },
    h("div", { display: "flex", width: 54, fontSize: 26, color: "#64748b" }, `${row.rank}`),
    avatar(row.avatar, 56, "rgba(255,255,255,0.18)"),
    h("div", { display: "flex", flexDirection: "column", marginLeft: 18, flexGrow: 1 },
      h("div", { display: "flex", fontSize: 24, color: "#e2e8f0", maxWidth: 420, overflow: "hidden", whiteSpace: "nowrap" }, row.name),
      h("div", { display: "flex", marginTop: 8, width: 420, height: 10, borderRadius: 10, background: "rgba(255,255,255,0.08)" },
        h("div", { display: "flex", width: Math.max(8, Math.round(420 * row.barShare)), height: 10, borderRadius: 10, background: "linear-gradient(90deg,#6366f1,#22d3ee)" }),
      ),
    ),
    h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" },
      h("div", { display: "flex", fontSize: 26, color: "#fff" }, won(row.amount)),
      h("div", { display: "flex", marginTop: 4, fontSize: 16, color: "#64748b" }, `${row.count}건 · ${(row.share * 100).toFixed(1)}%`),
    ),
  );
}

export function rankTree(d) {
  const rows = d.rows ?? [];
  const max = rows[0]?.amount || 1;
  const rest = rows.slice(3).map((r) => ({ ...r, barShare: r.amount / max }));
  const top = [rows[1], rows[0], rows[2]];
  return h(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px 56px", background: "radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0b0f1a 55%, #070910 100%)", fontFamily: "Galmuri", color: "#fff" },
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" },
      h("div", { display: "flex", alignItems: "center" },
        d.logo ? img(d.logo, { width: 92, height: 92, marginRight: 22 }) : null,
        h("div", { display: "flex", flexDirection: "column" },
          h("div", { display: "flex", fontSize: 20, color: "#818cf8", letterSpacing: 4 }, "DOES RANKING"),
          h("div", { display: "flex", fontSize: 54, marginTop: 6 }, d.title ?? "구매 랭킹"),
        ),
      ),
      h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" },
        h("div", { display: "flex", fontSize: 22, color: "#cbd5e1" }, `구매자 ${Number(d.people ?? 0).toLocaleString("en-US")}명`),
        h("div", { display: "flex", fontSize: 30, marginTop: 6, color: "#fff" }, `누적 ${won(d.total ?? 0)}`),
      ),
    ),
    h("div", { display: "flex", justifyContent: "center", alignItems: "flex-start", marginTop: 36, gap: 22 }, ...top.map((r, k) => podium(r, [1, 0, 2][k]))),
    h("div", { display: "flex", flexDirection: "column", marginTop: 26 }, ...rest.map(line)),
    h("div", { display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 24, fontSize: 16, color: "#475569" },
      h("div", { display: "flex" }, "비율은 전체 누적 구매 금액 기준"),
      h("div", { display: "flex" }, d.updated ?? ""),
    ),
  );
}

export function rankHeight(d) {
  const n = Math.max(0, (d.rows?.length ?? 0) - 3);
  return 120 + 90 + 420 + 26 + n * 92 - 10;
}
