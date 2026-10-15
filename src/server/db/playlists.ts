// 재생목록. 곡 하나 = playlist_items 행 하나, 순서는 position(간격 POSITION_STEP).
// 레거시는 VideoList JSON 배열 전체를 읽고 다시 썼지만, 여기서는 필요한 행만 바꾼다.
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { shuffleInPlace } from "../legacy/util";
import { requirePool, withTransaction } from "./tx";

export const POSITION_STEP = 1024;

export interface LegacyVideoInfo {
  Name: string;
  VideoId: string;
  Length: number;
  Thumbnail: string | null;
  Author: string | null;
}
export interface LegacyPlaylistInfo {
  Id: number;
  Name: string;
  VideoList: number[];
}

/** 레거시 update_playlist 이벤트 데이터: [영상 정보 dic, 재생목록 목록, 현재 재생목록 id, 새로 만든 재생목록 id] */
export async function legacyPlaylistSnapshot(userId: number, showPlaylistId = 0) {
  const db = requirePool();
  const [userRows] = await db.query<RowDataPacket[]>("SELECT current_playlist_id FROM users WHERE id = ?", [userId]);
  // 레거시는 Id IN (...) 으로 읽어 결과가 id 순서였다. 화면 순서를 같게 하려고 id 순으로 정렬한다.
  const [playlists] = await db.query<RowDataPacket[]>(
    "SELECT id, name FROM playlists WHERE owner_id = ? AND deleted_at IS NULL ORDER BY id",
    [userId],
  );
  const ids = playlists.map((p) => Number(p.id));
  const [items] = ids.length
    ? await db.query<RowDataPacket[]>(
        `SELECT i.playlist_id, i.video_id, v.youtube_id, v.title, v.duration_sec, v.thumbnail_url, v.author
         FROM playlist_items i JOIN videos v ON v.id = i.video_id
         WHERE i.playlist_id IN (?) ORDER BY i.playlist_id, i.position`,
        [ids],
      )
    : [[] as RowDataPacket[]];

  const videoInfo: Record<number, LegacyVideoInfo> = {};
  const listById = new Map<number, number[]>(ids.map((id) => [id, []]));
  for (const it of items) {
    const videoId = Number(it.video_id);
    listById.get(Number(it.playlist_id))!.push(videoId);
    videoInfo[videoId] ??= {
      Name: it.title as string,
      VideoId: it.youtube_id as string,
      Length: Number(it.duration_sec),
      Thumbnail: it.thumbnail_url as string | null,
      Author: it.author as string | null,
    };
  }
  const playlistInfo: LegacyPlaylistInfo[] = playlists.map((p) => ({
    Id: Number(p.id),
    Name: p.name as string,
    VideoList: listById.get(Number(p.id))!,
  }));
  const current = Number(userRows[0]?.current_playlist_id ?? 0);
  return [videoInfo, playlistInfo, current, showPlaylistId] as const;
}

/** 이 유저 소유이고 삭제되지 않은 재생목록인지 */
async function assertOwned(conn: PoolConnection | ReturnType<typeof requirePool>, userId: number, playlistId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM playlists WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1",
    [playlistId, userId],
  );
  if (rows.length === 0) throw new Error(`재생목록 ${playlistId} 은(는) 이 유저의 것이 아님`);
}

async function touchRev(conn: PoolConnection | ReturnType<typeof requirePool>, userId: number) {
  await conn.query("UPDATE users SET playlist_rev = playlist_rev + 1 WHERE id = ?", [userId]);
}

export async function createPlaylist(userId: number, name: string): Promise<number> {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM playlists WHERE owner_id = ?",
      [userId],
    );
    const [res] = await conn.query<ResultSetHeader>(
      "INSERT INTO playlists (owner_id, name, sort_order) VALUES (?, ?, ?)",
      [userId, name, Number(rows[0].next)],
    );
    await touchRev(conn, userId);
    return res.insertId;
  });
}

export async function selectPlaylist(userId: number, playlistId: number) {
  const db = requirePool();
  await assertOwned(db, userId, playlistId);
  await db.query("UPDATE users SET current_playlist_id = ? WHERE id = ?", [playlistId, userId]);
}

