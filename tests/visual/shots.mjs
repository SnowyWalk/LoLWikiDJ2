// 디자인 작업용 화면 캡처: 로그인 → 메인(밝은/다크) → 재생목록 패널 → 롤백 게시판
//   node tests/visual/shots.mjs http://localhost:3123 <저장 폴더> [접두어]
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3123";
const OUT = process.argv[3] ?? ".";
const TAG = process.argv[4] ?? "now";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
await p.goto(`${BASE}/3131`, { waitUntil: "domcontentloaded" });
await p.waitForSelector("#login_button", { state: "visible" });
await p.fill("#login_id", "디자인확인");
await p.click("#login_button");
await p.waitForTimeout(2500);
for (const t of ["안녕하세요", "디자인 바뀐 거 어때요?"]) {
  await p.fill("#chat_input", t);
  await p.press("#chat_input", "Enter");
  await p.waitForTimeout(300);
}
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/${TAG}-main-light.png` });
await p.evaluate(`set_theme('dark')`);
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/${TAG}-main-dark.png` });
await p.evaluate(`set_theme('default')`);
await p.evaluate(`toggle_playlist_control_panel()`);
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/${TAG}-playlist.png` });
await p.evaluate(`toggle_playlist_control_panel()`);
await p.waitForTimeout(400);
// 롤백 게시판 열기: 왼쪽 아래 재생목록 상자를 우클릭
await p.click("#current_playlist_info_box", { button: "right" });
await p.waitForTimeout(5000);
await p.screenshot({ path: `${OUT}/${TAG}-lolwiki.png` });
// 첫 글 열기
await p.evaluate(`(() => { const e = document.querySelector('.lol_article_list_item'); if (e) e.click() })()`);
await p.waitForTimeout(4000);
await p.screenshot({ path: `${OUT}/${TAG}-lolwiki-detail.png` });
await b.close();
