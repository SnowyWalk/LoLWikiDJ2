// 유튜브 Data API 조회 (레거시 request_youtube_video / request_youtube_playlist)
import { env } from "../config";
import { parseIsoDuration } from "../legacy/util";

export interface YoutubeVideoData {
  title: string;
  author: string;
  thumbnail_url: string;
  duration: number;
  embeddable: boolean;
  tags: string[];
}

export class YoutubeQueryError extends Error {}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new YoutubeQueryError(`YouTube API ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

interface VideoItem {
  snippet: { localized: { title: string }; channelTitle: string; thumbnails: { high: { url: string } }; tags?: string[] };
  contentDetails: { duration: string };
  status: { embeddable: boolean };
}

function toVideoData(item: VideoItem): YoutubeVideoData {
  // 레거시: 따옴표는 전각 따옴표로 바꿔 저장했다.
  return {
    title: item.snippet.localized.title.replace(/("|')/g, "＂"),
    author: item.snippet.channelTitle.replace(/("|')/g, "＂"),
    thumbnail_url: item.snippet.thumbnails.high.url,
    duration: parseIsoDuration(item.contentDetails.duration),
    embeddable: item.status.embeddable,
    tags: item.snippet.tags ?? [],
  };
}

/** 영상 하나 조회. 없는 영상이면 null */
export async function fetchYoutubeVideo(videoId: string): Promise<YoutubeVideoData | null> {
  if (!env.YOUTUBE_API_KEY) throw new YoutubeQueryError("YOUTUBE_API_KEY 가 설정되지 않았습니다");
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.search = new URLSearchParams({
    key: env.YOUTUBE_API_KEY,
    part: "id,snippet,contentDetails,status",
    regionCode: "KR",
    hl: "ko",
    id: videoId,
  }).toString();
  const body = await getJson(url.toString());
  const item = (body.items as VideoItem[] | undefined)?.[0];
  return item ? toVideoData(item) : null;
}

/** 유튜브 재생목록의 영상 id 들 (최대 500개, 레거시와 같음) */
export async function fetchYoutubePlaylistVideoIds(playlistId: string): Promise<string[]> {
  if (!env.YOUTUBE_API_KEY) throw new YoutubeQueryError("YOUTUBE_API_KEY 가 설정되지 않았습니다");
  const ids: string[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.search = new URLSearchParams({
      key: env.YOUTUBE_API_KEY,
      part: "contentDetails",
      maxResults: "50",
      playlistId,
      pageToken,
    }).toString();
    const body = await getJson(url.toString());
    for (const item of (body.items as { contentDetails: { videoId: string } }[]) ?? []) ids.push(item.contentDetails.videoId);
    pageToken = (body.nextPageToken as string | undefined) ?? "";
    if (!pageToken) break;
  }
  return ids;
}
