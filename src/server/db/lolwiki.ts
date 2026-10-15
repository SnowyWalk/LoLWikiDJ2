// 롤백 게시판 북마크(아카이브)·유저 메모. 레거시 LoLWikiArchive / LoLWikiMemos 와 같은 결과 형식으로 돌려준다.
import type { RowDataPacket } from "mysql2/promise";
import { requirePool } from "./tx";

const LIST_COLUMNS = ["post_seq", "icon_img", "badge_use", "post_title", "nickname", "post_date", "likes", "reply_cnt", "youtube_url", "doodlr", "pic_new", "pic_multi", "views"];

export interface BookmarkPost {
  post_seq: string | number;
  icon_img?: string;
  badge_use?: string | number;
  post_title?: string;
  nickname?: string;
  post_date?: string;
  likes?: string | number;
  replys?: unknown;
  youtube_url?: string;
  doodlr?: string | number;
  pic_new?: string;
  pic_multi?: string;
  post_text?: string;
  views?: string | number;
  doodlrurls?: string;
  fixedpic?: string;
  stack?: string | number;
  reply_cnt?: string | number;
}

const str = (v: unknown) => (v === undefined || v === null ? null : String(v));

/** 레거시는 같은 글을 여러 번 북마크하면 행이 늘었지만, 이제는 (owner, post_seq) 하나로 최신 내용만 보관한다. */
export async function addBookmark(owner: string, p: BookmarkPost) {
  const detail = {
    post_text: str(p.post_text),
    replys: JSON.stringify(p.replys ?? []), // 레거시: JSON.stringify(post_data.replys) 를 그대로 저장
    doodlrurls: str(p.doodlrurls),
    fixedpic: str(p.fixedpic),
    stack: str(p.stack),
  };
  await requirePool().query(
    `INSERT INTO lolwiki_bookmarks (owner, post_seq, post_title, nickname, icon_img, badge_use, post_date, likes, views, reply_cnt, youtube_url, doodlr, pic_new, pic_multi, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE post_title = VALUES(post_title), nickname = VALUES(nickname), icon_img = VALUES(icon_img),
       badge_use = VALUES(badge_use), post_date = VALUES(post_date), likes = VALUES(likes), views = VALUES(views),
       reply_cnt = VALUES(reply_cnt), youtube_url = VALUES(youtube_url), doodlr = VALUES(doodlr), pic_new = VALUES(pic_new),
       pic_multi = VALUES(pic_multi), detail = VALUES(detail)`,
    [owner, String(p.post_seq), str(p.post_title), str(p.nickname), str(p.icon_img), str(p.badge_use), str(p.post_date), str(p.likes), str(p.views), str(p.reply_cnt), str(p.youtube_url), str(p.doodlr), str(p.pic_new), str(p.pic_multi), JSON.stringify(detail)],
  );
}

export async function removeBookmark(owner: string, postSeq: string | number) {
  await requirePool().query("DELETE FROM lolwiki_bookmarks WHERE owner = ? AND post_seq = ? LIMIT 1", [owner, String(postSeq)]);
}

export async function isBookmarked(owner: string, postSeq: string | number) {
  const [rows] = await requirePool().query<RowDataPacket[]>(
    "SELECT 1 FROM lolwiki_bookmarks WHERE owner = ? AND post_seq = ? LIMIT 1",
    [owner, String(postSeq)],
  );
  return rows.length > 0;
}

/** 레거시 lol_bookmark_list 형식 (최신 북마크 먼저) */
export async function listBookmarks(owner: string, offset: number, count: number) {
  const [rows] = await requirePool().query<RowDataPacket[]>(
    `SELECT owner AS Owner, ${LIST_COLUMNS.join(", ")} FROM lolwiki_bookmarks WHERE owner = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
    [owner, Math.max(0, Math.min(100, Number(count) || 0)), Math.max(0, Number(offset) || 0)],
  );
  return rows.map((r) => ({ ...r }));
}

/** 레거시 lol_bookmark_archived 형식 (상세 + isBookmarked) */
export async function getArchivedBookmark(owner: string, postSeq: string | number) {
  const [rows] = await requirePool().query<RowDataPacket[]>(
    `SELECT post_seq, icon_img, badge_use, post_title, nickname, post_date, likes, youtube_url, doodlr, pic_new, pic_multi, views, detail
     FROM lolwiki_bookmarks WHERE owner = ? AND post_seq = ? LIMIT 1`,
    [owner, String(postSeq)],
  );
  if (rows.length === 0) return undefined;
  const { detail, ...rest } = rows[0];
  const d = (typeof detail === "string" ? JSON.parse(detail) : detail) ?? {};
  return { ...rest, ...d, isBookmarked: true };
}

/** 레거시 lol_get_user_memos: { "<작성자 id>": "메모" } */
export async function getUserMemos(owner: string): Promise<Record<string, string>> {
  const [rows] = await requirePool().query<RowDataPacket[]>("SELECT target, memo FROM lolwiki_memos WHERE owner = ?", [owner]);
  return Object.fromEntries(rows.map((r) => [r.target as string, r.memo as string]));
}

export async function setUserMemo(owner: string, target: string, memo: string) {
  await requirePool().query(
    "INSERT INTO lolwiki_memos (owner, target, memo) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE memo = VALUES(memo)",
    [owner, target, memo],
  );
}
