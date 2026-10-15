import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { logger } from "../logger";
import { fetchYoutubeVideo } from "../services/youtube";
import { requirePool } from "./tx";

export interface VideoRecord {
  id: number;
  youtube_id: string;
  title: string;
  duration_sec: number;
  thumbnail_url: string | null;
  author: string | null;
}

export async function findVideoById(id: number): Promise<VideoRecord | null> {
  const [rows] = await requirePool().query<RowDataPacket[]>(
    "SELECT id, youtube_id, title, duration_sec, thumbnail_url, author FROM videos WHERE id = ? LIMIT 1",
    [id],
  );
  return (rows[0] as VideoRecord | undefined) ?? null;
}

/** 레거시 get_video_index 결과 원소: Id 가 있으면 등록 성공, Name 만 있으면 외부 재생 제한, 둘 다 없으면 조회 실패 */
export interface VideoIndexResult {
  VideoId: string;
  Id: number;
  Name: string;
  Length: number;
  Author?: string | null;
}

/**
 * 유튜브 id 들을 videos.id 로 바꾼다. DB 에 없는 영상은 유튜브에서 조회해 등록한다.
 * (레거시 get_video_index 와 같은 결과 형식)
 */
export async function resolveVideoIds(youtubeIds: string[]): Promise<VideoIndexResult[]> {
  const result: VideoIndexResult[] = youtubeIds.map((id) => ({ VideoId: id, Id: 0, Name: "", Length: 0 }));
  if (youtubeIds.length === 0) return result;

  const [rows] = await requirePool().query<RowDataPacket[]>(
    "SELECT id, youtube_id, title, duration_sec, author FROM videos WHERE youtube_id IN (?)",
    [youtubeIds],
  );
  const known = new Map(rows.map((r) => [r.youtube_id as string, r]));
  for (const entry of result) {
    const row = known.get(entry.VideoId);
    if (!row) continue;
    entry.Id = Number(row.id);
    entry.Name = row.title as string;
    entry.Length = Number(row.duration_sec);
    entry.Author = row.author as string | null;
  }

  await Promise.all(
    result
      .filter((e) => !e.Id)
      .map(async (entry) => {
        const data = await fetchYoutubeVideo(entry.VideoId).catch((error) => {
          logger.warn({ err: error, videoId: entry.VideoId }, "유튜브 조회 실패");
          return null;
        });
        if (!data) return;
        entry.Name = data.title;
        entry.Length = data.duration;
        entry.Author = data.author;
        if (!data.embeddable) return; // 외부 재생 제한 영상은 등록하지 않는다
        // 동시에 같은 영상이 등록돼도 youtube_id UNIQUE 로 한 행만 남는다 (레거시의 중복 등록 문제 해결)
        await requirePool().query<ResultSetHeader>(
          `INSERT INTO videos (youtube_id, title, duration_sec, thumbnail_url, author) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
          [entry.VideoId, data.title.slice(0, 255), data.duration, data.thumbnail_url, data.author],
        ).then(([res]) => {
          entry.Id = res.insertId;
        });
      }),
  );
  return result;
}
