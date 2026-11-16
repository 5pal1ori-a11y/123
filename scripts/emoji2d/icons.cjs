// DOES 2D 이모지 50종 — SVG(128×128)로 그린다. icon(t) 의 t 는 움직이는 이모지의 0~1 진행값.
// 스타일: 위가 밝고 아래가 진한 그라데이션 + 같은 색 계열 진한 테두리 + 흰 광택 + 아래 그림자

const C = {
  red: ["#ff7a7a", "#e5283a", "#8f1022"],
  green: ["#7cf0a0", "#22b45a", "#0d6a33"],
  blue: ["#7cc4ff", "#2f7cf6", "#163f9c"],
  sky: ["#a8ecff", "#36b8f5", "#106a9c"],
  yellow: ["#fff2a0", "#ffc21a", "#a8640a"],
  orange: ["#ffc07a", "#ff7a1a", "#9c3c06"],
  purple: ["#d6b0ff", "#8b4cf0", "#4a1a96"],
  pink: ["#ffb0d8", "#f0469a", "#901a54"],
  gray: ["#e8ebf2", "#a3aabb", "#4f5668"],
  dark: ["#6b7286", "#3a3f50", "#1c1f29"],
  white: ["#ffffff", "#e6e9f2", "#8a91a6"],
  brown: ["#d9a26a", "#9a5a24", "#5a300c"],
  teal: ["#8ff5e0", "#14b8a6", "#0b6157"],
};

let uid = 0;
const defs = [];
function grad(col, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
  const id = `g${uid++}`;
  defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${col[0]}"/><stop offset="1" stop-color="${col[1]}"/></linearGradient>`);
  return `url(#${id})`;
}
function rgrad(c0, c1, cx = 0.35, cy = 0.3) {
  const id = `r${uid++}`;
  defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="0.8"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></radialGradient>`);
  return `url(#${id})`;
}
// 채운 모양 (그라데이션 + 테두리)
const F = (col, sw = 4) => `fill="${grad(col)}" stroke="${col[2]}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
const gloss = (x, y, rx, ry, rot = -20, o = 0.45) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${o}" transform="rotate(${rot} ${x} ${y})"/>`;
const shadow = (cx = 64, cy = 118, rx = 38) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="5" fill="#000" opacity="0.22"/>`;
const sparkle = (x, y, s, col = "#fff", o = 1) =>
  `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${col}" opacity="${o}"/>`;
const star = (cx, cy, R, r, n = 5, rot = -90) => {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const k = i % 2 ? r : R;
    p.push(`${(cx + Math.cos(a) * k).toFixed(1)},${(cy + Math.sin(a) * k).toFixed(1)}`);
  }
  return `M${p.join("L")}Z`;
};
const badge = (col, inner) => `${shadow(64, 118, 34)}<circle cx="64" cy="62" r="50" ${F(col, 5)}/>${gloss(48, 34, 22, 11)}${inner}`;
const heart = (cx, cy, k) =>
  `M${cx} ${cy + 34 * k}C${cx - 6 * k} ${cy + 28 * k} ${cx - 42 * k} ${cy + 6 * k} ${cx - 42 * k} ${cy - 14 * k}C${cx - 42 * k} ${cy - 34 * k} ${cx - 18 * k} ${cy - 42 * k} ${cx} ${cy - 22 * k}C${cx + 18 * k} ${cy - 42 * k} ${cx + 42 * k} ${cy - 34 * k} ${cx + 42 * k} ${cy - 14 * k}C${cx + 42 * k} ${cy + 6 * k} ${cx + 6 * k} ${cy + 28 * k} ${cx} ${cy + 34 * k}Z`;
const S = Math.sin;
const TAU = Math.PI * 2;

const I = {};

