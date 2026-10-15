/**
 * 레거시(운영 중인 lolwiki.xyz)와 새 사이트를 같은 조건으로 띄워 픽셀 단위로 비교한다.
 *
 *   npx tsx tests/visual/compare.ts [--legacy=https://lolwiki.xyz] [--next=https://dj2.snowywalk.me] [--out=tests/visual/out]
 *
 * - Math.random / Date 를 고정해 랜덤 배경 애니메이션 등도 같은 위치에 그려지게 한다.
 * - 폰트 로딩·네트워크 안정 후 캡처한다.
 * - 화면 크기 여러 개 × 시나리오별로 diff 픽셀 수를 출력하고, 다르면 diff 이미지를 남긴다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const LEGACY = arg("legacy", "https://lolwiki.xyz");
const NEXT = arg("next", "https://dj2.snowywalk.me");
const OUT = path.resolve(arg("out", "tests/visual/out"));

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 2560, height: 1440 },
];

// 페이지 스크립트보다 먼저 실행: 랜덤·시간 고정
const DETERMINISM = `
(() => {
  let seed = 123456789;
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const fixed = new Date('2026-10-16T12:00:00+09:00').getTime();
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
    static now() { return fixed; }
  }
  window.Date = FixedDate;
  try { localStorage.clear(); } catch {}
})();
`;

interface Scenario {
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
}

const SCENARIOS: Scenario[] = [{ name: "login", path: "/" }];

async function capture(url: string, viewport: { width: number; height: number }, scenario: Scenario) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "ko-KR" });
    await context.addInitScript(DETERMINISM);
    const page = await context.newPage();
    await page.goto(url + scenario.path, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.fonts.ready);
    if (scenario.prepare) await scenario.prepare(page);
    await page.waitForTimeout(1500);
    return await page.screenshot({ animations: "disabled", caret: "hide" });
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let failed = 0;
  for (const scenario of SCENARIOS) {
    for (const viewport of VIEWPORTS) {
      const tag = `${scenario.name}-${viewport.width}x${viewport.height}`;
      const [a, b] = await Promise.all([capture(LEGACY, viewport, scenario), capture(NEXT, viewport, scenario)]);
      const imgA = PNG.sync.read(a);
      const imgB = PNG.sync.read(b);
      const diff = new PNG({ width: imgA.width, height: imgA.height });
      const count = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, { threshold: 0 });
      const ratio = ((count / (imgA.width * imgA.height)) * 100).toFixed(4);
      console.log(`${count === 0 ? "✓" : "✗"} ${tag}: 다른 픽셀 ${count} (${ratio}%)`);
      if (count > 0) {
        failed++;
        writeFileSync(path.join(OUT, `${tag}-legacy.png`), a);
        writeFileSync(path.join(OUT, `${tag}-next.png`), b);
        writeFileSync(path.join(OUT, `${tag}-diff.png`), PNG.sync.write(diff));
      }
    }
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
