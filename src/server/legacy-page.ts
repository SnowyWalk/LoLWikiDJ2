import { readFileSync } from "node:fs";
import path from "node:path";

// 레거시 dj.html 을 그대로 내려주는 단계(P3)의 페이지 렌더러.
// 화면을 1px도 바꾸지 않기 위해 레거시 마크업·CSS·스크립트를 그대로 쓰고,
// 포트 대신 채널 번호만 넣는다. React 컴포넌트 전환(P4)의 시각 비교 기준이 된다.

const TEMPLATE_PATH = path.resolve(process.cwd(), "legacy/dj.html");

// 정적 파일 캐시 무효화용 버전. 레거시는 파일 수정 시각을 썼다.
const ASSET_VERSION = (process.env.APP_VERSION || Date.now().toString(36)).slice(0, 12);

let template: string | null = null;

function loadTemplate(): string {
  // 개발 중에는 매번 읽어 수정이 바로 보이게 한다.
  if (template && process.env.NODE_ENV === "production") return template;
  template = readFileSync(TEMPLATE_PATH, "utf8");
  return template;
}

export function renderLegacyPage(channel: string): Response {
  const html = loadTemplate()
    .replace(/\$_channel/g, channel)
    .replace(/\$_version/g, ASSET_VERSION);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
