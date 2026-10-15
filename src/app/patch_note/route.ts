import { readFileSync } from "node:fs";
import path from "node:path";
import showdown from "showdown";

// 레거시 /patch_note: readme.md 를 showdown 으로 변환해 그대로 내려준다 (같은 변환기라 결과 HTML 동일).
const converter = new showdown.Converter();
const html =
  '<meta charset="UTF-8"><style> * { font-weight: normal; margin-block: 0.3em; }</style>' +
  converter.makeHtml(readFileSync(path.resolve(process.cwd(), "legacy/patch_note.md"), "utf8"));

export const dynamic = "force-static";

export function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html", "Cache-Control": "public, max-age=3600" } });
}
