// Lucide 아이콘(lucide-static)을 테마별 색을 입힌 SVG 파일로 만든다.
//   node scripts/build-icons.mjs  →  public/static/icons/{light,dark}/*.svg
// CSS 배경 이미지로 쓰므로 currentColor 대신 테마별 색을 직접 넣는다. (site-modern.css 에서 사용)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC = "node_modules/lucide-static/icons";
const OUT = "public/static/icons";

const THEMES = {
  light: { base: "#1f2937", muted: "#64748b", accent: "#2563eb" },
  dark: { base: "#e2e8f0", muted: "#94a3b8", accent: "#7aa2ff" },
};

// 파일명: [lucide 아이콘, 색 종류 또는 직접 색, 채움 여부]
const ICONS = {
  "tab-chat": ["message-circle", "base"],
  "tab-users": ["users", "base"],
  "tab-recent": ["history", "base"],
  "tab-option": ["ellipsis", "base"],
  volume: ["volume-2", "base"],
  "volume-x": ["volume-x", "base"],
  "mute-once": ["volume-off", "muted"],
  good: ["heart", "#ef4444", true],
  bad: ["thumbs-down", "#3b82f6", true],
  search: ["search", "muted"],
  close: ["x", "muted"],
  playing: ["play", "#ef4444", true],
  shuffle: ["shuffle", "base"],
  plus: ["plus", "base"],
  pencil: ["pencil", "base"],
  trash: ["trash-2", "muted"],
  "sort-up": ["chevron-up", "muted"],
  "sort-top": ["chevrons-up", "muted"],
  "sort-down": ["chevron-down", "muted"],
  "sort-bottom": ["chevrons-down", "muted"],
  "play-now": ["circle-play", "accent"],
  resize: ["move-diagonal-2", "muted"],
  profile: ["user-round", "base"],
  refresh: ["rotate-cw", "base"],
  write: ["square-pen", "base"],
  memo: ["sticky-note", "muted"],
  "memo-edit": ["pencil", "muted"],
  star: ["star", "muted"],
  "star-full": ["star", "#f5b301", true],
  "image-add": ["image-plus", "muted"],
  "search-white": ["search", "#ffffff"],
};

for (const [theme, colors] of Object.entries(THEMES)) {
  mkdirSync(path.join(OUT, theme), { recursive: true });
  for (const [name, [icon, color, filled]] of Object.entries(ICONS)) {
    const value = colors[color] ?? color;
    let svg = readFileSync(path.join(SRC, `${icon}.svg`), "utf8")
      .replace(/<!--.*?-->\s*/s, "")
      .replace(/\s*class="[^"]*"/, "")
      .replace(/stroke="currentColor"/, `stroke="${value}"`)
      .replace(/stroke-width="2"/, `stroke-width="1.9"`);
    if (filled) svg = svg.replace(/fill="none"/, `fill="${value}"`);
    writeFileSync(path.join(OUT, theme, `${name}.svg`), svg.replace(/\n\s*/g, " ").trim() + "\n");
  }
}
console.log(`아이콘 ${Object.keys(ICONS).length}개 × ${Object.keys(THEMES).length}테마 생성`);
