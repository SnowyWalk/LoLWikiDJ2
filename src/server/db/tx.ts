import type { Pool, PoolConnection } from "mysql2/promise";
import { getPool } from "./pool";

export function requirePool(): Pool {
  const pool = getPool();
  if (!pool) throw new Error("DB 가 설정되지 않았습니다 (DB_USER)");
  return pool;
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await requirePool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}
