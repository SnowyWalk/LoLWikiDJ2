import mysql, { type Pool } from "mysql2/promise";
import { env } from "../config";

let pool: Pool | null = null;

/** DB 설정(DB_USER)이 없으면 null — 로컬에서 DB 없이 화면 작업할 때. */
export function getPool(): Pool | null {
  if (!env.DB_USER) return null;
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      charset: "utf8mb4",
      connectionLimit: 10,
      waitForConnections: true,
      enableKeepAlive: true,
      dateStrings: true,
      timezone: "+09:00",
    });
  }
  return pool;
}

export async function pingDb(): Promise<"ok" | "disabled" | "error"> {
  const p = getPool();
  if (!p) return "disabled";
  try {
    await p.query("SELECT 1");
    return "ok";
  } catch {
    return "error";
  }
}

export async function closePool() {
  await pool?.end();
  pool = null;
}
