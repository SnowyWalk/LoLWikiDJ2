/**
 * db/migrations/*.sql 을 순서대로 적용한다. 적용 기록은 schema_migrations 테이블.
 *
 *   DATABASE_URL=mysql://user:pass@host:3306/lolwikidj_v2 npx tsx scripts/db/migrate.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../db/migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 환경변수가 필요합니다");

  const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
  try {
    const [tables] = await conn.query<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations'",
    );
    const applied = new Set<string>();
    if (tables.length > 0) {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT version FROM schema_migrations");
      for (const row of rows) applied.add(row.version as string);
    }

    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) continue;
      console.log(`적용: ${file}`);
      // MySQL DDL 은 트랜잭션으로 묶이지 않으므로, 실패하면 해당 파일을 고친 뒤 빈 DB 에서 다시 적용한다.
      await conn.query(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
      await conn.query("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
    }
    console.log("스키마 최신 상태");
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
