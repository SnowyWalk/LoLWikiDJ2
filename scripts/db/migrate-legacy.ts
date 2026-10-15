/**
 * 레거시 LoLWikiDJ_DB → v2 스키마 데이터 마이그레이션.
 *
 *   LEGACY_DATABASE_URL=mysql://user:pass@host:3306/LoLWikiDJ_DB \
 *   DATABASE_URL=mysql://user:pass@host:3306/lolwikidj_v2 \
 *   npx tsx scripts/db/migrate-legacy.ts [--dry-run] [--reset-target] [--allow-unmapped] [--report=path]
 *
 * 안전장치
 *   - 레거시 DB 는 READ ONLY 트랜잭션 + CONSISTENT SNAPSHOT 으로 읽기만 한다. 어떤 쓰기도 하지 않는다.
 *   - 레거시와 대상이 같은 DB 면 즉시 중단한다.
 *   - 대상 DB 에 데이터가 있으면 중단한다 (--reset-target 을 줄 때만 v2 테이블을 비우고 다시 채운다).
 *   - 레거시에 이 스크립트가 모르는 테이블/컬럼이 있으면 중단한다 (--allow-unmapped 로 무시 가능).
 *   - 대상 쓰기는 하나의 트랜잭션. 중간에 실패하면 전부 롤백된다.
 *   - 커밋 후 대상 DB 를 다시 읽어 레거시와 1:1 비교 검증하고, 불일치가 있으면 exit code 1.
 *   - 새 제약에 맞지 않는 레거시 데이터는 legacy_migration_issues 에 원본 그대로 남긴다.
 */
import { writeFileSync } from "node:fs";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { transformLegacy, type LegacyData, type V2Data } from "./legacy/transform";
import { verifyMigration } from "./legacy/verify";

const args = new Set(process.argv.slice(2));
const flag = (name: string) => args.has(`--${name}`);
const reportPath = [...args].find((a) => a.startsWith("--report="))?.slice("--report=".length);

// 이 스크립트가 알고 있는 레거시 테이블과 컬럼. 이외의 것이 있으면 데이터 유실 가능성이 있으므로 멈춘다.
const KNOWN: Record<keyof LegacyData, { table: string; columns: string[]; optional?: boolean }> = {
  accounts: { table: "Accounts", columns: ["Name", "Playlists", "CurrentPlaylist", "Password", "LikePlaylist"] },
  icons: { table: "Icons", columns: ["Name", "Id", "Ver"] },
  playlists: { table: "Playlists", columns: ["Id", "Name", "VideoList", "Deleted"] },
  videos: { table: "Videos", columns: ["Id", "Name", "VideoId", "Length", "Thumbnail", "Author"] },
  bans: { table: "Bans", columns: ["IP", "Reason", "Comment"], optional: true },
  secures: { table: "Secures", columns: ["IP", "ConnectData", "Comment"], optional: true },
  archive: {
    table: "LoLWikiArchive",
    columns: [
      "No", "Owner", "post_seq", "icon_img", "badge_use", "post_title", "nickname", "post_date", "likes", "replys",
      "youtube_url", "doodlr", "pic_new", "pic_multi", "post_text", "views", "doodlrurls", "fixedpic", "stack", "reply_cnt",
    ],
    optional: true,
  },
  memos: { table: "LoLWikiMemos", columns: ["android_id", "UserMemos"], optional: true },
};

