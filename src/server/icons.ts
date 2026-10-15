// 유저 아이콘: {DATA_DIR}/icon/{icon_id}.png
// 새 유저 기본 아이콘은 레거시와 같은 identicon 알고리즘(Don Park, MIT)으로 그린다.
// 레거시: identicon.generate({ id: nick + '7', size: 39 })
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { env } from "./config";

export const ICON_DIR = path.resolve(env.DATA_DIR, "icon");

const patchTypes = [
  [0, 4, 24, 20], [0, 4, 20], [2, 24, 20], [0, 2, 20, 22], [2, 14, 22, 10], [0, 14, 24, 22],
  [2, 24, 22, 13, 11, 22, 20], [0, 14, 22], [6, 8, 18, 16], [4, 20, 10, 12, 2], [0, 2, 12, 10],
  [10, 14, 22], [20, 12, 24], [10, 2, 12], [0, 2, 10], [0, 4, 24, 20],
];
const centerPatchTypes = [0, 4, 8, 15];

function renderPatch(ctx: SKRSContext2D, x: number, y: number, size: number, patch: number, turn: number, invert: boolean, fore: string, back: string) {
  patch %= patchTypes.length;
  turn %= 4;
  if (patch === 15) invert = !invert;
  const vertices = patchTypes[patch];
  const offset = size / 2;
  const scale = size / 4;
  ctx.save();
  ctx.fillStyle = invert ? fore : back;
  ctx.fillRect(x, y, size, size);
  ctx.translate(x + offset, y + offset);
  ctx.rotate((turn * Math.PI) / 2);
  ctx.beginPath();
  ctx.moveTo((vertices[0] % 5) * scale - offset, Math.floor(vertices[0] / 5) * scale - offset);
  for (let i = 1; i < vertices.length; i++) ctx.lineTo((vertices[i] % 5) * scale - offset, Math.floor(vertices[i] / 5) * scale - offset);
  ctx.closePath();
  ctx.fillStyle = invert ? back : fore;
  ctx.fill();
  ctx.restore();
}

export function renderIdenticon(id: string, size = 39): Buffer {
  const hash = createHash("sha1").update(Buffer.from(id, "utf8")).digest();
  const code = (hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3];
  const patchSize = size / 3;
  const middleType = centerPatchTypes[code & 3];
  const middleInvert = ((code >> 2) & 1) !== 0;
  const cornerType = (code >> 3) & 15;
  const cornerInvert = ((code >> 7) & 1) !== 0;
  let cornerTurn = (code >> 8) & 3;
  const sideType = (code >> 10) & 15;
  const sideInvert = ((code >> 14) & 1) !== 0;
  let sideTurn = (code >> 15) & 3;
  const blue = (code >> 16) & 31;
  const green = (code >> 21) & 31;
  const red = (code >> 27) & 31;
  const fore = `rgb(${red << 3},${green << 3},${blue << 3})`;
  const back = "rgb(255,255,255)";

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  renderPatch(ctx, patchSize, patchSize, patchSize, middleType, 0, middleInvert, fore, back);
  renderPatch(ctx, patchSize, 0, patchSize, sideType, sideTurn++, sideInvert, fore, back);
  renderPatch(ctx, patchSize * 2, patchSize, patchSize, sideType, sideTurn++, sideInvert, fore, back);
  renderPatch(ctx, patchSize, patchSize * 2, patchSize, sideType, sideTurn++, sideInvert, fore, back);
  renderPatch(ctx, 0, patchSize, patchSize, sideType, sideTurn++, sideInvert, fore, back);
  renderPatch(ctx, 0, 0, patchSize, cornerType, cornerTurn++, cornerInvert, fore, back);
  renderPatch(ctx, patchSize * 2, 0, patchSize, cornerType, cornerTurn++, cornerInvert, fore, back);
  renderPatch(ctx, patchSize * 2, patchSize * 2, patchSize, cornerType, cornerTurn++, cornerInvert, fore, back);
  renderPatch(ctx, 0, patchSize * 2, patchSize, cornerType, cornerTurn++, cornerInvert, fore, back);
  return canvas.toBuffer("image/png");
}

export function iconPath(iconId: number): string {
  return path.join(ICON_DIR, `${iconId}.png`);
}

export async function writeIcon(iconId: number, data: Buffer): Promise<void> {
  await mkdir(ICON_DIR, { recursive: true });
  await writeFile(iconPath(iconId), data);
}

/** 아이콘 파일이 없으면(신규 유저, 또는 아직 옛 서버에서 아이콘 파일을 옮기기 전) 기본 아이콘을 만든다. */
export async function ensureIcon(iconId: number, nick: string): Promise<void> {
  if (existsSync(iconPath(iconId))) return;
  await writeIcon(iconId, renderIdenticon(`${nick}7`));
}
