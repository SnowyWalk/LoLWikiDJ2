import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { env } from "../config";
import { logger } from "../logger";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

/**
 * 서버 시작 시 db/migrations/*.sql 중 아직 적용되지 않은 것을 순서대로 적용한다.
 * (scripts/db/migrate.ts 와 같은 규칙, 기록은 schema_migrations)
 */
export async function applyMigrations(): Promise<void> {
  if (!env.DB_USER) {
    logger.warn("DB_USER 가 없어 DB 마이그레이션을 건너뜁니다");
    return;
  }
  if (!existsSync(MIGRATIONS_DIR)) throw new Error(`마이그레이션 폴더가 없습니다: ${MIGRATIONS_DIR}`);

  // DDL 여러 문장을 한 번에 실행하기 위해 풀과 별개의 연결을 쓴다.
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
    charset: "utf8mb4",
  });
  try {
    // 여러 인스턴스가 동시에 떠도 한 번만 적용되도록 잠근다.
    await conn.query("SELECT GET_LOCK('dj2_schema_migrations', 60)");
    const [tables] = await conn.query<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations'",
    );
    const applied = new Set<string>();
    if (tables.length > 0) {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT version FROM schema_migrations");
      for (const row of rows) applied.add(row.version as string);
    }
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) continue;
      logger.info({ version }, "DB 마이그레이션 적용");
      await conn.query(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
      await conn.query("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('dj2_schema_migrations')").catch(() => {});
    await conn.end();
  }
}
