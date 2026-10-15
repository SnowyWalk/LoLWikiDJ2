// 채널은 경로로 구분한다: "/" = 기본 채널, "/1004" = 1004 채널.
// 0 ~ 100000 사이의 정수면 어떤 번호든 채널이 된다 (방은 처음 접속할 때 만들어진다).
export const DEFAULT_CHANNEL = "8080";
export const MIN_CHANNEL = 0;
export const MAX_CHANNEL = 100000;

export type ChannelId = string & { readonly __brand: "ChannelId" };

/** 앞자리 0 없는 십진수(예: "0", "1004")이고 범위 안이면 채널 id. "01004" 같은 표기는 받지 않는다. */
export function isChannelId(value: unknown): value is ChannelId {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,5})$/.test(value)) return false;
  const n = Number(value);
  return n >= MIN_CHANNEL && n <= MAX_CHANNEL;
}

export const DEFAULT_CHANNEL_ID = DEFAULT_CHANNEL as ChannelId;

export function channelPath(channel: ChannelId): string {
  return channel === DEFAULT_CHANNEL ? "/" : `/${channel}`;
}