/* ── 기존 봇 이모지 21종 ── */
I.check = (t) => {
  const s = 1 + S(t * TAU) * 0.05;
  return `<g transform="translate(64 62) scale(${s}) translate(-64 -62)">${badge(C.green, `<path d="M38 64L56 82L92 44" fill="none" stroke="#0d6a33" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 3)" opacity="0.35"/><path d="M38 64L56 82L92 44" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`)}</g>${sparkle(104, 22, 9 * Math.max(0, S(t * TAU)), "#fff")}`;
};
I.cross = () => badge(C.red, `<path d="M44 42L84 82M84 42L44 82" stroke="#8f1022" stroke-width="18" stroke-linecap="round" opacity="0.35" transform="translate(0 3)"/><path d="M44 42L84 82M84 42L44 82" stroke="#fff" stroke-width="15" stroke-linecap="round"/>`);
I.star = (t) => {
  const r = S(t * TAU) * 10;
  return `${shadow(64, 118, 30)}<g transform="rotate(${r} 64 64)"><path d="${star(64, 64, 54, 24)}" ${F(C.yellow, 5)}/><path d="${star(64, 64, 34, 15)}" fill="#fff6c2" opacity="0.6"/>${gloss(50, 42, 12, 6)}</g>${sparkle(108, 24, 10 * Math.max(0, S(t * TAU * 2)))}${sparkle(20, 98, 7 * Math.max(0, -S(t * TAU * 2)))}`;
};
I.online = (t) => {
  const k = (t * 2) % 1;
  return `<circle cx="64" cy="64" r="${44 + k * 18}" fill="none" stroke="#22c55e" stroke-width="${6 * (1 - k)}" opacity="${1 - k}"/><circle cx="64" cy="64" r="44" fill="${rgrad("#a7ffc4", "#16a34a")}" stroke="#0d6a33" stroke-width="5"/>${gloss(48, 44, 14, 8)}`;
};
I.offline = () => `<circle cx="64" cy="64" r="44" fill="${rgrad("#c8ccd6", "#5b6170")}" stroke="#2f3340" stroke-width="5"/><circle cx="64" cy="64" r="18" fill="#2f3340" opacity="0.6"/>${gloss(52, 50, 12, 7, -20, 0.35)}`;
I.gem = (t) => {
  const y = S(t * TAU) * 4;
  const sh = (t * 1.4) % 1;
  return `${shadow(64, 118, 28)}<g transform="translate(0 ${y})"><path d="M30 44L46 22H82L98 44L64 104Z" ${F(C.sky, 4)}/><path d="M30 44H98M46 22L56 44L64 104M82 22L72 44L64 104M56 44L64 22L72 44" fill="none" stroke="#106a9c" stroke-width="2.5" stroke-linejoin="round" opacity="0.7"/><path d="M46 22L56 44H30Z" fill="#fff" opacity="0.45"/><path d="M64 22L56 44H72Z" fill="#fff" opacity="0.3"/><rect x="${-40 + sh * 160}" y="0" width="14" height="128" fill="#fff" opacity="0.35" transform="rotate(25 64 64)" clip-path="url(#gemclip)"/></g>${sparkle(100, 30 + y, 9 * Math.max(0, S(t * TAU * 2)))}`;
};
I.gift = (t) => {
  const lift = Math.max(0, S(t * TAU * 2)) * 8;
  return `${shadow()}<rect x="22" y="58" width="84" height="56" rx="8" ${F(C.pink)}/><rect x="56" y="58" width="16" height="56" fill="${grad(C.yellow)}"/>${gloss(36, 70, 8, 5, 0, 0.35)}<g transform="translate(0 ${-lift}) rotate(${-lift * 0.6} 22 58)"><rect x="16" y="40" width="96" height="22" rx="7" ${F(C.pink)}/><rect x="56" y="40" width="16" height="22" fill="${grad(C.yellow)}"/><path d="M64 40C50 18 30 22 36 34C40 42 56 40 64 40C72 40 88 42 92 34C98 22 78 18 64 40Z" ${F(C.yellow, 4)}/></g>`;
};
I.jackpot = (t, i) => {
  const on = i % 2;
  const bulbs = [30, 47, 64, 81, 98].map((x, k) => `<circle cx="${x}" cy="22" r="5" fill="${(k + on) % 2 ? "#fff59e" : "#a8640a"}" stroke="#7a4300" stroke-width="2"/>`).join("");
  const reel = (x) => `<rect x="${x}" y="48" width="22" height="34" rx="4" fill="#fffdf6" stroke="#4a1a96" stroke-width="2.5"/><text x="${x + 11}" y="76" font-family="DejaVu Sans" font-weight="bold" font-size="26" text-anchor="middle" fill="#e5283a" stroke="#8f1022" stroke-width="1.2">7</text>`;
  return `${shadow()}<rect x="16" y="14" width="96" height="98" rx="14" ${F(C.purple, 5)}/>${bulbs}<rect x="24" y="40" width="80" height="50" rx="8" fill="#2a1060" stroke="#1c0a44" stroke-width="3"/>${reel(29)}${reel(53)}${reel(77)}<rect x="30" y="96" width="68" height="8" rx="4" fill="${grad(C.yellow)}"/><path d="M112 70V40" stroke="#a3aabb" stroke-width="5" stroke-linecap="round"/><circle cx="112" cy="${36 + on * 4}" r="8" ${F(C.red, 3)}/>${gloss(30, 30, 8, 4, 0, 0.3)}`;
};
I.brick = () => {
  const b = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="24" rx="4" ${F(C.orange, 3.5)}/><rect x="${x + 4}" y="${y + 3}" width="${w - 8}" height="5" rx="2.5" fill="#fff" opacity="0.3"/>`;
  return `${shadow()}${b(10, 28, 52)}${b(66, 28, 52)}${b(10, 56, 26)}${b(40, 56, 50)}${b(94, 56, 24)}${b(10, 84, 52)}${b(66, 84, 52)}`;
};
I.clover = () => {
  const leafs = [0, 90, 180, 270].map((r) => `<path transform="rotate(${r} 64 58)" d="${heart(64, 34, 0.55)}" ${F(C.green, 4)}/>`).join("");
  return `${shadow(64, 118, 24)}<path d="M64 60Q70 92 86 112" fill="none" stroke="#0d6a33" stroke-width="7" stroke-linecap="round"/>${leafs}<circle cx="64" cy="58" r="6" fill="#0d6a33" opacity="0.5"/>${gloss(48, 30, 8, 4)}`;
};
I.flag = () => `${shadow(40, 118, 20)}<rect x="24" y="12" width="9" height="104" rx="4" fill="${grad(C.gray, 0, 0, 1, 0)}" stroke="#4f5668" stroke-width="2.5"/><circle cx="28.5" cy="12" r="7" ${F(C.yellow, 2.5)}/><path d="M33 20C52 12 66 30 88 22C96 19 104 18 110 20V66C96 62 84 72 66 70C52 68 44 60 33 64Z" ${F(C.red, 4)}/>${gloss(56, 32, 14, 5, -10, 0.35)}`;
I.inbox = () => `${shadow()}<path d="M14 74L28 40H100L114 74V104Q114 112 106 112H22Q14 112 14 104Z" ${F(C.gray, 4)}/><path d="M14 74H42L50 88H78L86 74H114" fill="none" stroke="#4f5668" stroke-width="4" stroke-linejoin="round"/><path d="M54 10H74V36H90L64 64L38 36H54Z" ${F(C.blue, 4)}/>${gloss(62, 20, 4, 8, 0, 0.4)}`;
I.island = () => `<ellipse cx="64" cy="102" rx="56" ry="16" fill="${grad(C.sky)}" stroke="#106a9c" stroke-width="3"/><path d="M26 100Q64 66 102 100Z" ${F(C.yellow, 3.5)}/><path d="M66 92Q60 60 72 36" fill="none" stroke="#5a300c" stroke-width="9" stroke-linecap="round"/><path d="M66 92Q60 60 72 36" fill="none" stroke="#b5733a" stroke-width="5" stroke-linecap="round"/>${["M72 36Q50 22 30 40Q52 32 72 36", "M72 36Q92 18 112 34Q90 30 72 36", "M72 36Q64 12 46 14Q62 20 72 36", "M72 36Q88 44 98 62Q84 46 72 36", "M72 36Q54 46 46 64Q58 46 72 36"].map((d) => `<path d="${d}" ${F(C.green, 3)}/>`).join("")}<circle cx="70" cy="40" r="5" fill="#7a4a1c"/>`;
I.mail = () => `${shadow()}<rect x="14" y="30" width="100" height="72" rx="10" ${F(C.white, 4)}/><path d="M16 36L64 72L112 36" fill="none" stroke="#8a91a6" stroke-width="4" stroke-linejoin="round"/><circle cx="104" cy="30" r="15" ${F(C.red, 3.5)}/><text x="104" y="36" font-family="DejaVu Sans" font-weight="bold" font-size="17" text-anchor="middle" fill="#fff">1</text>`;
I.party = () => `${shadow(54, 118, 26)}<path d="M18 112L44 44L86 86Z" ${F(C.yellow, 4)}/><path d="M28 86L36 66L58 88L44 96Z" fill="#f0469a" opacity="0.85"/><path d="M22 102L26 92L34 100Z" fill="#f0469a" opacity="0.85"/><path d="M64 46Q76 26 70 12M74 58Q94 50 98 30M84 72Q104 74 116 60" fill="none" stroke-width="5" stroke-linecap="round" stroke="#8b4cf0"/>${[[96, 14, "#2f7cf6"], [110, 40, "#22b45a"], [60, 22, "#e5283a"], [116, 84, "#ffc21a"], [88, 46, "#f0469a"]].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="9" height="13" rx="2" fill="${c}" transform="rotate(30 ${x} ${y})"/>`).join("")}`;
I.plus = () => `${shadow(64, 118, 30)}<path d="M50 14H78V50H114V78H78V114H50V78H14V50H50Z" ${F(C.green, 5)} rx="6"/>${gloss(62, 26, 5, 10, 0, 0.4)}`;
I.robot = () => `${shadow()}<path d="M64 26V12" stroke="#4f5668" stroke-width="5" stroke-linecap="round"/><circle cx="64" cy="10" r="7" ${F(C.red, 3)}/><rect x="8" y="52" width="12" height="28" rx="5" ${F(C.gray, 3)}/><rect x="108" y="52" width="12" height="28" rx="5" ${F(C.gray, 3)}/><rect x="18" y="26" width="92" height="82" rx="20" ${F(C.gray, 5)}/><rect x="30" y="42" width="68" height="44" rx="12" fill="#1c2233" stroke="#0e1220" stroke-width="3"/><circle cx="50" cy="62" r="8" fill="#5ee0ff"/><circle cx="78" cy="62" r="8" fill="#5ee0ff"/><rect x="52" y="76" width="24" height="4" rx="2" fill="#5ee0ff"/>${gloss(36, 34, 10, 4, 0, 0.5)}`;
I.sold = () => `<g transform="rotate(-12 64 64)"><rect x="8" y="36" width="112" height="56" rx="12" ${F(C.red, 5)}/><rect x="16" y="44" width="96" height="40" rx="7" fill="none" stroke="#fff" stroke-width="4"/><text x="64" y="76" font-family="DejaVu Sans" font-weight="bold" font-size="29" text-anchor="middle" fill="#fff" letter-spacing="1">SOLD</text></g>`;
I.sprout = () => `${shadow(64, 118, 30)}<path d="M64 74V44" stroke="#0d6a33" stroke-width="7" stroke-linecap="round"/><path d="M64 48C58 28 36 22 20 30C30 50 52 54 64 48Z" ${F(C.green, 4)}/><path d="M64 44C70 22 94 14 110 22C100 46 76 50 64 44Z" ${F(C.green, 4)}/><path d="M30 70H98L90 112H38Z" ${F(C.orange, 4)}/><rect x="24" y="64" width="80" height="14" rx="5" ${F(C.orange, 4)}/>${gloss(40, 86, 4, 10, 10, 0.3)}`;
I.ticket = () => `<g transform="rotate(-14 64 64)"><path d="M10 38H118V56A9 9 0 0 0 118 74V92H10V74A9 9 0 0 0 10 56Z" ${F(C.yellow, 4)}/><path d="M86 42V88" stroke="#a8640a" stroke-width="3" stroke-dasharray="5 5"/><path d="${star(48, 65, 16, 7)}" ${F(C.red, 3)}/>${gloss(36, 46, 14, 3.5, 0, 0.45)}</g>`;
I.tree = () => `${shadow()}<path d="M56 112V78H72V112Z" ${F(C.brown, 4)}/><circle cx="40" cy="66" r="24" ${F(C.green, 4)}/><circle cx="88" cy="66" r="24" ${F(C.green, 4)}/><circle cx="64" cy="42" r="32" ${F(C.green, 4)}/>${gloss(52, 26, 12, 6)}`;

/* ── 새 이모지 29종 ── */
I.cart = () => `${shadow()}<path d="M8 22H26L40 82H100L112 40H32" fill="none" stroke="#163f9c" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 44H108L98 78H42Z" fill="${grad(C.blue)}"/><circle cx="46" cy="100" r="10" ${F(C.dark, 4)}/><circle cx="94" cy="100" r="10" ${F(C.dark, 4)}/>${gloss(60, 52, 14, 4, 0, 0.4)}`;
I.card = () => `<g transform="rotate(-8 64 64)"><rect x="10" y="28" width="108" height="72" rx="12" ${F(C.purple, 4)}/><rect x="10" y="44" width="108" height="14" fill="#2a1060"/><rect x="22" y="70" width="22" height="16" rx="4" fill="${grad(C.yellow)}"/><rect x="54" y="74" width="50" height="6" rx="3" fill="#fff" opacity="0.7"/>${gloss(36, 34, 18, 3, 0, 0.4)}</g>`;
I.coin = () => `${shadow(64, 118, 34)}<circle cx="64" cy="62" r="50" ${F(C.yellow, 5)}/><circle cx="64" cy="62" r="38" fill="none" stroke="#a8640a" stroke-width="4" opacity="0.6"/><text x="64" y="80" font-family="DejaVu Sans" font-weight="bold" font-size="50" text-anchor="middle" fill="#a8640a">₩</text>${gloss(46, 32, 16, 8)}`;
I.crown = () => `${shadow()}<path d="M14 40L38 66L64 24L90 66L114 40L104 100H24Z" ${F(C.yellow, 5)}/><rect x="22" y="94" width="84" height="16" rx="5" ${F(C.yellow, 4)}/><circle cx="64" cy="70" r="9" ${F(C.red, 3)}/><circle cx="38" cy="78" r="6" ${F(C.sky, 2.5)}/><circle cx="90" cy="78" r="6" ${F(C.green, 2.5)}/><circle cx="14" cy="38" r="6" ${F(C.yellow, 3)}/><circle cx="64" cy="22" r="6" ${F(C.yellow, 3)}/><circle cx="114" cy="38" r="6" ${F(C.yellow, 3)}/>${gloss(44, 60, 8, 4, -40, 0.4)}`;
I.heart = () => `${shadow(64, 118, 30)}<path d="${heart(64, 66, 1.25)}" ${F(C.pink, 5)}/>${gloss(40, 42, 12, 7, -35, 0.5)}`;
I.fire = () => `${shadow(64, 118, 28)}<path d="M64 8C70 30 98 42 98 76C98 98 82 114 64 114C46 114 30 98 30 76C30 56 42 50 46 36C52 48 56 52 58 54C60 38 58 22 64 8Z" ${F(C.orange, 5)}/><path d="M64 56C68 70 82 76 82 92C82 104 74 112 64 112C54 112 46 104 46 92C46 80 56 76 64 56Z" fill="${grad(C.yellow)}"/>`;
I.bell = () => `${shadow()}<path d="M64 14C40 14 30 34 30 56V80L18 96H110L98 80V56C98 34 88 14 64 14Z" ${F(C.yellow, 5)}/><circle cx="64" cy="104" r="11" ${F(C.yellow, 4)}/><circle cx="64" cy="12" r="6" ${F(C.yellow, 3)}/>${gloss(48, 36, 7, 14, 15, 0.45)}`;
I.lock = () => `${shadow()}<path d="M40 56V40C40 24 50 14 64 14C78 14 88 24 88 40V56" fill="none" stroke="#4f5668" stroke-width="12" stroke-linecap="round"/><path d="M40 56V40C40 24 50 14 64 14C78 14 88 24 88 40V56" fill="none" stroke="#c4c9d6" stroke-width="6" stroke-linecap="round"/><rect x="22" y="52" width="84" height="62" rx="12" ${F(C.yellow, 5)}/><circle cx="64" cy="78" r="9" fill="#7a4300"/><rect x="60" y="80" width="8" height="18" rx="3" fill="#7a4300"/>${gloss(40, 62, 10, 4, 0, 0.45)}`;
I.key = () => `<g transform="rotate(-40 64 64)"><circle cx="34" cy="64" r="24" ${F(C.yellow, 5)}/><circle cx="34" cy="64" r="9" fill="#a8640a"/><path d="M56 58H116V70H106V84H94V70H84V80H72V70H56Z" ${F(C.yellow, 4)}/>${gloss(26, 50, 8, 4, 0, 0.5)}</g>`;
I.shield = () => `${shadow()}<path d="M64 8L108 24V60C108 88 88 106 64 116C40 106 20 88 20 60V24Z" ${F(C.blue, 5)}/><path d="M64 20L96 32V60C96 80 82 94 64 102Z" fill="#fff" opacity="0.18"/><path d="M44 62L58 76L86 46" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`;
I.warning = () => `${shadow()}<path d="M64 10L120 108H8Z" ${F(C.yellow, 6)}/><rect x="58" y="42" width="12" height="38" rx="6" fill="#4a2a00"/><circle cx="64" cy="92" r="7" fill="#4a2a00"/>`;
I.info = () => badge(C.blue, `<circle cx="64" cy="38" r="8" fill="#fff"/><rect x="56" y="52" width="16" height="42" rx="8" fill="#fff"/>`);
I.question = () => badge(C.purple, `<text x="64" y="86" font-family="DejaVu Sans" font-weight="bold" font-size="66" text-anchor="middle" fill="#fff">?</text>`);
I.clock = () => badge(C.white, `<circle cx="64" cy="62" r="38" fill="#fff" stroke="#c4c9d6" stroke-width="3"/>${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => `<rect x="62" y="26" width="4" height="${a % 90 ? 5 : 9}" rx="2" fill="#4f5668" transform="rotate(${a} 64 62)"/>`).join("")}<path d="M64 62V38M64 62L82 72" stroke="#1c1f29" stroke-width="6" stroke-linecap="round"/><circle cx="64" cy="62" r="5" fill="#e5283a"/>`);
I.calendar = () => `${shadow()}<rect x="14" y="20" width="100" height="94" rx="14" ${F(C.white, 4)}/><path d="M14 34Q14 20 28 20H100Q114 20 114 34V46H14Z" fill="${grad(C.red)}" stroke="#8f1022" stroke-width="4"/><rect x="36" y="10" width="8" height="20" rx="4" fill="#4f5668"/><rect x="84" y="10" width="8" height="20" rx="4" fill="#4f5668"/><text x="64" y="98" font-family="DejaVu Sans" font-weight="bold" font-size="42" text-anchor="middle" fill="#3a3f50">7</text>`;
I.trophy = () => `${shadow()}<path d="M36 18H92V48C92 66 80 78 64 78C48 78 36 66 36 48Z" ${F(C.yellow, 5)}/><path d="M36 28H18C18 50 30 58 40 58M92 28H110C110 50 98 58 88 58" fill="none" stroke="#a8640a" stroke-width="7" stroke-linecap="round"/><rect x="56" y="76" width="16" height="16" ${F(C.yellow, 3)}/><rect x="34" y="92" width="60" height="20" rx="5" ${F(C.brown, 4)}/><path d="${star(64, 44, 13, 6)}" fill="#fff" opacity="0.8"/>${gloss(46, 30, 5, 10, 0, 0.45)}`;
I.medal = () => `${shadow(64, 118, 26)}<path d="M38 8H58L70 48H50Z" fill="${grad(C.red)}" stroke="#8f1022" stroke-width="3"/><path d="M90 8H70L58 48H78Z" fill="${grad(C.blue)}" stroke="#163f9c" stroke-width="3"/><circle cx="64" cy="80" r="32" ${F(C.yellow, 5)}/><path d="${star(64, 80, 18, 8)}" fill="#fff6c2" stroke="#a8640a" stroke-width="2"/>${gloss(50, 64, 8, 4)}`;
I.rocket = () => `<g transform="rotate(40 64 64)"><path d="M52 90Q64 120 76 90Z" fill="${grad(C.yellow)}"/><path d="M64 6C84 24 88 54 82 90H46C40 54 44 24 64 6Z" ${F(C.white, 4)}/><circle cx="64" cy="46" r="11" fill="${grad(C.sky)}" stroke="#106a9c" stroke-width="3.5"/><path d="M46 66L28 90H46ZM82 66L100 90H82Z" ${F(C.red, 3.5)}/><path d="M64 6C72 14 76 22 78 30H50C52 22 56 14 64 6Z" fill="${grad(C.red)}"/></g>`;
I.lightning = () => `${shadow(64, 118, 24)}<path d="M74 6L26 72H60L50 122L104 50H70Z" ${F(C.yellow, 5)}/>${gloss(60, 36, 4, 12, 30, 0.5)}`;
I.sparkles = () => `${sparkle(54, 64, 42, grad(C.yellow))}${sparkle(100, 28, 18, grad(C.yellow))}${sparkle(98, 98, 13, grad(C.yellow))}<path d="M54 22Q54 64 96 64Q54 64 54 106Q54 64 12 64Q54 64 54 22Z" fill="none" stroke="#a8640a" stroke-width="3" stroke-linejoin="round"/>`;
I.link = () => `<g transform="rotate(-45 64 64)" fill="none" stroke-linecap="round"><rect x="14" y="48" width="52" height="32" rx="16" stroke="#163f9c" stroke-width="14"/><rect x="14" y="48" width="52" height="32" rx="16" stroke="${grad(C.blue)}" stroke-width="8"/><rect x="62" y="48" width="52" height="32" rx="16" stroke="#163f9c" stroke-width="14"/><rect x="62" y="48" width="52" height="32" rx="16" stroke="${grad(C.sky)}" stroke-width="8"/></g>`;
I.megaphone = () => `${shadow()}<path d="M18 52H40L96 20V104L40 76H18Z" ${F(C.red, 5)}/><rect x="10" y="50" width="22" height="28" rx="6" ${F(C.white, 3.5)}/><path d="M42 78L50 106H66L60 84" ${F(C.white, 3.5)}/><path d="M106 48Q116 62 106 76" fill="none" stroke="#ffc21a" stroke-width="6" stroke-linecap="round"/>${gloss(66, 40, 14, 4, -30, 0.4)}`;
I.chart = () => `${shadow()}<rect x="12" y="12" width="104" height="100" rx="14" ${F(C.white, 4)}/><rect x="26" y="68" width="18" height="32" rx="4" ${F(C.blue, 3)}/><rect x="55" y="50" width="18" height="50" rx="4" ${F(C.purple, 3)}/><rect x="84" y="30" width="18" height="70" rx="4" ${F(C.green, 3)}/><path d="M24 58L52 40L74 46L104 20" fill="none" stroke="#e5283a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
I.user = () => badge(C.teal, `<circle cx="64" cy="48" r="17" fill="#fff"/><path d="M30 98C32 78 46 70 64 70C82 70 96 78 98 98Z" fill="#fff"/>`);
I.pickaxe = () => `<g transform="rotate(-35 64 64)"><rect x="58" y="34" width="12" height="84" rx="5" ${F(C.brown, 3.5)}/><path d="M10 44Q64 4 118 44L108 52Q64 24 20 52Z" ${F(C.sky, 4)}/>${gloss(40, 30, 10, 3, -20, 0.5)}</g>`;
I.sword = () => `<g transform="rotate(45 64 64)"><path d="M64 4L76 18V82H52V18Z" ${F(C.sky, 4)}/><path d="M64 10V80" stroke="#fff" stroke-width="3" opacity="0.6"/><rect x="36" y="80" width="56" height="12" rx="5" ${F(C.yellow, 3.5)}/><rect x="58" y="92" width="12" height="24" rx="4" ${F(C.brown, 3)}/><circle cx="64" cy="120" r="7" ${F(C.yellow, 3)}/></g>`;
I.new = () => `${shadow(64, 108, 44)}<path d="${star(64, 64, 58, 46, 14)}" ${F(C.red, 4)}/><text x="64" y="74" font-family="DejaVu Sans" font-weight="bold" font-size="28" text-anchor="middle" fill="#fff">NEW</text>`;
I.discount = () => `${shadow()}<path d="M70 10H112V52L58 106Q50 114 42 106L16 80Q8 72 16 64Z" ${F(C.orange, 5)}/><circle cx="94" cy="28" r="7" fill="#fff" stroke="#9c3c06" stroke-width="3"/><text x="56" y="76" font-family="DejaVu Sans" font-weight="bold" font-size="30" text-anchor="middle" fill="#fff" transform="rotate(-45 56 66)">%</text>`;
I.verified = () => `${shadow(64, 118, 30)}<path d="${star(64, 62, 54, 44, 12)}" ${F(C.blue, 5)}/><path d="M42 62L58 78L88 46" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;

module.exports = {
  I,
  ANIMATED: { check: 24, star: 24, online: 24, gem: 24, gift: 24, jackpot: 12 },
  render(name, t = 0, i = 0) {
    uid = 0;
    defs.length = 0;
    const body = I[name](t, i);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 128 128"><defs><clipPath id="gemclip"><path d="M30 44L46 22H82L98 44L64 104Z"/></clipPath>${defs.join("")}</defs>${body}</svg>`;
  },
};
