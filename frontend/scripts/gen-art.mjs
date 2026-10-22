// 景品・バナーの SVG イラストを生成する（node scripts/gen-art.mjs）
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "art");
mkdirSync(join(root, "prizes"), { recursive: true });
mkdirSync(join(root, "banners"), { recursive: true });

// 決定的な乱数（毎回同じ絵になる）
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const PALETTE = {
  N: { bg1: "#1d2340", bg2: "#0a0f24", glow: "#dfe5f2", accent: "#c9ced9" },
  R: { bg1: "#123a55", bg2: "#081428", glow: "#9fe6fb", accent: "#84d8f1" },
  SR: { bg1: "#3b2475", bg2: "#110a2e", glow: "#d6c3ff", accent: "#a785f2" },
  SSR: { bg1: "#4a3413", bg2: "#140d22", glow: "#fff1c9", accent: "#e8c983" },
};

function stars(rand, n, w, h, color) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (rand() * w).toFixed(1), y = (rand() * h).toFixed(1), r = (rand() ** 2 * 1.8 + 0.3).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${(0.35 + rand() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}

function sparkle(x, y, s, color, op = 1) {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M0-10L2-2L10 0L2 2L0 10L-2 2L-10 0L-2-2Z" fill="${color}" opacity="${op}"/>`;
}

const GOLD = `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6df"/><stop offset=".45" stop-color="#e3c37f"/><stop offset="1" stop-color="#8f6d2e"/></linearGradient>`;
const SILVER = `<linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c3c9d8"/><stop offset="1" stop-color="#6b7389"/></linearGradient>`;

// 景品ごとのモチーフ（300×400 キャンバスの中央付近に描画）
const MOTIFS = {
  stardust: (p) => `
    <g transform="translate(150 215)">
      <ellipse cx="0" cy="78" rx="62" ry="10" fill="#000" opacity=".35"/>
      <path d="M-22-92h44v16c0 6 34 24 34 70v58c0 22-16 34-34 34h-44c-18 0-34-12-34-34v-58c0-46 34-64 34-70z" fill="url(#glass)" stroke="${p.glow}" stroke-opacity=".7" stroke-width="2"/>
      <rect x="-26" y="-108" width="52" height="20" rx="5" fill="url(#gold)"/>
      <path d="M-46 10h92v34c0 18-12 30-30 30h-32c-18 0-30-12-30-30z" fill="${p.accent}" opacity=".25"/>
      ${sparkle(-14, 22, 0.9, "#fff6df")}${sparkle(18, 40, 0.6, "#fff6df")}${sparkle(4, 0, 0.5, "#fff")}${sparkle(-24, 52, 0.4, "#fff")}
      <path d="M-30-60c-6 20-8 50-4 90" stroke="#fff" stroke-opacity=".55" stroke-width="5" fill="none" stroke-linecap="round"/>
    </g>`,
  moonleaf: (p) => `
    <g transform="translate(150 205) rotate(-8)">
      <rect x="-42" y="-120" width="84" height="230" rx="8" fill="url(#paper)" stroke="url(#gold)" stroke-width="3"/>
      <rect x="-32" y="-110" width="64" height="210" rx="4" fill="none" stroke="url(#gold)" stroke-width="1" stroke-dasharray="3 4"/>
      <circle cx="0" cy="-40" r="26" fill="url(#gold)"/><circle cx="10" cy="-46" r="22" fill="url(#paper)"/>
      <path d="M0 10c20 20 20 50 0 70c-20-20-20-50 0-70z" fill="none" stroke="url(#gold)" stroke-width="2"/>
      <path d="M0 14v62" stroke="url(#gold)" stroke-width="1.5"/>
      <path d="M0-120v-24" stroke="${p.accent}" stroke-width="3"/><circle cx="0" cy="-150" r="7" fill="url(#gold)"/>
      ${sparkle(-20, -78, 0.5, "#fff6df")}${sparkle(22, 0, 0.4, "#fff6df")}
    </g>`,
  candle: (p) => `
    <g transform="translate(150 230)">
      <ellipse cx="0" cy="80" rx="80" ry="14" fill="url(#gold)"/>
      <ellipse cx="0" cy="74" rx="66" ry="10" fill="#6b4f1e"/>
      <rect x="-34" y="-50" width="68" height="124" rx="8" fill="url(#wax)"/>
      <path d="M-34-40c10 8 20 2 24 14c3 10 10 6 12-2" stroke="#fff" stroke-opacity=".5" stroke-width="4" fill="none"/>
      <path d="M0-52v-14" stroke="#3a2a10" stroke-width="3"/>
      <circle cx="0" cy="-92" r="46" fill="url(#flameGlow)"/>
      <path d="M0-128c16 22 18 36 10 50c-6 10-20 10-26 0c-8-14-2-28 16-50z" fill="url(#flame)"/>
      <path d="M0-104c6 10 6 18 2 24c-3 4-8 4-10 0c-3-6 0-14 8-24z" fill="#fff"/>
    </g>`,
  feather: (p) => `
    <g transform="translate(150 200) rotate(28)">
      <path d="M0-140c58 40 66 140 0 230c-66-90-58-190 0-230z" fill="url(#featherG)" stroke="${p.glow}" stroke-opacity=".6"/>
      <path d="M0-140v290" stroke="url(#gold)" stroke-width="3"/>
      ${Array.from({ length: 11 }, (_, i) => { const y = -110 + i * 20; return `<path d="M0 ${y}c18 6 30 14 38 26M0 ${y}c-18 6-30 14-38 26" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" fill="none"/>`; }).join("")}
      <path d="M-6 150l6 30l6-30z" fill="url(#gold)"/>
      ${sparkle(30, -60, 0.6, "#fff6df")}${sparkle(-26, 10, 0.45, "#fff")}
    </g>`,
  aurora: (p) => crystal(p, 0),
  compass: (p) => `
    <g transform="translate(150 210)">
      <circle r="98" fill="url(#gold)"/><circle r="88" fill="#10183a"/>
      <circle r="80" fill="none" stroke="url(#gold)" stroke-width="1.5"/>
      ${Array.from({ length: 24 }, (_, i) => { const a = (i * Math.PI) / 12, r1 = i % 6 === 0 ? 62 : 72; return `<line x1="${(Math.cos(a) * r1).toFixed(1)}" y1="${(Math.sin(a) * r1).toFixed(1)}" x2="${(Math.cos(a) * 80).toFixed(1)}" y2="${(Math.sin(a) * 80).toFixed(1)}" stroke="url(#gold)" stroke-width="${i % 6 === 0 ? 2.5 : 1}"/>`; }).join("")}
      <path d="M0-60L12 0L0 60L-12 0z" fill="url(#gold)"/><path d="M0-60L12 0H-12z" fill="${p.accent}"/>
      <path d="M-60 0L0-10L60 0L0 10z" fill="url(#gold)" opacity=".55"/>
      <circle r="8" fill="url(#gold)"/><circle r="3" fill="#10183a"/>
      <rect x="-12" y="-118" width="24" height="22" rx="5" fill="url(#gold)"/><circle cy="-126" r="10" fill="none" stroke="url(#gold)" stroke-width="5"/>
      ${stars(rng(9), 20, 120, 120, "#fff").replace(/cx="/g, 'transform="translate(-60 -60)" cx="')}
    </g>`,
  music: (p) => `
    <g transform="translate(150 230)">
      <path d="M-90 10h180v62a12 12 0 01-12 12h-156a12 12 0 01-12-12z" fill="url(#gold)"/>
      <path d="M-84 18h168v50h-168z" fill="#2a1f52"/>
      ${Array.from({ length: 7 }, (_, i) => `<circle cx="${-66 + i * 22}" cy="43" r="7" fill="none" stroke="url(#gold)" stroke-width="1.5"/>`).join("")}
      <path d="M-96-6h192l-12 18h-168z" fill="url(#gold)"/>
      <path d="M-86-6c0-80 172-80 172 0" fill="url(#glass)" stroke="url(#gold)" stroke-width="2.5"/>
      <circle cx="0" cy="-40" r="22" fill="none" stroke="${p.glow}" stroke-opacity=".7"/>
      ${sparkle(0, -40, 1.3, "#fff6df")}${sparkle(-40, -24, 0.5, "#fff")}${sparkle(42, -30, 0.6, "#fff")}
      <path d="M-30-86c4-10 14-10 14 0v20" stroke="${p.glow}" stroke-width="2" fill="none"/><circle cx="-20" cy="-64" r="5" fill="${p.glow}"/>
      <path d="M24-96c4-10 14-10 14 0v26" stroke="${p.glow}" stroke-width="2" fill="none"/><circle cx="34" cy="-68" r="5" fill="${p.glow}"/>
    </g>`,
  amethyst: (p) => `
    <g transform="translate(150 225)">
      <path d="M-110 40l16-84l40 40l54-74l54 74l40-40l16 84z" fill="url(#gold)"/>
      <path d="M-110 40h220v26h-220z" fill="url(#gold)"/>
      <path d="M-104 46h208v14h-208z" fill="#6b4f1e" opacity=".6"/>
      ${gem(0, -42, 22, "#b48cff")}${gem(-58, -4, 14, "#c9b8f5")}${gem(58, -4, 14, "#c9b8f5")}
      ${[-80, -40, 0, 40, 80].map((x) => gem(x, 53, 7, "#a785f2")).join("")}
      <circle cx="-94" cy="-44" r="7" fill="url(#gold)"/><circle cx="94" cy="-44" r="7" fill="url(#gold)"/><circle cx="0" cy="-118" r="8" fill="url(#gold)"/>
      ${sparkle(30, -80, 0.7, "#fff")}${sparkle(-30, -60, 0.5, "#fff6df")}
    </g>`,
  hourglass: (p) => `
    <g transform="translate(150 210)">
      <rect x="-70" y="-130" width="140" height="18" rx="6" fill="url(#gold)"/>
      <rect x="-70" y="112" width="140" height="18" rx="6" fill="url(#gold)"/>
      <path d="M-60-112v10c0 40 46 64 46 102s-46 62-46 102v10M60-112v10c0 40-46 64-46 102s46 62 46 102v10" stroke="url(#gold)" stroke-width="5" fill="none"/>
      <path d="M-52-108c0 40 42 62 52 108c10-46 52-68 52-108z" fill="url(#glass)"/>
      <path d="M-52 108c0-40 42-62 52-108c10 46 52 68 52 108z" fill="url(#glass)"/>
      <path d="M-36-72h72c-10 22-28 34-36 60c-8-26-26-38-36-60z" fill="${p.accent}" opacity=".85"/>
      <path d="M0-10v70" stroke="${p.glow}" stroke-width="2" stroke-dasharray="2 6"/>
      <path d="M-44 104c10-28 30-36 44-44c14 8 34 16 44 44z" fill="${p.accent}"/>
      ${sparkle(-10, 70, 0.4, "#fff")}${sparkle(14, 84, 0.55, "#fff6df")}${sparkle(-20, 92, 0.35, "#fff")}${sparkle(4, 40, 0.3, "#fff")}
      <path d="M-82-112v224M82-112v224" stroke="url(#gold)" stroke-width="6"/>
    </g>`,
  crown: (p) => `
    <g transform="translate(150 220)">
      <circle r="120" fill="url(#halo)"/>
      <path d="M-104 50l-14-96l50 46l40-82l28 64l28-64l40 82l50-46l-14 96z" fill="url(#gold)" stroke="#fff6df" stroke-opacity=".6"/>
      <path d="M-104 50h208v30h-208z" fill="url(#gold)"/>
      ${gem(0, -30, 20, "#ffe6a8")}${gem(-56, 8, 13, "#b48cff")}${gem(56, 8, 13, "#84d8f1")}
      ${[-78, -39, 0, 39, 78].map((x, i) => gem(x, 65, 8, ["#f2b8d2", "#84d8f1", "#fff1c9", "#84d8f1", "#f2b8d2"][i])).join("")}
      ${[-118, -68, -28, 0, 28, 68, 118].map((x, i) => `<circle cx="${x}" cy="${[-46, 0, -82, -18, -82, 0, -46][i]}" r="6" fill="#fff6df"/>`).join("")}
      ${sparkle(-70, -90, 0.9, "#fff")}${sparkle(80, -100, 0.7, "#fff6df")}${sparkle(0, -120, 1.1, "#fff")}
    </g>`,
  dragon: (p) => `
    <g transform="translate(150 215)">
      <circle r="125" fill="url(#halo)"/>
      <path d="M-70 92c-40-30-50-90-20-130c-10 40 10 70 30 80c-30-50-10-100 30-120c-20 40-10 80 20 96c-6-40 20-70 50-76c-24 26-26 60-6 84c14-20 40-24 56-16c-24 8-34 30-28 50c20 30 6 60-20 70z" fill="url(#gold)" opacity=".85"/>
      <circle cy="-6" r="62" fill="url(#orb)"/>
      <circle cy="-6" r="62" fill="none" stroke="#fff6df" stroke-opacity=".7" stroke-width="2"/>
      <ellipse cx="-20" cy="-30" rx="18" ry="10" fill="#fff" opacity=".55" transform="rotate(-30 -20 -30)"/>
      <path d="M-30-6c16-20 44-20 60 0c-16 20-44 20-60 0z" fill="#3a1d05" opacity=".6"/><ellipse cy="-6" rx="5" ry="16" fill="#140800"/>
      ${sparkle(70, -80, 0.8, "#fff")}${sparkle(-80, -60, 0.6, "#fff6df")}
    </g>`,
  lastone_orb: (p) => `
    <g transform="translate(150 210)">
      <circle r="130" fill="url(#halo)"/>
      <circle r="88" fill="url(#orbBlue)"/>
      <ellipse rx="112" ry="26" fill="none" stroke="url(#gold)" stroke-width="7" transform="rotate(-22)"/>
      <ellipse rx="96" ry="96" fill="none" stroke="url(#gold)" stroke-width="3" transform="rotate(14) scale(1 .98)"/>
      <path d="M-88 0a88 88 0 00176 0" fill="none" stroke="#fff6df" stroke-opacity=".35"/>
      <path d="M0-88a40 88 0 000 176a40 88 0 000-176" fill="none" stroke="#fff6df" stroke-opacity=".35"/>
      ${stars(rng(77), 34, 150, 150, "#fff").replace(/cx="/g, 'transform="translate(-75 -75)" cx="')}
      ${sparkle(0, 0, 1.6, "#fff6df")}
      <path d="M-50 112h100l-18 26h-64z" fill="url(#gold)"/><rect x="-64" y="136" width="128" height="14" rx="5" fill="url(#gold)"/>
    </g>`,
  lastone_key: (p) => `
    <g transform="translate(150 205) rotate(-30)">
      <circle r="120" fill="url(#halo)"/>
      <circle cx="0" cy="-70" r="50" fill="none" stroke="url(#gold)" stroke-width="14"/>
      <path d="M0-120l10 30h30l-24 18l9 30l-25-18l-25 18l9-30l-24-18h30z" fill="url(#gold)" transform="translate(0 50) scale(.55)"/>
      ${gem(0, -70, 14, "#84d8f1")}
      <rect x="-8" y="-20" width="16" height="170" rx="6" fill="url(#gold)"/>
      <path d="M8 96h34v14h-20v12h16v14h-30z" fill="url(#gold)"/>
      <path d="M-30-14h60l-6 10h-48z" fill="url(#gold)"/>
      ${sparkle(50, -120, 0.9, "#fff")}${sparkle(-60, 30, 0.6, "#fff6df")}
    </g>`,
};

function gem(x, y, s, color) {
  return `<g transform="translate(${x} ${y})"><path d="M0 ${-s}L${s * 0.9} ${-s * 0.3}L${s * 0.55} ${s}H${-s * 0.55}L${-s * 0.9} ${-s * 0.3}z" fill="${color}"/><path d="M0 ${-s}L${s * 0.9} ${-s * 0.3}L0 ${-s * 0.1}z" fill="#fff" opacity=".55"/><path d="M${-s * 0.9} ${-s * 0.3}L0 ${-s * 0.1}L${-s * 0.55} ${s}z" fill="#000" opacity=".18"/></g>`;
}

function crystal(p) {
  return `
    <g transform="translate(150 220)">
      <ellipse cx="0" cy="96" rx="78" ry="12" fill="#000" opacity=".35"/>
      <path d="M0-140L52-60L44 70L0 100L-44 70L-52-60z" fill="url(#crystal)" stroke="${p.glow}" stroke-opacity=".8" stroke-width="2"/>
      <path d="M0-140L52-60L0-30z" fill="#fff" opacity=".35"/><path d="M0-140L-52-60L0-30z" fill="#fff" opacity=".12"/>
      <path d="M-52-60L0-30L-44 70z" fill="#000" opacity=".12"/><path d="M0-30L0 100" stroke="#fff" stroke-opacity=".25"/>
      <path d="M-40 10c20-26 60-30 80-10" stroke="#9cf3c9" stroke-width="10" stroke-opacity=".45" fill="none" filter="url(#blur)"/>
      <path d="M-44 40c26-22 64-18 88 0" stroke="#e2a8ff" stroke-width="8" stroke-opacity=".45" fill="none" filter="url(#blur)"/>
      <path d="M-70 40L-92-10L-74 76z" fill="url(#crystal)" opacity=".85"/><path d="M70 50L96 0L78 84z" fill="url(#crystal)" opacity=".85"/>
      ${sparkle(20, -90, 0.8, "#fff")}${sparkle(-24, -20, 0.5, "#fff")}
    </g>`;
}

const PRIZES = {
  stardust: "N", moonleaf: "N", candle: "N", feather: "N",
  aurora: "R", compass: "R", music: "R",
  amethyst: "SR", hourglass: "SR",
  crown: "SSR", dragon: "SSR", lastone_orb: "SSR", lastone_key: "SSR",
};

for (const [key, rarity] of Object.entries(PRIZES)) {
  const p = PALETTE[rarity];
  const rand = rng(key.split("").reduce((a, c) => a + c.charCodeAt(0) * 31, 7));
  const rays = rarity === "SSR" || rarity === "SR"
    ? `<g transform="translate(150 210)" opacity=".35">${Array.from({ length: 16 }, (_, i) => `<path d="M0 0L${(Math.cos((i * Math.PI) / 8 - 0.05) * 260).toFixed(1)} ${(Math.sin((i * Math.PI) / 8 - 0.05) * 260).toFixed(1)}L${(Math.cos((i * Math.PI) / 8 + 0.05) * 260).toFixed(1)} ${(Math.sin((i * Math.PI) / 8 + 0.05) * 260).toFixed(1)}z" fill="${p.glow}"/>`).join("")}</g>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
<defs>${GOLD}${SILVER}
<radialGradient id="bg" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></radialGradient>
<radialGradient id="halo"><stop offset="0" stop-color="${p.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
<radialGradient id="spot" cx=".5" cy=".52" r=".45"><stop offset="0" stop-color="${p.glow}" stop-opacity=".4"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset=".5" stop-color="${p.accent}" stop-opacity=".18"/><stop offset="1" stop-color="#ffffff" stop-opacity=".08"/></linearGradient>
<linearGradient id="crystal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9fbff"/><stop offset=".4" stop-color="#84d8f1"/><stop offset=".75" stop-color="#7654c8"/><stop offset="1" stop-color="#2a1f62"/></linearGradient>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2360"/><stop offset="1" stop-color="#151036"/></linearGradient>
<linearGradient id="wax" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d8cdf2"/><stop offset=".5" stop-color="#f7f4ff"/><stop offset="1" stop-color="#b9a9e2"/></linearGradient>
<radialGradient id="flameGlow"><stop offset="0" stop-color="#ffe9b0" stop-opacity=".8"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<linearGradient id="flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c9"/><stop offset=".6" stop-color="#ffb347"/><stop offset="1" stop-color="#ff7a45"/></linearGradient>
<linearGradient id="featherG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e3e8f5"/><stop offset="1" stop-color="#a9b3cc"/></linearGradient>
<radialGradient id="orb" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#fff6d0"/><stop offset=".4" stop-color="#f0b443"/><stop offset=".85" stop-color="#a24f0c"/><stop offset="1" stop-color="#5a2405"/></radialGradient>
<radialGradient id="orbBlue" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#5f7bd8"/><stop offset=".6" stop-color="#1e2a6b"/><stop offset="1" stop-color="#0a0f2e"/></radialGradient>
<filter id="blur"><feGaussianBlur stdDeviation="4"/></filter>
<clipPath id="card"><rect width="300" height="400" rx="16"/></clipPath>
</defs>
<g clip-path="url(#card)">
<rect width="300" height="400" fill="url(#bg)"/>
${rays}
<rect width="300" height="400" fill="url(#spot)"/>
${stars(rand, 46, 300, 400, "#fff")}
<circle cx="150" cy="210" r="128" fill="none" stroke="${p.accent}" stroke-opacity=".25" stroke-dasharray="2 6"/>
${MOTIFS[key](p)}
<rect x="10" y="10" width="280" height="380" rx="14" fill="none" stroke="${p.accent}" stroke-opacity=".35"/>
</g>
</svg>`;
  writeFileSync(join(root, "prizes", `${key}.svg`), svg.replace(/\n\s+/g, "\n"));
}

// バナー（1200×600）
const BANNERS = {
  starlight: { c1: "#2b1f66", c2: "#080d20", accent: "#a785f2", glow: "#d6c3ff" },
  moonlit: { c1: "#4a3818", c2: "#0b0f26", accent: "#e3c37f", glow: "#fff1c9" },
  aurora: { c1: "#0f4a5c", c2: "#0a0f26", accent: "#84d8f1", glow: "#b5e8f7" },
};
for (const [key, b] of Object.entries(BANNERS)) {
  const rand = rng(key.length * 991);
  const extra =
    key === "moonlit"
      ? `<circle cx="880" cy="190" r="110" fill="#fff6df"/><circle cx="925" cy="165" r="100" fill="${b.c2}" opacity=".92"/>`
      : key === "aurora"
        ? `<path d="M0 260C200 120 400 320 600 200S1000 80 1200 220" stroke="#7cf3c2" stroke-width="80" stroke-opacity=".22" fill="none" filter="url(#b)"/><path d="M0 320C260 200 460 360 700 240S1040 160 1200 280" stroke="#d29bff" stroke-width="60" stroke-opacity=".2" fill="none" filter="url(#b)"/>`
        : `<g transform="translate(900 260)">${Array.from({ length: 3 }, (_, i) => `<circle r="${120 + i * 50}" fill="none" stroke="${b.accent}" stroke-opacity="${0.4 - i * 0.1}" stroke-dasharray="${4 + i * 3} ${8 + i * 4}"/>`).join("")}</g>`;
  const palace = `<g fill="#060918" opacity=".95">
<path d="M0 600V470h80v-40h40v40h60V400l40-60l40 60v70h60v-30h50v30h70V380l30-70l30 70v90h60V360l50-110l50 110v110h70v-40h40v40h60V400l40-60l40 60v70h60v-30h50v30h80V380l30-60l30 60v220z"/>
</g>
<g fill="${b.glow}" opacity=".7">${Array.from({ length: 22 }, () => `<rect x="${(rand() * 1150 + 20).toFixed(0)}" y="${(480 + rand() * 90).toFixed(0)}" width="5" height="9" rx="2"/>`).join("")}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600">
<defs><radialGradient id="g" cx=".7" cy=".3" r=".9"><stop offset="0" stop-color="${b.c1}"/><stop offset="1" stop-color="${b.c2}"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="30"/></filter></defs>
<rect width="1200" height="600" fill="url(#g)"/>
${stars(rand, 220, 1200, 520, "#fff")}
${Array.from({ length: 9 }, () => sparkle((rand() * 1200).toFixed(0), (rand() * 420).toFixed(0), (0.4 + rand() * 0.9).toFixed(2), b.glow, 0.85)).join("")}
${extra}
${palace}
</svg>`;
  writeFileSync(join(root, "banners", `${key}.svg`), svg);
}

writeFileSync(
  join(root, "..", "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6df"/><stop offset=".5" stop-color="#d8b976"/><stop offset="1" stop-color="#8f6d2e"/></linearGradient></defs><rect width="40" height="40" rx="9" fill="#080D20"/><path d="M20 5l3.2 11.8L35 20l-11.8 3.2L20 35l-3.2-11.8L5 20l11.8-3.2z" fill="url(#g)"/></svg>`,
);
console.log("art generated");