export async function renamePlaylist(userId: number, playlistId: number, name: string) {
  const db = requirePool();
  await assertOwned(db, userId, playlistId);
  await db.query("UPDATE playlists SET name = ? WHERE id = ?", [name.slice(0, 100), playlistId]);
  await touchRev(db, userId);
}

/** 소프트 삭제 (레거시 Deleted=1). 좋아요 재생목록이었다면 지정 해제. */
export async function deletePlaylist(userId: number, playlistId: number) {
  await withTransaction(async (conn) => {
    await assertOwned(conn, userId, playlistId);
    await conn.query("UPDATE playlists SET deleted_at = NOW() WHERE id = ?", [playlistId]);
    await conn.query("UPDATE users SET like_playlist_id = NULL WHERE id = ? AND like_playlist_id = ?", [userId, playlistId]);
    await touchRev(conn, userId);
  });
}

async function itemsOf(conn: PoolConnection, playlistId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT id, video_id, position FROM playlist_items WHERE playlist_id = ? ORDER BY position FOR UPDATE",
    [playlistId],
  );
  return rows.map((r) => ({ id: Number(r.id), videoId: Number(r.video_id), position: Number(r.position) }));
}

async function updateCount(conn: PoolConnection, playlistId: number) {
  await conn.query(
    "UPDATE playlists SET item_count = (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = ?) WHERE id = ?",
    [playlistId, playlistId],
  );
}

/** position 을 1024 간격으로 다시 매긴다 (UNIQUE 충돌을 피하려고 먼저 음수로 옮긴다). */
async function renumber(conn: PoolConnection, playlistId: number, orderedItemIds: number[]) {
  await conn.query("UPDATE playlist_items SET position = -CAST(id AS SIGNED) WHERE playlist_id = ?", [playlistId]);
  for (let i = 0; i < orderedItemIds.length; i++)
    await conn.query("UPDATE playlist_items SET position = ? WHERE id = ?", [(i + 1) * POSITION_STEP, orderedItemIds[i]]);
}

/** 영상 하나 삭제 (레거시처럼 같은 영상이 여러 번 있으면 첫 번째). 삭제 후 남은 곡 수 반환. */
export async function deleteVideoFromPlaylist(userId: number, playlistId: number, videoId: number): Promise<number> {
  return withTransaction(async (conn) => {
    await assertOwned(conn, userId, playlistId);
    const items = await itemsOf(conn, playlistId);
    const target = items.find((i) => i.videoId === videoId);
    if (!target) throw new Error(`플레이리스트에 해당 영상이 없음. ${videoId} not in ${playlistId}`);
    await conn.query("DELETE FROM playlist_items WHERE id = ?", [target.id]);
    await updateCount(conn, playlistId);
    await touchRev(conn, userId);
    return items.length - 1;
  });
}

export async function shufflePlaylist(userId: number, playlistId: number) {
  await withTransaction(async (conn) => {
    await assertOwned(conn, userId, playlistId);
    const items = await itemsOf(conn, playlistId);
    await renumber(conn, playlistId, shuffleInPlace(items.map((i) => i.id)));
    await touchRev(conn, userId);
  });
}

/**
 * 레거시 change_video_order: index 의 곡을 위/아래로 한 칸(끝에서는 반대쪽 끝으로), 또는 맨 위/맨 아래로.
 * 옮기는 곡 한 행만 position 을 바꾸고, 사이에 빈 번호가 없을 때만 전체를 다시 매긴다.
 */
export async function moveVideo(userId: number, playlistId: number, index: number, videoId: number, isDown: boolean, isForceMost: boolean) {
  await withTransaction(async (conn) => {
    await assertOwned(conn, userId, playlistId);
    const items = await itemsOf(conn, playlistId);
    if (items.length <= 1) return;
    if (items[index]?.videoId !== videoId) throw new Error(`검증 실패. index ${index}, video ${videoId}`);

    let dest: number;
    if (isForceMost) dest = isDown ? items.length - 1 : 0;
    else {
      dest = isDown ? index + 1 : index - 1;
      if (dest === -1) dest = items.length - 1;
      if (dest === items.length) dest = 0;
    }
    const moved = items[index];
    const rest = items.filter((_, i) => i !== index);
    const before = rest[dest - 1];
    const after = rest[dest];
    let position: number | null;
    if (!before) position = after.position - POSITION_STEP;
    else if (!after) position = before.position + POSITION_STEP;
    else position = after.position - before.position > 1 ? Math.floor((before.position + after.position) / 2) : null;

    if (position === null) {
      const order = rest.map((i) => i.id);
      order.splice(dest, 0, moved.id);
      await renumber(conn, playlistId, order);
    } else await conn.query("UPDATE playlist_items SET position = ? WHERE id = ?", [position, moved.id]);
    await touchRev(conn, userId);
  });
}

