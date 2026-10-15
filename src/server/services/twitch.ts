// 트위치 Helix API (레거시 twitch_get_video_info / twitch_get_stream_info)
import { env } from "../config";
import { parseIsoDuration } from "../legacy/util";

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_SECRET) throw new Error("TWITCH_CLIENT_ID / TWITCH_SECRET 가 설정되지 않았습니다");
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_SECRET, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Twitch token ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function helix<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
    headers: { "Client-Id": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${await accessToken()}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Twitch ${path} ${res.status}`);
  return (await res.json()) as T;
}

export async function twitchVideoInfo(videoId: string) {
  const body = await helix<{ data: { user_name: string; title: string; thumbnail_url: string; duration: string }[] }>(
    `videos?id=${encodeURIComponent(videoId)}`,
  );
  const v = body.data[0];
  if (!v) throw new Error("트위치 영상 없음");
  return {
    author: v.user_name,
    title: v.title,
    thumbnail_url: v.thumbnail_url.replace("%{width}", "1196").replace("%{height}", "896"),
    duration: parseIsoDuration(v.duration), // '3m21s' 도 같은 정규식으로 파싱된다
  };
}

export async function twitchStreamInfo(channel: string) {
  const body = await helix<{ data: { display_name: string; title: string; thumbnail_url: string }[] }>(
    `search/channels?query=${encodeURIComponent(channel)}&first=1&live_only=true`,
  );
  const c = body.data[0];
  if (!c) throw new Error("트위치 방송 없음");
  return { author: c.display_name, title: c.title, thumbnail_url: c.thumbnail_url, duration: 0 };
}
