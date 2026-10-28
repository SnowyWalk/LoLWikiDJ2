// 재연결 시나리오: 서버 종료·재시작, 같은 닉네임 다른 창 접속
//   DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_NAME=... node tests/e2e/reconnect.mjs [캡처 저장 폴더]
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = 3124;
const BASE = `http://localhost:${PORT}`;
const OUT = process.argv[2] ?? ".";
let server = null;

async function startServer() {
  server = spawn(process.execPath, ["dist/server.js"], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("서버가 뜨지 않음");
}
function stopServer() {
  server?.kill("SIGKILL");
  server = null;
}
const chatText = (p) => p.evaluate(`document.getElementById("chat").innerText`);
async function waitForChat(p, text, timeout = 30000) {
  await p.waitForFunction(`document.getElementById("chat").innerText.includes(${JSON.stringify(text)})`, null, { timeout, polling: 200 });
}
async function say(p, text) {
  await p.fill("#chat_input", text);
  await p.press("#chat_input", "Enter");
}
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

await startServer();
const b = await chromium.launch();
try {
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await p.goto(`${BASE}/7171`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#login_button", { state: "visible" });
  await p.fill("#login_id", "재연결테스트");
  await p.click("#login_button");
  await waitForChat(p, "접속하였습니다");
  await say(p, "끊기기 전 메시지");
  await waitForChat(p, "끊기기 전 메시지");

  // 1. 서버 종료
  stopServer();
  await waitForChat(p, "재연결 중입니다", 15000);
  check("서버가 꺼지면 '재연결 중' 메시지", true);
  await say(p, "끊긴 동안 보낸 메시지");
  await waitForChat(p, "메시지를 보내지 못했습니다", 5000);
  const kept = await p.inputValue("#chat_input");
  check("끊긴 동안 보낸 채팅은 막고 입력 내용 유지", kept === "끊긴 동안 보낸 메시지", `입력창: "${kept}"`);
  await new Promise((r) => setTimeout(r, 3000));
  const attempt = (await chatText(p)).match(/\((\d+)번째 시도\)/);
  check("재연결 시도 횟수 표시", Boolean(attempt), attempt ? attempt[0] : "없음");

  // 2. 서버 재시작 → 자동 재로그인
  await startServer();
  await waitForChat(p, "다시 연결되었습니다", 30000);
  check("서버가 돌아오면 '다시 연결되었습니다' (새로고침 없이)", true);
  await p.fill("#chat_input", "");
  await say(p, "재연결 후 메시지");
  await waitForChat(p, "재연결 후 메시지");
  await new Promise((r) => setTimeout(r, 800));
  const pending = await p.evaluate(`document.querySelectorAll("#chat [pending]").length`);
  check("재연결 후 채팅이 서버 확인까지 정상", pending === 0, `확인 대기 ${pending}개`);
  const users = await p.evaluate(`document.getElementById("user_count").textContent`);
  check("참가자 수 복구", users === "1", `참가자 ${users}`);
  await p.locator("#mainchat").screenshot({ path: `${OUT}/reconnect-chat.png` });

  // 3. 같은 닉네임으로 다른 창에서 접속 → 기존 창은 이유를 알리고 재연결하지 않음
  const p2 = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await p2.goto(`${BASE}/7171`, { waitUntil: "domcontentloaded" });
  await p2.waitForSelector("#login_button", { state: "visible" });
  p2.on("dialog", (d) => d.accept());
  await p2.fill("#login_id", "재연결테스트");
  await p2.click("#login_button");
  await waitForChat(p, "다른 곳에서 접속해", 15000);
  await new Promise((r) => setTimeout(r, 4000));
  const text = await chatText(p);
  check("다른 창 접속 시 기존 창은 이유 안내, 재연결 안 함", !/재연결 중입니다/.test(text.split("다른 곳에서 접속해")[1] ?? ""));
} catch (error) {
  check("시나리오 진행", false, String(error).slice(0, 200));
} finally {
  await b.close();
  stopServer();
}
process.exitCode = results.every(Boolean) ? 0 : 1;
