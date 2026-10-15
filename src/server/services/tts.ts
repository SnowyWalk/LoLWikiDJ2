// Google Cloud Text-to-Speech (레거시 make_tts 의 구글 음성 부분).
// 서비스 계정 키(GOOGLE_APPLICATION_CREDENTIALS)로 OAuth 토큰을 만들어 REST API 를 직접 호출한다 (무거운 SDK 불필요).
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config";

export const TTS_DIR = path.resolve(env.DATA_DIR, "tts");

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let account: ServiceAccount | null | undefined;
let token: { value: string; expiresAt: number } | null = null;

function loadAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const file = env.GOOGLE_APPLICATION_CREDENTIALS;
  account = file && existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ServiceAccount) : null;
  return account;
}

export function ttsEnabled() {
  return loadAccount() !== null;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const sa = loadAccount();
  if (!sa) throw new Error("TTS 서비스 계정 키가 없습니다");
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: tokenUri, iat: now, exp: now + 3600 }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key);
  const res = await fetch(tokenUri, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(signature)}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`TTS 토큰 발급 실패 ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

/** 레거시와 같은 설정(ko-KR, MP3)으로 음성을 만들어 {DATA_DIR}/tts/{hash} 에 저장한다. */
export async function synthesizeToFile(text: string, voiceName: string, hash: string): Promise<void> {
  const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "ko-KR", ssmlGender: "FEMALE", name: voiceName },
      audioConfig: { audioEncoding: "MP3" },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`TTS 합성 실패 ${res.status}`);
  const body = (await res.json()) as { audioContent: string };
  await mkdir(TTS_DIR, { recursive: true });
  await writeFile(path.join(TTS_DIR, hash), Buffer.from(body.audioContent, "base64"));
}
