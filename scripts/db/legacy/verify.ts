// 마이그레이션 결과 검증.
// 대상 DB 를 다시 읽어서, 변환 로직(transform.ts)과 독립적으로 레거시 원본과 직접 비교한다.
// (변환 로직에 버그가 있어도 여기서 잡히도록 transform 의 결과물이 아니라 레거시 원본을 기준으로 삼는다.)
import type { Connection, RowDataPacket } from "mysql2/promise";
import { nameKey, parseJsonValue, type LegacyData, type V2Data } from "./transform";

type Row = Record<string, unknown>;

const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

async function all(conn: Connection, sql: string): Promise<Row[]> {
  const [rows] = await conn.query<RowDataPacket[]>(sql);
  return rows as Row[];
}

export async function verifyMigration(conn: Connection, legacy: LegacyData, v2: V2Data): Promise<string[]> {
  const problems: string[] = [];
  const fail = (msg: string) => problems.push(msg);

  const users = await all(conn, "SELECT * FROM users");
  const playlists = await all(conn, "SELECT * FROM playlists");
  const videos = await all(conn, "SELECT * FROM videos");
  const items = await all(conn, "SELECT playlist_id, video_id, position FROM playlist_items ORDER BY playlist_id, position");
  const issues = await all(conn, "SELECT kind, source, source_key FROM legacy_migration_issues");

  const issueCount = (kind: string) => issues.filter((i) => i.kind === kind).length;

  // ---- videos: 모든 레거시 영상의 youtube id 가 존재하고, 개수 = v2 + 중복으로 합쳐진 수
  const videoByYoutube = new Map(videos.map((v) => [s(v.youtube_id)!, v]));
  const videoById = new Map(videos.map((v) => [n(v.id)!, v]));
  for (const lv of legacy.videos) {
    const yt = s(lv.VideoId)?.trim();
    if (!yt) continue;
    const v = videoByYoutube.get(yt);
    if (!v) fail(`video 누락: legacy Id ${lv.Id} (${yt})`);
    else if (n(v.id) === n(lv.Id) && (s(v.title) !== (s(lv.Name) ?? "제목 없음") || n(v.duration_sec) !== Math.max(0, n(lv.Length) ?? 0)))
      fail(`video 값 불일치: Id ${lv.Id}`);
  }
  if (videos.length + issueCount("duplicate_video") + issueCount("invalid_video") !== legacy.videos.length)
    fail(`video 개수 불일치: legacy ${legacy.videos.length} ≠ v2 ${videos.length} + 중복 ${issueCount("duplicate_video")} + 무효 ${issueCount("invalid_video")}`);

  const legacyYoutubeById = new Map(legacy.videos.map((v) => [n(v.Id)!, s(v.VideoId)?.trim() ?? ""]));

  // ---- playlists: id·이름·삭제 여부, 그리고 곡 순서를 "유튜브 id 열" 로 비교
  const v2PlaylistById = new Map(playlists.map((p) => [n(p.id)!, p]));
  const itemsByPlaylist = new Map<number, Row[]>();
  for (const it of items) {
    const list = itemsByPlaylist.get(n(it.playlist_id)!) ?? [];
    list.push(it);
    itemsByPlaylist.set(n(it.playlist_id)!, list);
  }
  for (const lp of legacy.playlists) {
    const id = n(lp.Id);
    if (id === null) continue;
    const p = v2PlaylistById.get(id);
    if (!p) {
      fail(`playlist 누락: ${id}`);
      continue;
    }
    if (s(p.name) !== (s(lp.Name) ?? "새 재생목록")) fail(`playlist 이름 불일치: ${id}`);
    const legacyDeleted = lp.Deleted !== null && lp.Deleted !== undefined && String(lp.Deleted) !== "0" && String(lp.Deleted) !== "";
    if (legacyDeleted !== (p.deleted_at !== null)) fail(`playlist 삭제 여부 불일치: ${id}`);

    const raw = parseJsonValue(lp.VideoList);
    const expected = (Array.isArray(raw) ? raw : [])
      .map((x) => legacyYoutubeById.get(Number(x)))
      .filter((x): x is string => Boolean(x));
    const actual = (itemsByPlaylist.get(id) ?? []).map((it) => s(videoById.get(n(it.video_id)!)?.youtube_id));
    if (expected.join("\n") !== actual.join("\n"))
      fail(`playlist ${id} 곡 순서 불일치 (legacy ${expected.length}곡, v2 ${actual.length}곡)`);
    if (n(p.item_count) !== actual.length) fail(`playlist ${id} item_count 불일치`);
  }
  if (playlists.length !== legacy.playlists.filter((p) => n(p.Id) !== null).length) fail("playlist 개수 불일치");

  // ---- users: 모든 레거시 계정이 같은 이름으로 존재하고, 재생목록 목록·현재·좋아요가 같다
  const userByName = new Map(users.map((u) => [nameKey(s(u.name)!), u]));
  const playlistsByOwner = new Map<number, Row[]>();
  for (const p of playlists) {
    if (p.owner_id === null || p.deleted_at !== null) continue;
    const list = playlistsByOwner.get(n(p.owner_id)!) ?? [];
    list.push(p);
    playlistsByOwner.set(n(p.owner_id)!, list);
  }
  const legacyPlaylistIds = new Set(legacy.playlists.map((p) => n(p.Id)));
  const claimed = new Set<number>();
  for (const la of legacy.accounts) {
    const name = s(la.Name);
    if (!name) continue;
    const u = userByName.get(nameKey(name));
    if (!u) {
      fail(`user 누락: ${name}`);
      continue;
    }
    const raw = parseJsonValue(la.Playlists);
    const expected: number[] = [];
    for (const x of Array.isArray(raw) ? raw : []) {
      const id = Number(x);
      if (!legacyPlaylistIds.has(id) || claimed.has(id)) continue;
      claimed.add(id);
      const lp = legacy.playlists.find((p) => n(p.Id) === id);
      const deleted = lp && lp.Deleted !== null && lp.Deleted !== undefined && String(lp.Deleted) !== "0" && String(lp.Deleted) !== "";
      if (!deleted) expected.push(id);
    }
    const actual = (playlistsByOwner.get(n(u.id)!) ?? [])
      .sort((a, b) => n(a.sort_order)! - n(b.sort_order)!)
      .map((p) => n(p.id)!);
    if (expected.join(",") !== actual.join(",")) fail(`user ${name} 재생목록 목록 불일치: legacy [${expected}] v2 [${actual}]`);

    const cur = n(la.CurrentPlaylist);
    const expectedCur = cur && legacyPlaylistIds.has(cur) ? cur : null;
    if (n(u.current_playlist_id) !== expectedCur) fail(`user ${name} 현재 재생목록 불일치`);
    const like = n(la.LikePlaylist);
    const expectedLike = like && legacyPlaylistIds.has(like) ? like : null;
    if (n(u.like_playlist_id) !== expectedLike) fail(`user ${name} 좋아요 재생목록 불일치`);
  }

  // ---- icons: 아이콘 id·버전 보존 (아이콘 파일명이 id 이므로 반드시 같아야 함)
  for (const li of legacy.icons) {
    const name = s(li.__account) ?? s(li.Name);
    if (!name) continue;
    const u = userByName.get(nameKey(name));
    if (!u) fail(`icon 의 user 누락: ${name}`);
    else if (n(u.icon_id) !== n(li.Id) && issueCount("duplicate_icon") === 0) fail(`icon id 불일치: ${name}`);
    else if (n(u.icon_id) === n(li.Id) && n(u.icon_ver) !== Math.max(1, n(li.Ver) ?? 1)) fail(`icon ver 불일치: ${name}`);
  }

  // ---- 나머지 테이블: 개수 (+ 문제로 빠진 수)
  const count = async (table: string) => Number((await all(conn, `SELECT COUNT(*) AS c FROM ${table}`))[0].c);
  if ((await count("bans")) + issueCount("invalid_ban") !== legacy.bans.length) fail("bans 개수 불일치");
  if ((await count("lolwiki_bookmarks")) + issueCount("duplicate_bookmark") + issueCount("invalid_bookmark") !== legacy.archive.length)
    fail("lolwiki_bookmarks 개수 불일치");

  const legacySecureEntries = legacy.secures.reduce((sum, r) => {
    const raw = parseJsonValue(r.ConnectData);
    return sum + (Array.isArray(raw) ? raw.length : 0);
  }, 0);
  const statCount = await count("ip_user_stats");
  if (statCount + issueCount("merged_secure_entry") + issueCount("invalid_secure_entry") + issueCount("oversized_secure_name") !== legacySecureEntries)
    fail(`ip_user_stats 개수 불일치: legacy 항목 ${legacySecureEntries}, v2 ${statCount}`);
  const legacyConnectTotal = legacy.secures.reduce((sum, r) => {
    const raw = parseJsonValue(r.ConnectData);
    return sum + (Array.isArray(raw) ? raw.reduce((a: number, e: Row) => a + (n((e ?? {}).ConnectCount) ?? 0), 0) : 0);
  }, 0);
  // 닉네임이 없거나 255자를 넘는 기록은 issues 에만 보존되므로 그 접속 횟수를 더해서 비교한다.
  const oversizedConnects = v2.issues
    .filter((i) => i.kind === "oversized_secure_name" || i.kind === "invalid_secure_entry")
    .reduce((sum, i) => sum + (n((i.payload as Row | null)?.ConnectCount) ?? 0), 0);
  const v2ConnectTotal = Number((await all(conn, "SELECT COALESCE(SUM(connect_count),0) AS c FROM ip_user_stats"))[0].c) + oversizedConnects;
  if (legacyConnectTotal !== v2ConnectTotal) fail(`접속 횟수 합계 불일치: legacy ${legacyConnectTotal}, v2 ${v2ConnectTotal}`);

  const legacyMemoCount = legacy.memos.reduce((sum, r) => {
    const raw = parseJsonValue(r.UserMemos);
    return sum + (raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw).length : 0);
  }, 0);
  // IP 별 인증 android_id·메모가 그대로인지
  const notes = new Map((await all(conn, "SELECT ip, comment, android_id FROM ip_notes")).map((r) => [s(r.ip), r]));
  for (const ls of legacy.secures) {
    const ip = s(ls.IP)?.trim();
    if (!ip) continue;
    const androidId = s(ls.android_id) || null;
    const comment = s(ls.Comment) || null;
    const note = notes.get(ip);
    if ((androidId || comment) && !note) fail(`ip_notes 누락: ${ip}`);
    else if (note && (s(note.android_id) !== androidId || s(note.comment) !== comment)) fail(`ip_notes 값 불일치: ${ip}`);
  }

  const memoCount = await count("lolwiki_memos");
  if (memoCount !== legacyMemoCount && issueCount("duplicate_memo_owner") === 0)
    fail(`lolwiki_memos 개수 불일치: legacy ${legacyMemoCount}, v2 ${memoCount}`);

  // ---- 문제 기록이 빠짐없이 저장되었는지
  if (issues.length !== v2.issues.length) fail(`legacy_migration_issues 저장 개수 불일치: ${issues.length} ≠ ${v2.issues.length}`);

  return problems;
}
