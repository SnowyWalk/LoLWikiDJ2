// DATA_DIR 에 쌓이는 사용자 파일(아이콘, 채팅 이미지, TTS)을 직접 내려준다.
// 레거시 경로를 그대로 쓴다: /icon/{id}.png, /static/images/{file}, /tts/{hash}
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ICON_DIR } from "./icons";
import { IMAGE_DIR } from "./legacy/handlers";
import { TTS_DIR } from "./services/tts";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const ROUTES: { prefix: string; dir: string; type?: string }[] = [
  { prefix: "/icon/", dir: ICON_DIR },
  { prefix: "/static/images/", dir: IMAGE_DIR },
  // TTS 파일은 확장자 없이 "{날짜 시간 랜덤}" 이름 (레거시 그대로)
  { prefix: "/tts/", dir: TTS_DIR, type: "audio/mpeg" },
];

/** 처리했으면 true. 파일명이 바뀌거나(?ver=) 내용이 바뀌지 않는 파일이라 길게 캐시한다. */
export async function serveDataFile(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url ?? "/", "http://x");
  const route = ROUTES.find((r) => url.pathname.startsWith(r.prefix));
  if (!route) return false;

  const name = decodeURIComponent(url.pathname.slice(route.prefix.length));
  if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    res.writeHead(404).end();
    return true;
  }
  const file = path.join(route.dir, name);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    const etag = `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag }).end();
      return true;
    }
    res.writeHead(200, {
      "Content-Type": route.type ?? TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Cache-Control": "no-store" }).end();
  }
  return true;
}
