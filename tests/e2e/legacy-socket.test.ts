/**
 * 레거시 화면이 보내는 소켓 이벤트로 새 서버를 검증한다.
 *   TEST_URL=http://localhost:3123 npx tsx --test tests/e2e/legacy-socket.test.ts
 * (빈 DB 로 띄운 서버 대상. 테스트 유저/재생목록을 만든다)
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { io, type Socket } from "socket.io-client";

const URL_ = process.env.TEST_URL ?? "http://localhost:3123";
const suffix = Date.now().toString(36);

function connect(channel: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(URL_, { transports: ["websocket"], query: { channel }, forceNew: true });
    s.once("connect", () => resolve(s));
    s.once("connect_error", reject);
  });
}
function next<T = unknown>(s: Socket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${event}`)), timeout);
    s.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}
async function login(s: Socket, nick: string) {
  const check = next<boolean>(s, "check_user");
  s.emit("check_user", nick);
  assert.equal(await check, false);
  const ok = next<boolean>(s, "login");
  const playlist = next<[Record<string, unknown>, { Id: number; Name: string; VideoList: number[] }[], number, number]>(s, "update_playlist");
  s.emit("login", nick);
  assert.equal(await ok, true);
  return playlist;
}

let a: Socket;
let b: Socket;
const nickA = `테스트A_${suffix}`;
const nickB = `테스트B_${suffix}`;

before(async () => {
  a = await connect("4242");
  b = await connect("4242");
});
after(() => {
  a?.close();
  b?.close();
});

test("로그인하면 기본 재생목록이 만들어지고 현재 재생목록으로 선택된다", async () => {
  const [videos, lists, current] = await login(a, nickA);
  assert.deepEqual(videos, {});
  assert.equal(lists.length, 1);
  assert.equal(lists[0].Name, `${nickA}의 재생목록`);
  assert.equal(current, lists[0].Id);
});

test("접속 알림·참가자 목록이 같은 채널에 퍼진다", async () => {
  await login(b, nickB);
  const users = next<{ nick: string; icon_id: number }[]>(a, "users");
  const joined = next<{ type: string; message: string }>(a, "chat_update");
  b.emit("chat_newUser");
  assert.match((await joined).message, new RegExp(nickB));
  const list = await users;
  assert.deepEqual(list.map((u) => u.nick).sort(), [nickA, nickB].sort());
  assert.ok(list.every((u) => u.icon_id > 0));
});

test("아이콘 파일이 제공된다", async () => {
  const users = next<{ nick: string; icon_id: number; icon_ver: number }[]>(a, "users");
  a.emit("users");
  const me = (await users).find((u) => u.nick === nickA)!;
  const res = await fetch(`${URL_}/icon/${me.icon_id}.png?ver=${me.icon_ver}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("채팅이 이름·시간·아이콘과 함께 전달된다", async () => {
  const got = next<Record<string, unknown>>(b, "chat_update");
  a.emit("chat_message", { type: "message", message: "안녕", tts_hash: "" });
  const msg = await got;
  assert.equal(msg.message, "안녕");
  assert.equal(msg.name, nickA);
  assert.match(String(msg.time), /^\d{2}:\d{2}$/);
});

test("다른 채널에는 채팅이 가지 않는다", async () => {
  const c = await connect("4243");
  await login(c, `테스트C_${suffix}`);
  let leaked = false;
  c.on("chat_update", (m: { message?: string }) => {
    if (m.message === "채널격리") leaked = true;
  });
  a.emit("chat_message", { type: "message", message: "채널격리", tts_hash: "" });
  await new Promise((r) => setTimeout(r, 500));
  c.close();
  assert.equal(leaked, false);
});

test("재생목록 만들기·이름 바꾸기·선택·삭제", async () => {
  let snap = next<[unknown, { Id: number; Name: string }[], number, number]>(a, "update_playlist");
  a.emit("new_playlist");
  const first = await snap;
  let lists = first[1];
  const show = first[3];
  assert.equal(lists.length, 2);
  const created = lists.find((l) => l.Id === show)!;
  assert.equal(created.Name, "새 재생목록");

  snap = next(a, "update_playlist");
  a.emit("rename_playlist", { name: "이름바꿈", playlist_id: created.Id });
  [, lists] = await snap;
  assert.equal(lists.find((l) => l.Id === created.Id)!.Name, "이름바꿈");

  snap = next(a, "update_playlist");
  a.emit("select_playlist", created.Id);
  const selected = await snap;
  assert.equal(selected[2], created.Id);

  snap = next(a, "update_playlist");
  a.emit("delete_playlist", created.Id);
  [, lists] = await snap;
  assert.equal(lists.length, 1);
});

test("남의 재생목록은 바꿀 수 없다", async () => {
  const snapA = next<[unknown, { Id: number }[]]>(a, "update_playlist");
  a.emit("playlist");
  const [, listsA] = await snapA;
  const snapB = next<[unknown, { Id: number; Name: string }[]]>(b, "update_playlist");
  b.emit("rename_playlist", { name: "해킹", playlist_id: listsA[0].Id });
  b.emit("playlist");
  await snapB;
  const again = next<[unknown, { Id: number; Name: string }[]]>(a, "update_playlist");
  a.emit("playlist");
  const [, after_] = await again;
  assert.notEqual(after_[0].Name, "해킹");
});

test("DJ 대기열 입장·퇴장 (빈 재생목록이면 자동 퇴출)", async () => {
  const states: boolean[] = [];
  a.on("dj_state", (s: boolean) => states.push(s));
  a.emit("dj_enter");
  await new Promise((r) => setTimeout(r, 800));
  // 들어갔다가(true) 재생할 곡이 없어 자동으로 빠진다(false)
  assert.equal(states[0], true);
  assert.equal(states.at(-1), false);
  a.off("dj_state");
});

// ---- 아래는 TEST_DB_URL 이 있을 때만: 유튜브 API 없이 videos 를 미리 넣고 재생목록·재생 순환을 검증 ----
const DB_URL = process.env.TEST_DB_URL;

test("곡 추가·순서 변경·삭제·셔플, DJ 재생 시 첫 곡이 맨 뒤로 순환", { skip: !DB_URL }, async () => {
  const mysql = await import("mysql2/promise");
  const db = await mysql.createConnection({ uri: DB_URL! });
  const yt = ["vidAAAAAAA1", "vidBBBBBBB2", "vidCCCCCCC3"].map((v) => v + suffix.slice(-2));
  for (const [i, id] of yt.entries())
    await db.query("INSERT INTO videos (youtube_id, title, duration_sec) VALUES (?, ?, ?)", [id, `곡${i + 1}`, 120]);
  await db.end();

  const dj = await connect("4244");
  try {
  const [, lists] = await login(dj, `테스트DJ_${suffix}`);
  const pid = lists[0].Id;

  let snap = next<[Record<number, { VideoId: string }>, { Id: number; VideoList: number[] }[]]>(dj, "update_playlist");
  const result = next<{ isSuccess: boolean; message: string }>(dj, "push_video_result");
  dj.emit("push_video", { video_id: yt, playlist_id: pid });
  assert.equal((await result).isSuccess, true);
  let [info, ls] = await snap;
  const order = () => ls[0].VideoList.map((id) => info[id].VideoId);
  assert.deepEqual(order(), yt);

  // 중복 추가는 [중복됨] (결과 뒤에 재생목록 갱신도 한 번 온다)
  const dup = next<{ message: string }>(dj, "push_video_result");
  const dupSnap = next(dj, "update_playlist");
  dj.emit("push_video", { video_id: yt[0], playlist_id: pid });
  assert.match((await dup).message, /\[중복됨\]/);
  await dupSnap;

  // 마지막 곡을 맨 위로
  snap = next(dj, "update_playlist");
  dj.emit("change_video_order", { playlist_id: pid, video_index: 2, video_id: ls[0].VideoList[2], isDown: false, isForceMost: true });
  [info, ls] = await snap;
  assert.deepEqual(order(), [yt[2], yt[0], yt[1]]);

  // 첫 곡을 한 칸 위로 → 맨 아래로 순환 (레거시 동작)
  snap = next(dj, "update_playlist");
  dj.emit("change_video_order", { playlist_id: pid, video_index: 0, video_id: ls[0].VideoList[0], isDown: false, isForceMost: false });
  [info, ls] = await snap;
  assert.deepEqual(order(), [yt[0], yt[1], yt[2]]);

  // DJ 입장 → 첫 곡 재생, 재생목록에서 첫 곡이 맨 뒤로
  const playing = next<{ video_id: string; title: string; dj: string }>(dj, "update_current_video");
  snap = next(dj, "update_playlist");
  dj.emit("dj_enter");
  const now = await playing;
  assert.equal(now.video_id, yt[0]);
  [info, ls] = await snap;
  assert.deepEqual(order(), [yt[1], yt[2], yt[0]]);

  // 스킵 → 다음 곡, 다시 순환
  const playing2 = next<{ video_id: string }>(dj, "update_current_video");
  snap = next(dj, "update_playlist");
  dj.emit("skip", "");
  assert.equal((await playing2).video_id, yt[1]);
  [info, ls] = await snap;
  assert.deepEqual(order(), [yt[2], yt[0], yt[1]]);

  // 좋아요 → "좋아요 누른 영상" 재생목록이 생기고 현재 곡이 들어간다
  snap = next(dj, "update_playlist");
  dj.emit("rating", true);
  [info, ls] = await snap;
  const like = ls.find((l) => (l as unknown as { Name: string }).Name === "좋아요 누른 영상")!;
  assert.deepEqual(like.VideoList.map((id) => info[id].VideoId), [yt[1]]);

  // 곡 삭제
  snap = next(dj, "update_playlist");
  dj.emit("delete_video", { playlist_id: pid, video_id: ls[0].VideoList[0] });
  [info, ls] = await snap;
  assert.equal(ls[0].VideoList.length, 2);

  // 셔플 후에도 곡 구성은 같다
  snap = next(dj, "update_playlist");
  dj.emit("shuffle", pid);
  const [info2, ls2] = await snap;
  assert.deepEqual(ls2[0].VideoList.map((id) => info2[id].VideoId).sort(), order().sort());

  dj.emit("dj_quit");
  } finally {
    dj.close();
  }
});