const V2_TABLES_IN_DELETE_ORDER = [
  "legacy_migration_issues",
  "lolwiki_memos",
  "lolwiki_bookmarks",
  "ip_notes",
  "ip_user_stats",
  "bans",
  "playlist_items",
  "users", // users ↔ playlists 순환 참조는 아래에서 FK 체크를 끄고 비운다
  "playlists",
  "videos",
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 필요합니다`);
  return value;
}

function describe(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: u.port || "3306", database: u.pathname.replace(/^\//, ""), user: decodeURIComponent(u.username) };
}

async function readLegacy(conn: Connection, allowUnmapped: boolean): Promise<{ data: LegacyData; unmapped: string[] }> {
  const [dbRows] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS db");
  const schema = dbRows[0].db as string;
  const [columnRows] = await conn.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
    [schema],
  );
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of columnRows) {
    const set = columnsByTable.get(row.t) ?? new Set<string>();
    set.add(row.c);
    columnsByTable.set(row.t, set);
  }

  // 테이블 이름은 대소문자 구분 없이 찾는다 (Windows MySQL 은 lower_case_table_names=1).
  const actualTable = new Map([...columnsByTable.keys()].map((t) => [t.toLowerCase(), t]));
  const unmapped: string[] = [];
  const knownTables = new Set(Object.values(KNOWN).map((k) => k.table.toLowerCase()));
  for (const table of columnsByTable.keys()) if (!knownTables.has(table.toLowerCase())) unmapped.push(`table ${table}`);

  const data = {} as LegacyData;
  for (const [key, spec] of Object.entries(KNOWN) as [keyof LegacyData, (typeof KNOWN)[keyof LegacyData]][]) {
    const tableName = actualTable.get(spec.table.toLowerCase());
    const columns = tableName ? columnsByTable.get(tableName) : undefined;
    if (!tableName || !columns) {
      if (!spec.optional) throw new Error(`레거시에 필수 테이블 ${spec.table} 이 없습니다`);
      data[key] = [];
      continue;
    }
    for (const column of columns) if (!spec.columns.includes(column)) unmapped.push(`column ${spec.table}.${column}`);
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT * FROM \`${tableName}\``);
    data[key] = rows.map((r) => ({ ...r }));
  }

  // 아이콘↔계정 연결은 레거시 앱과 똑같이 레거시 DB 의 collation 으로 판단한다.
  const iconsTable = actualTable.get("icons");
  const accountsTable = actualTable.get("accounts");
  if (iconsTable && accountsTable) {
    const [links] = await conn.query<RowDataPacket[]>(
      `SELECT i.Id AS id, a.Name AS account FROM \`${iconsTable}\` i JOIN \`${accountsTable}\` a ON a.Name = i.Name`,
    );
    const accountByIconId = new Map(links.map((l) => [String(l.id), l.account as string]));
    for (const icon of data.icons) {
      const account = accountByIconId.get(String(icon.Id));
      if (account !== undefined) icon.__account = account;
    }
  }

  if (unmapped.length > 0 && !allowUnmapped)
    throw new Error(`레거시에 마이그레이션 대상이 아닌 테이블/컬럼이 있습니다 (데이터 유실 방지로 중단):\n  ${unmapped.join("\n  ")}\n확인 후 --allow-unmapped 로 진행할 수 있습니다.`);
  return { data, unmapped };
}

async function assertTargetReady(conn: Connection, reset: boolean) {
  const [tables] = await conn.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
  );
  const existing = new Set(tables.map((t) => t.t as string));
  const missing = V2_TABLES_IN_DELETE_ORDER.filter((t) => !existing.has(t));
  if (missing.length > 0) throw new Error(`대상 DB 에 v2 스키마가 없습니다 (먼저 npm run db:migrate): ${missing.join(", ")}`);

  const counts: string[] = [];
  for (const table of V2_TABLES_IN_DELETE_ORDER) {
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${table}\``);
    if (Number(rows[0].n) > 0) counts.push(`${table}=${rows[0].n}`);
  }
  if (counts.length === 0) return;
  if (!reset) throw new Error(`대상 DB 가 비어 있지 않습니다 (${counts.join(", ")}). 다시 채우려면 --reset-target`);

  console.log(`대상 DB 의 v2 테이블을 비웁니다: ${counts.join(", ")}`);
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of V2_TABLES_IN_DELETE_ORDER) await conn.query(`DELETE FROM \`${table}\``);
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function insertMany(conn: Connection, table: string, columns: string[], rows: unknown[][], chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await conn.query(`INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES ?`, [part]);
  }
}

