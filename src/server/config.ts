import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  // X-Forwarded-For 를 신뢰할 프록시 단계 수 (nginx 1단)
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  DATA_DIR: z.string().default("./data"),

  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().default(""),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().default("lolwikidj_v2"),

  YOUTUBE_API_KEY: z.string().default(""),
  TWITCH_CLIENT_ID: z.string().default(""),
  TWITCH_SECRET: z.string().default(""),
  DANBOORU_LOGIN: z.string().default(""),
  DANBOORU_API_KEY: z.string().default(""),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().default(""),
  TOONATION_SESSION_ID: z.string().default(""),
  MASTER_IP: z.string().default(""),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
export const isDev = env.NODE_ENV !== "production";
