import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { renderIdenticon, writeIcon } from "../icons";
import { requirePool, withTransaction } from "./tx";

export interface UserRecord {
  id: number;
  name: string;
  icon_id: number | null;
  icon_ver: number;
  current_playlist_id: number | null;
  like_playlist_id: number | null;
}

export async function findUserByName(name: string, conn?: PoolConnection): Promise<UserRecord | null> {
  const db = conn ?? requirePool();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id, name, icon_id, icon_ver, current_playlist_id, like_playlist_id FROM users WHERE name = ? LIMIT 1",
    [name],
  );
  return (rows[0] as UserRecord | undefined) ?? null;
}

/** 레거시 Bans: IP 가 정확히 같은 행 (레거시 쿼리 `IP LIKE "<접속 IP>"` 와 같은 결과) */
export async function findBan(ip: string): Promise<{ reason: string | null; comment: string | null } | null> {
  const [rows] = await requirePool().query<RowDataPacket[]>(
    "SELECT reason, comment FROM bans WHERE ip_pattern = ? LIMIT 1",
    [ip],
  );
  return (rows[0] as { reason: string | null; comment: string | null } | undefined) ?? null;
}

export interface LoginResult {
  user: UserRecord;
  isNewUser: boolean;
  /** 이 IP 에서 이 닉네임으로 처음 접속 (레거시 로그: 아이디 도용 가능성 감지) */
  isNewOnThisIp: boolean;
  connectCount: number;
  ipComment: string | null;
}

/**
 * 레거시 login 의 DB 처리:
 *   계정이 없으면 계정 + "{닉네임}의 재생목록" + 아이콘 생성, IP 별 접속 기록 갱신.
 */
export async function loginUser(name: string, ip: string): Promise<LoginResult> {
  const result = await withTransaction(async (conn) => {
    let user = await findUserByName(name, conn);
    const isNewUser = !user;
    let newIconId: number | null = null;

    if (!user) {
      const [ins] = await conn.query<ResultSetHeader>("INSERT INTO users (name) VALUES (?)", [name]);
      const userId = ins.insertId;
      const [pl] = await conn.query<ResultSetHeader>(
        "INSERT INTO playlists (owner_id, name, sort_order) VALUES (?, ?, 0)",
        [userId, `${name}의 재생목록`],
      );
      await conn.query("UPDATE users SET current_playlist_id = ? WHERE id = ?", [pl.insertId, userId]);
      user = (await findUserByName(name, conn))!;
    }

    if (user.icon_id === null) {
      // 아이콘 id 는 아이콘 파일 이름이라 레거시 Icons.Id 와 겹치지 않게 최댓값 다음 번호를 쓴다.
      const [rows] = await conn.query<RowDataPacket[]>("SELECT COALESCE(MAX(icon_id), 0) + 1 AS next FROM users FOR UPDATE");
      newIconId = Number(rows[0].next);
      await conn.query("UPDATE users SET icon_id = ?, icon_ver = 1 WHERE id = ?", [newIconId, user.id]);
      user = { ...user, icon_id: newIconId, icon_ver: 1 };
    }

    const [stat] = await conn.query<RowDataPacket[]>(
      "SELECT connect_count FROM ip_user_stats WHERE ip = ? AND user_name = ? LIMIT 1",
      [ip, name],
    );
    const isNewOnThisIp = stat.length === 0;
    await conn.query(
      `INSERT INTO ip_user_stats (ip, user_name, connect_count, first_login, last_login)
       VALUES (?, ?, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE connect_count = connect_count + 1, last_login = NOW()`,
      [ip, name],
    );
    const connectCount = isNewOnThisIp ? 1 : Number(stat[0].connect_count) + 1;
    const [note] = await conn.query<RowDataPacket[]>("SELECT comment FROM ip_notes WHERE ip = ? LIMIT 1", [ip]);

    return { user, isNewUser, isNewOnThisIp, connectCount, ipComment: (note[0]?.comment as string | undefined) ?? null, newIconId };
  });

  // 새로 배정한 아이콘 id 에는 옛 파일이 남아 있을 수 있으므로 항상 새로 그린다.
  if (result.newIconId !== null) await writeIcon(result.newIconId, renderIdenticon(`${name}7`));
  return result;
}

export async function bumpIconVersion(userId: number): Promise<void> {
  await requirePool().query("UPDATE users SET icon_ver = icon_ver + 1 WHERE id = ?", [userId]);
}