async function writeTarget(conn: Connection, v2: V2Data) {
  await conn.beginTransaction();
  try {
    await insertMany(conn, "videos", ["id", "youtube_id", "title", "duration_sec", "thumbnail_url", "author"],
      v2.videos.map((v) => [v.id, v.youtube_id, v.title, v.duration_sec, v.thumbnail_url, v.author]));

    // users → playlists → users.current/like 순으로 순환 참조를 푼다.
    await insertMany(conn, "users", ["id", "name", "password_hash", "icon_id", "icon_ver"],
      v2.users.map((u) => [u.id, u.name, u.password_hash, u.icon_id, u.icon_ver]));
    await insertMany(conn, "playlists", ["id", "owner_id", "name", "sort_order", "item_count", "deleted_at"],
      v2.playlists.map((p) => [p.id, p.owner_id, p.name, p.sort_order, p.item_count, p.deleted ? new Date() : null]));
    for (const u of v2.users) {
      if (u.current_playlist_id === null && u.like_playlist_id === null) continue;
      await conn.query("UPDATE users SET current_playlist_id = ?, like_playlist_id = ? WHERE id = ?",
        [u.current_playlist_id, u.like_playlist_id, u.id]);
    }
    await insertMany(conn, "playlist_items", ["playlist_id", "video_id", "position"],
      v2.items.map((i) => [i.playlist_id, i.video_id, i.position]), 2000);

    await insertMany(conn, "bans", ["ip_pattern", "reason", "comment"], v2.bans.map((b) => [b.ip_pattern, b.reason, b.comment]));
    await insertMany(conn, "ip_user_stats", ["ip", "user_name", "connect_count", "first_login", "last_login"],
      v2.ipStats.map((s) => [s.ip, s.user_name, s.connect_count, s.first_login, s.last_login]));
    await insertMany(conn, "ip_notes", ["ip", "comment"], v2.ipNotes.map((n) => [n.ip, n.comment]));
    await insertMany(conn, "lolwiki_bookmarks",
      ["id", "owner", "post_seq", "post_title", "nickname", "icon_img", "badge_use", "post_date", "likes", "views", "reply_cnt", "youtube_url", "doodlr", "pic_new", "pic_multi", "detail"],
      v2.bookmarks.map((b) => [b.id, b.owner, b.post_seq, b.post_title, b.nickname, b.icon_img, b.badge_use, b.post_date, b.likes, b.views, b.reply_cnt, b.youtube_url, b.doodlr, b.pic_new, b.pic_multi, JSON.stringify(b.detail)]),
      200);
    await insertMany(conn, "lolwiki_memos", ["owner", "target", "memo"], v2.memos.map((m) => [m.owner, m.target, m.memo]));
    await insertMany(conn, "legacy_migration_issues", ["kind", "source", "source_key", "payload", "note"],
      v2.issues.map((i) => [i.kind, i.source, i.sourceKey, JSON.stringify(i.payload ?? null, bufferReplacer), i.note]), 200);

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

function bufferReplacer(_key: string, value: unknown) {
  if (value && typeof value === "object" && (value as { type?: string }).type === "Buffer") return "[binary]";
  return value;
}

function summarize(v2: V2Data) {
  const issueCounts: Record<string, number> = {};
  for (const i of v2.issues) issueCounts[i.kind] = (issueCounts[i.kind] ?? 0) + 1;
  return {
    users: v2.users.length,
    videos: v2.videos.length,
    playlists: v2.playlists.length,
    playlist_items: v2.items.length,
    bans: v2.bans.length,
    ip_user_stats: v2.ipStats.length,
    ip_notes: v2.ipNotes.length,
    lolwiki_bookmarks: v2.bookmarks.length,
    lolwiki_memos: v2.memos.length,
    issues: issueCounts,
  };
}

async function main() {
  const legacyUrl = requireEnv("LEGACY_DATABASE_URL");
  const legacyInfo = describe(legacyUrl);
  const dryRun = flag("dry-run");
  const targetUrl = dryRun ? null : requireEnv("DATABASE_URL");
  if (targetUrl) {
    const t = describe(targetUrl);
    if (t.host === legacyInfo.host && t.port === legacyInfo.port && t.database === legacyInfo.database)
      throw new Error("레거시와 대상 DB 가 같습니다. 대상은 별도 데이터베이스여야 합니다.");
  }

  console.log(`레거시 읽기: ${legacyInfo.user}@${legacyInfo.host}:${legacyInfo.port}/${legacyInfo.database} (read only)`);
  const legacyConn = await mysql.createConnection({ uri: legacyUrl, dateStrings: true, supportBigNumbers: true, bigNumberStrings: false });
  let legacy: LegacyData;
  let unmapped: string[];
  try {
    await legacyConn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await legacyConn.query("START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT");
    ({ data: legacy, unmapped } = await readLegacy(legacyConn, flag("allow-unmapped")));
    await legacyConn.query("COMMIT");
  } finally {
    await legacyConn.end();
  }

  const v2 = transformLegacy(legacy);
  const summary = {
    legacy: Object.fromEntries(Object.entries(legacy).map(([k, rows]) => [k, rows.length])),
    v2: summarize(v2),
    unmapped,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (dryRun || !targetUrl) {
    if (reportPath) writeFileSync(reportPath, JSON.stringify({ ...summary, issues: v2.issues }, null, 2));
    console.log("dry-run: 대상 DB 에 쓰지 않았습니다.");
    return;
  }

  const target = await mysql.createConnection({ uri: targetUrl, dateStrings: true, supportBigNumbers: true });
  try {
    await assertTargetReady(target, flag("reset-target"));
    await writeTarget(target, v2);
    console.log("대상 DB 쓰기 완료. 검증을 시작합니다.");
    const problems = await verifyMigration(target, legacy, v2);
    if (reportPath) writeFileSync(reportPath, JSON.stringify({ ...summary, problems, issues: v2.issues }, null, 2));
    if (problems.length > 0) {
      console.error(`검증 실패 ${problems.length}건:\n  ${problems.slice(0, 50).join("\n  ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("검증 통과: 레거시와 v2 데이터가 일치합니다.");
  } finally {
    await target.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