/** 재생목록 끝에 추가. 이미 있는 영상은 건너뛴다 (레거시 중복 체크). 추가된 video id 와 중복된 video id 반환. */
export async function appendVideos(userId: number, playlistId: number, videoIds: number[]) {
  return withTransaction(async (conn) => {
    await assertOwned(conn, userId, playlistId);
    const items = await itemsOf(conn, playlistId);
    const existing = new Set(items.map((i) => i.videoId));
    const added: number[] = [];
    const duplicated: number[] = [];
    let last = items.length ? items[items.length - 1].position : 0;
    for (const id of videoIds) {
      if (existing.has(id)) {
        duplicated.push(id);
        continue;
      }
      last += POSITION_STEP;
      await conn.query("INSERT INTO playlist_items (playlist_id, video_id, position) VALUES (?, ?, ?)", [playlistId, id, last]);
      existing.add(id);
      added.push(id);
    }
    if (added.length) {
      await updateCount(conn, playlistId);
      await touchRev(conn, userId);
    }
    return { added, duplicated };
  });
}

/**
 * DJ 차례: 현재 재생목록의 첫 곡을 꺼내 맨 뒤로 보낸다 (레거시 재생목록 순환).
 * 행 하나의 position 만 바꾼다. 비어 있으면 null.
 */
export async function rotateCurrentPlaylist(userId: number) {
  return withTransaction(async (conn) => {
    const [u] = await conn.query<RowDataPacket[]>("SELECT current_playlist_id FROM users WHERE id = ?", [userId]);
    const playlistId = u[0]?.current_playlist_id as number | null;
    if (!playlistId) return null;
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT i.id, i.position, v.id AS video_id, v.youtube_id, v.title, v.duration_sec, v.thumbnail_url, v.author
       FROM playlist_items i JOIN videos v ON v.id = i.video_id
       WHERE i.playlist_id = ? ORDER BY i.position LIMIT 1 FOR UPDATE`,
      [playlistId],
    );
    if (rows.length === 0) return null;
    const [max] = await conn.query<RowDataPacket[]>("SELECT MAX(position) AS p FROM playlist_items WHERE playlist_id = ?", [playlistId]);
    await conn.query("UPDATE playlist_items SET position = ? WHERE id = ?", [Number(max[0].p) + POSITION_STEP, rows[0].id]);
    await touchRev(conn, userId);
    const r = rows[0];
    return {
      videoId: Number(r.video_id),
      youtubeId: r.youtube_id as string,
      title: r.title as string,
      duration: Number(r.duration_sec),
      thumbnail: r.thumbnail_url as string | null,
      author: r.author as string | null,
    };
  });
}

/** 좋아요 재생목록 id (없으면 "좋아요 누른 영상" 재생목록을 만든다) */
export async function ensureLikePlaylist(userId: number): Promise<{ id: number; created: boolean }> {
  return withTransaction(async (conn) => {
    const [u] = await conn.query<RowDataPacket[]>("SELECT like_playlist_id FROM users WHERE id = ? FOR UPDATE", [userId]);
    const current = u[0]?.like_playlist_id as number | null;
    if (current) return { id: current, created: false };
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM playlists WHERE owner_id = ?",
      [userId],
    );
    const [res] = await conn.query<ResultSetHeader>(
      "INSERT INTO playlists (owner_id, name, sort_order) VALUES (?, '좋아요 누른 영상', ?)",
      [userId, Number(rows[0].next)],
    );
    await conn.query("UPDATE users SET like_playlist_id = ? WHERE id = ?", [res.insertId, userId]);
    await touchRev(conn, userId);
    return { id: res.insertId, created: true };
  });
}
