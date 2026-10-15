// 롤백 이미지 중계 (/lolwiki_mirror?uri=...) + 디스크 캐시.
//
// 레거시는 요청마다 원본을 다시 받아 Content-Type·캐시 헤더 없이 내려보냈다(트래픽 비용의 주원인).
// 이제는:
//   - 원본은 URL 당 한 번만 받는다 (디스크 캐시, 동시 요청은 하나로 합침)
//   - 브라우저가 1년(불변 URL) / 1일 동안 다시 요청하지 않도록 캐시 헤더를 붙인다
//   - 사설망 주소·이미지가 아닌 응답·너무 큰 파일은 거부한다 (오픈 프록시/SSRF 방지)
//   - 다른 사이트에서 이 서버를 이미지 프록시로 쓰지 못하게 Referer 를 확인한다
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import { env } from "../config";
import { logger } from "../logger";

const CACHE_DIR = path.resolve(env.DATA_DIR, "cache", "lolwiki");
const MAX_BYTES = 15 * 1024 * 1024;
const CACHE_LIMIT_BYTES = 3 * 1024 * 1024 * 1024;
const FALLBACK = path.resolve(process.cwd(), "public/static/xbox.jpg");

interface Meta {
  url: string;
  contentType: string;
  size: number;
  fetchedAt: number;
}

const inflight = new Map<string, Promise<Meta>>();

function keyOf(url: string) {
  return createHash("sha256").update(url).digest("hex");
}
function filesOf(key: string) {
  const dir = path.join(CACHE_DIR, key.slice(0, 2));
  return { dir, data: path.join(dir, `${key}.bin`), meta: path.join(dir, `${key}.json`) };
}

/** 내용이 바뀌지 않는 URL (롤백 이미지 서버 /i/{id}/..., imgur) 은 1년 불변 캐시 */
function isImmutable(url: URL) {
  return (url.hostname === "img.lolwiki.kr" && url.pathname.startsWith("/i/")) || url.hostname.endsWith("imgur.com");
}

function isPrivateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function assertPublicHost(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("http(s) 만 허용");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new Error("사설망 주소");
}

async function fetchOrigin(url: URL, key: string): Promise<Meta> {
  // 리다이렉트도 한 단계씩 확인한다 (예: resize → http://i.imgur.com/...)
  let current = url;
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicHost(current);
    res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "LoLWikiDJ-image-cache" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current);
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new Error(`원본 응답 ${res?.status}`);
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) throw new Error(`이미지가 아님: ${contentType}`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("너무 큼");
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > MAX_BYTES) throw new Error("너무 큼");

  const files = filesOf(key);
  await mkdir(files.dir, { recursive: true });
  const meta: Meta = { url: url.toString(), contentType, size: body.length, fetchedAt: Date.now() };
  // 쓰는 도중 다른 요청이 반쯤 쓴 파일을 읽지 않도록 임시 파일에 쓰고 이름을 바꾼다
  await writeFile(`${files.data}.tmp`, body);
  await rename(`${files.data}.tmp`, files.data);
  await writeFile(files.meta, JSON.stringify(meta));
  return meta;
}

async function cached(key: string): Promise<Meta | null> {
  try {
    const files = filesOf(key);
    const meta = JSON.parse(await readFile(files.meta, "utf8")) as Meta;
    await stat(files.data);
    const now = new Date();
    void utimes(files.data, now, now).catch(() => {}); // LRU 정리용 최근 사용 시각
    return meta;
  } catch {
    return null;
  }
}

function refererAllowed(req: IncomingMessage) {
  const referer = req.headers.referer;
  if (!referer) return true; // 일부 브라우저 설정은 Referer 를 보내지 않는다
  try {
    return new URL(referer).host === req.headers.host;
  } catch {
    return false;
  }
}

async function sendFallback(res: ServerResponse) {
  try {
    const data = await readFile(FALLBACK);
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" }).end(data);
  } catch {
    res.writeHead(404, { "Cache-Control": "no-store" }).end();
  }
}

/** /lolwiki_mirror?uri=... (레거시는 /lolwiki_mirror/* 도 같은 동작) */
export async function serveLolwikiMirror(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const reqUrl = new URL(req.url ?? "/", "http://x");
  if (reqUrl.pathname !== "/lolwiki_mirror" && !reqUrl.pathname.startsWith("/lolwiki_mirror/")) return false;
  const raw = reqUrl.searchParams.get("uri");
  if (!raw) {
    res.writeHead(400).end();
    return true;
  }
  if (!refererAllowed(req)) {
    res.writeHead(403, { "Cache-Control": "no-store" }).end();
    return true;
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    await sendFallback(res);
    return true;
  }
  const key = keyOf(target.toString());

  try {
    let meta = await cached(key);
    if (!meta) {
      let pending = inflight.get(key);
      if (!pending) {
        pending = fetchOrigin(target, key).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      meta = await pending;
    }
    const etag = `"${key.slice(0, 32)}"`;
    const headers = {
      "Content-Type": meta.contentType,
      "Cache-Control": isImmutable(target) ? "public, max-age=31536000, immutable" : "public, max-age=86400",
      ETag: etag,
    };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers).end();
      return true;
    }
    res.writeHead(200, { ...headers, "Content-Length": meta.size });
    createReadStream(filesOf(key).data).pipe(res);
  } catch (error) {
    logger.warn({ err: error, url: target.toString() }, "lolwiki_mirror 실패");
    await sendFallback(res);
  }
  return true;
}

/** 캐시가 상한을 넘으면 오래 안 쓴 파일부터 지운다 (1시간마다). */
export function startMirrorCacheJanitor() {
  const run = async () => {
    try {
      const entries: { file: string; size: number; atime: number }[] = [];
      for (const sub of await readdir(CACHE_DIR).catch(() => [] as string[])) {
        for (const name of await readdir(path.join(CACHE_DIR, sub)).catch(() => [] as string[])) {
          if (!name.endsWith(".bin")) continue;
          const file = path.join(CACHE_DIR, sub, name);
          const info = await stat(file).catch(() => null);
          if (info) entries.push({ file, size: info.size, atime: info.mtimeMs });
        }
      }
      let total = entries.reduce((s, e) => s + e.size, 0);
      if (total <= CACHE_LIMIT_BYTES) return;
      entries.sort((a, b) => a.atime - b.atime);
      for (const e of entries) {
        if (total <= CACHE_LIMIT_BYTES * 0.9) break;
        await rm(e.file, { force: true });
        await rm(e.file.replace(/\.bin$/, ".json"), { force: true });
        total -= e.size;
      }
      logger.info({ total }, "lolwiki_mirror 캐시 정리");
    } catch (error) {
      logger.warn({ err: error }, "lolwiki_mirror 캐시 정리 실패");
    }
  };
  setInterval(() => void run(), 60 * 60 * 1000).unref();
}
