// 채널 목록. 레거시에서는 포트(lolwiki.xyz:1004)로 채널을 나눴지만,
// 이제는 경로로 나눈다: "/" = 기본 채널, "/1004" = 1004 채널.
export const DEFAULT_CHANNEL = "8080";

export const CHANNEL_IDS = [
  DEFAULT_CHANNEL,
  "8081",
  "8082",
  "8083",
  "1004",
  "1111",
  "1128",
  "1224",
  "1337",
  "1557",
  "2250",
  "3939",
  "4010",
  "49415",
  "5599",
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === "string" && (CHANNEL_IDS as readonly string[]).includes(value);
}

export function channelPath(channel: ChannelId): string {
  return channel === DEFAULT_CHANNEL ? "/" : `/${channel}`;
}
