// 레거시(LoLWikiDJ_DB) 행 → v2 스키마 행 변환. DB 입출력 없는 순수 함수만 둔다.
//
// 원칙: 레거시 데이터를 버리지 않는다.
//   새 스키마 제약에 맞지 않는 데이터(깨진 참조, 중복 등)는 issues 로 원본 그대로 남기고,
//   migrate-legacy.ts 가 이를 legacy_migration_issues 테이블에 저장한다.

export const POSITION_STEP = 1024;

type Row = Record<string, unknown>;

export interface LegacyData {
  accounts: Row[];
  icons: Row[];
  playlists: Row[];
  videos: Row[];
  bans: Row[];
  secures: Row[];
  archive: Row[];
  memos: Row[];
}

export interface Issue {
  kind: string;
  source: string;
  sourceKey: string | null;
  payload: unknown;
  note: string;
}

export interface UserRow {
  id: number;
  name: string;
  password_hash: string | null;
  icon_id: number | null;
  icon_ver: number;
  current_playlist_id: number | null;
  like_playlist_id: number | null;
}
export interface VideoRow {
  id: number;
  youtube_id: string;
  title: string;
  duration_sec: number;
  thumbnail_url: string | null;
  author: string | null;
}
export interface PlaylistRow {
  id: number;
  owner_id: number | null;
  name: string;
  sort_order: number;
  item_count: number;
  deleted: boolean;
}
export interface ItemRow {
  playlist_id: number;
  video_id: number;
  position: number;
}
export interface BanRow {
  ip_pattern: string;
  reason: string | null;
  comment: string | null;
}
export interface IpStatRow {
  ip: string;
  user_name: string;
  connect_count: number;
  first_login: string | null;
  last_login: string | null;
}
export interface IpNoteRow {
  ip: string;
  comment: string;
}
export interface BookmarkRow {
  id: number;
  owner: string;
  post_seq: string;
  post_title: string | null;
  nickname: string | null;
  icon_img: string | null;
  badge_use: string | null;
  post_date: string | null;
  likes: string | null;
  views: string | null;
  reply_cnt: string | null;
  youtube_url: string | null;
  doodlr: string | null;
  pic_new: string | null;
  pic_multi: string | null;
  detail: Record<string, unknown>;
}
export interface MemoRow {
  owner: string;
  target: string;
  memo: string;
}

export interface V2Data {
  users: UserRow[];
  videos: VideoRow[];
  playlists: PlaylistRow[];
  items: ItemRow[];
  bans: BanRow[];
  ipStats: IpStatRow[];
  ipNotes: IpNoteRow[];
  bookmarks: BookmarkRow[];
  memos: MemoRow[];
  issues: Issue[];
  /** 중복 제거로 다른 id 로 합쳐진 레거시 영상 id → 남은 id */
  videoIdRemap: Map<number, number>;
}

// ---------- 값 변환 헬퍼 ----------

/** 레거시 JSON 컬럼은 mysql2 가 파싱한 값이거나, 문자열로 저장된 JSON 일 수 있다. */
export function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    // 레거시 코드는 JSON5 로 읽었다 (작은따옴표 등). 가장 흔한 경우만 보정한다.
    try {
      return JSON.parse(text.replace(/'/g, '"'));
    } catch {
      return undefined;
    }
  }
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return formatDate(value);
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 'YYYY-MM-DD HH:MM:SS' 형태만 DATETIME 으로 인정한다. */
function toDateTime(value: unknown): string | null {
  const text = toStr(value)?.trim().replace("T", " ");
  if (!text) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}(?::\d{2})?))?/.exec(text);
  if (!match) return null;
  const time = match[2] ? (match[2].length === 5 ? `${match[2]}:00` : match[2]) : "00:00:00";
  return `${match[1]} ${time}`;
}

function truthy(value: unknown): boolean {
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "" && value !== "0";
  if (Buffer.isBuffer(value)) return value.length > 0 && value[0] !== 0;
  return Boolean(value);
}

/**
 * 사용자 이름 키. 레거시 Accounts.Name 은 이미 DB(utf8mb4_unicode_ci) 기준으로 유일하므로 원문 그대로 쓴다.
 * 아이콘↔계정 연결처럼 DB 의 비교 규칙이 필요한 곳은 migrate-legacy.ts 가 레거시 DB 에서
 * 직접 JOIN 해서 Icons 행에 __account 로 붙여 준다 (JS 로 collation 을 흉내 내지 않는다).
 */
export function nameKey(name: string): string {
  return name;
}

// ---------- 변환 ----------

export function transformLegacy(legacy: LegacyData): V2Data {
  const issues: Issue[] = [];
  const issue = (kind: string, source: string, sourceKey: unknown, payload: unknown, note: string) =>
    issues.push({ kind, source, sourceKey: sourceKey === null || sourceKey === undefined ? null : String(sourceKey), payload, note });

  // --- videos: youtube_id 기준 중복 제거 (가장 작은 id 를 남기고 나머지는 참조를 옮긴다)
  const videos: VideoRow[] = [];
  const videoIdRemap = new Map<number, number>();
  const videoById = new Map<number, VideoRow>();
  const videoByYoutube = new Map<string, VideoRow>();
  const sortedVideos = [...legacy.videos].sort((a, b) => (toInt(a.Id) ?? 0) - (toInt(b.Id) ?? 0));
  for (const row of sortedVideos) {
    const id = toInt(row.Id);
    const youtubeId = toStr(row.VideoId)?.trim() ?? "";
    if (id === null || youtubeId === "") {
      issue("invalid_video", "Videos", row.Id, row, "Id 또는 VideoId 가 비어 있음");
      continue;
    }
    const existing = videoByYoutube.get(youtubeId);
    if (existing) {
      videoIdRemap.set(id, existing.id);
      issue("duplicate_video", "Videos", id, row, `VideoId 중복 → Id ${existing.id} 로 합침`);
      continue;
    }
    const video: VideoRow = {
      id,
      youtube_id: youtubeId,
      title: toStr(row.Name) ?? "제목 없음",
      duration_sec: Math.max(0, toInt(row.Length) ?? 0),
      thumbnail_url: toStr(row.Thumbnail),
      author: toStr(row.Author),
    };
    videos.push(video);
    videoById.set(id, video);
    videoByYoutube.set(youtubeId, video);
  }
  const resolveVideo = (legacyId: number): number | null => {
    const mapped = videoIdRemap.get(legacyId) ?? legacyId;
    return videoById.has(mapped) ? mapped : null;
  };

  // --- users: Accounts ∪ Icons (닉네임 기준)
  const users: UserRow[] = [];
  const userByName = new Map<string, UserRow>();
  const accountPlaylistIds = new Map<UserRow, number[]>();
  const accountRaw = new Map<UserRow, Row>();
  let nextUserId = 1;
  for (const row of legacy.accounts) {
    const name = toStr(row.Name);
    if (!name) {
      issue("invalid_account", "Accounts", null, row, "Name 이 비어 있음");
      continue;
    }
    const key = nameKey(name);
    if (userByName.has(key)) {
      issue("duplicate_account", "Accounts", name, row, "닉네임 중복 (대소문자만 다름)");
      continue;
    }
    const user: UserRow = {
      id: nextUserId++,
      name,
      password_hash: toStr(row.Password),
      icon_id: null,
      icon_ver: 1,
      current_playlist_id: null,
      like_playlist_id: null,
    };
    users.push(user);
    userByName.set(key, user);
    accountRaw.set(user, row);

    const parsed = parseJsonValue(row.Playlists);
    const ids: number[] = [];
    if (parsed === null || parsed === undefined) {
      if (row.Playlists !== null && row.Playlists !== undefined)
        issue("unparsable_json", "Accounts", name, { Playlists: row.Playlists }, "Playlists JSON 파싱 실패");
    } else if (!Array.isArray(parsed)) {
      issue("unparsable_json", "Accounts", name, { Playlists: row.Playlists }, "Playlists 가 배열이 아님");
    } else {
      for (const value of parsed) {
        const id = toInt(value);
        if (id === null) issue("invalid_playlist_ref", "Accounts", name, { value }, "Playlists 원소가 정수가 아님");
        else ids.push(id);
      }
    }
    accountPlaylistIds.set(user, ids);
  }

  const usedIconIds = new Set<number>();
  for (const row of legacy.icons) {
    const name = toStr(row.Name);
    const iconId = toInt(row.Id);
    if (!name || iconId === null) {
      issue("invalid_icon", "Icons", row.Id, row, "Name 또는 Id 가 비어 있음");
      continue;
    }
    // 레거시 DB 가 같은 사람으로 판단한 계정 이름 (Icons.Name = Accounts.Name, 레거시 collation 기준)
    const accountName = toStr(row.__account) ?? name;
    let user = userByName.get(nameKey(accountName));
    if (!user) {
      // 계정 없이 아이콘만 있는 닉네임도 사용자로 만든다 (다음 로그인 때 그대로 이어지도록).
      user = { id: nextUserId++, name, password_hash: null, icon_id: null, icon_ver: 1, current_playlist_id: null, like_playlist_id: null };
      users.push(user);
      userByName.set(nameKey(name), user);
      accountPlaylistIds.set(user, []);
    }
    if (user.icon_id !== null || usedIconIds.has(iconId)) {
      issue("duplicate_icon", "Icons", iconId, row, "같은 닉네임/아이콘 id 의 아이콘이 이미 있음");
      continue;
    }
    user.icon_id = iconId;
    user.icon_ver = Math.max(1, toInt(row.Ver) ?? 1);
    usedIconIds.add(iconId);
  }

  // --- playlists: 소유자는 Accounts.Playlists 배열로 정해진다
  const legacyPlaylistById = new Map<number, Row>();
  for (const row of legacy.playlists) {
    const id = toInt(row.Id);
    if (id === null) {
      issue("invalid_playlist", "Playlists", row.Id, row, "Id 가 비어 있음");
      continue;
    }
    legacyPlaylistById.set(id, row);
  }

  const ownerOf = new Map<number, { user: UserRow; order: number }>();
  for (const user of users) {
    const ids = accountPlaylistIds.get(user) ?? [];
    let order = 0;
    for (const playlistId of ids) {
      if (!legacyPlaylistById.has(playlistId)) {
        issue("missing_playlist_ref", "Accounts", user.name, { playlist_id: playlistId }, "Playlists 배열이 존재하지 않는 재생목록을 가리킴");
        continue;
      }
      const owner = ownerOf.get(playlistId);
      if (owner) {
        if (owner.user !== user)
          issue("shared_playlist_ref", "Accounts", user.name, { playlist_id: playlistId, first_owner: owner.user.name }, "여러 계정이 같은 재생목록을 가짐 → 첫 계정 소유로 둠");
        else issue("duplicate_playlist_ref", "Accounts", user.name, { playlist_id: playlistId }, "Playlists 배열에 같은 id 가 중복");
        continue;
      }
      ownerOf.set(playlistId, { user, order: order++ });
    }
  }

  const playlists: PlaylistRow[] = [];
  const items: ItemRow[] = [];
  for (const [id, row] of [...legacyPlaylistById].sort((a, b) => a[0] - b[0])) {
    const owner = ownerOf.get(id);
    const deleted = truthy(row.Deleted);
    if (!owner && !deleted)
      issue("orphan_playlist", "Playlists", id, { Name: row.Name }, "어떤 계정에도 속하지 않은 재생목록 (owner 없이 보존)");

    const parsed = parseJsonValue(row.VideoList);
    let videoList: unknown[] = [];
    if (Array.isArray(parsed)) videoList = parsed;
    else if (row.VideoList !== null && row.VideoList !== undefined)
      issue("unparsable_json", "Playlists", id, { VideoList: row.VideoList }, "VideoList JSON 파싱 실패");

    let count = 0;
    videoList.forEach((value, index) => {
      const legacyVideoId = toInt(value);
      const videoId = legacyVideoId === null ? null : resolveVideo(legacyVideoId);
      if (videoId === null) {
        issue("dangling_playlist_item", "Playlists", id, { index, value }, "VideoList 가 존재하지 않는 영상을 가리킴");
        return;
      }
      // 원래 인덱스를 그대로 위치로 써서 빠진 항목이 있어도 순서가 보존된다.
      items.push({ playlist_id: id, video_id: videoId, position: (index + 1) * POSITION_STEP });
      count++;
    });

    playlists.push({
      id,
      owner_id: owner ? owner.user.id : null,
      name: toStr(row.Name) ?? "새 재생목록",
      sort_order: owner ? owner.order : 0,
      item_count: count,
      deleted,
    });
  }

  // --- 현재/좋아요 재생목록
  const playlistIds = new Set(playlists.map((p) => p.id));
  for (const [user, row] of accountRaw) {
    const current = toInt(row.CurrentPlaylist);
    if (current !== null && current !== 0) {
      if (playlistIds.has(current)) user.current_playlist_id = current;
      else issue("missing_playlist_ref", "Accounts", user.name, { CurrentPlaylist: current }, "CurrentPlaylist 가 존재하지 않는 재생목록");
    }
    const like = toInt(row.LikePlaylist);
    if (like !== null && like !== 0) {
      if (playlistIds.has(like)) user.like_playlist_id = like;
      else issue("missing_playlist_ref", "Accounts", user.name, { LikePlaylist: like }, "LikePlaylist 가 존재하지 않는 재생목록");
    }
  }

  // --- bans
  const bans: BanRow[] = [];
  for (const row of legacy.bans) {
    const ip = toStr(row.IP)?.trim();
    if (!ip) {
      issue("invalid_ban", "Bans", null, row, "IP 가 비어 있음");
      continue;
    }
    bans.push({ ip_pattern: ip, reason: toStr(row.Reason), comment: toStr(row.Comment) });
  }

  // --- secures → ip_user_stats / ip_notes
  const ipStats = new Map<string, IpStatRow>();
  const ipNotes: IpNoteRow[] = [];
  for (const row of legacy.secures) {
    const ip = toStr(row.IP)?.trim();
    if (!ip || ip.length > 45) {
      issue("invalid_secure", "Secures", row.IP, row, "IP 가 비었거나 너무 김");
      continue;
    }
    const comment = toStr(row.Comment);
    if (comment !== null && comment !== "") ipNotes.push({ ip, comment });

    const parsed = parseJsonValue(row.ConnectData);
    if (!Array.isArray(parsed)) {
      if (row.ConnectData !== null && row.ConnectData !== undefined)
        issue("unparsable_json", "Secures", ip, { ConnectData: row.ConnectData }, "ConnectData JSON 파싱 실패");
      continue;
    }
    for (const entry of parsed) {
      const data = (entry ?? {}) as Row;
      const userName = toStr(data.Name);
      if (!userName) {
        issue("invalid_secure_entry", "Secures", ip, entry, "ConnectData 원소에 Name 이 없음");
        continue;
      }
      if (userName.length > 255) {
        issue("oversized_secure_name", "Secures", ip, entry, "닉네임이 255자를 넘음 (초기 버전에서 채팅이 닉네임으로 기록된 경우) → 원본만 보존");
        continue;
      }
      // 레거시는 JS 에서 e.Name == socket.name 으로 정확히 비교했으므로 원문 그대로를 키로 쓴다.
      const key = `${ip}\u0000${userName}`;
      const stat: IpStatRow = {
        ip,
        user_name: userName,
        connect_count: Math.max(0, toInt(data.ConnectCount) ?? 0),
        first_login: toDateTime(data.CreationDate),
        last_login: toDateTime(data.LastLoginDate),
      };
      const existing = ipStats.get(key);
      if (existing) {
        // 같은 IP·닉네임이 두 번 기록된 경우 합친다 (횟수 합, 처음/마지막 접속은 범위로).
        issue("merged_secure_entry", "Secures", ip, entry, "같은 IP·닉네임 기록을 합침");
        existing.connect_count += stat.connect_count;
        existing.first_login = minDate(existing.first_login, stat.first_login);
        existing.last_login = maxDate(existing.last_login, stat.last_login);
      } else ipStats.set(key, stat);
    }
  }

  // --- LoLWikiArchive → lolwiki_bookmarks (owner+post_seq 중복이면 최신 No 만 남김)
  const bookmarks: BookmarkRow[] = [];
  const bookmarkByKey = new Map<string, BookmarkRow>();
  const archiveSorted = [...legacy.archive].sort((a, b) => (toInt(b.No) ?? 0) - (toInt(a.No) ?? 0));
  for (const row of archiveSorted) {
    const id = toInt(row.No);
    const owner = toStr(row.Owner);
    const postSeq = toStr(row.post_seq);
    if (id === null || !owner || !postSeq) {
      issue("invalid_bookmark", "LoLWikiArchive", row.No, row, "No/Owner/post_seq 가 비어 있음");
      continue;
    }
    const key = `${owner}\u0000${postSeq}`;
    if (bookmarkByKey.has(key)) {
      issue("duplicate_bookmark", "LoLWikiArchive", id, row, `같은 글 북마크 중복 → No ${bookmarkByKey.get(key)!.id} 만 남김`);
      continue;
    }
    const bookmark: BookmarkRow = {
      id,
      owner,
      post_seq: postSeq,
      post_title: toStr(row.post_title),
      nickname: toStr(row.nickname),
      icon_img: toStr(row.icon_img),
      badge_use: toStr(row.badge_use),
      post_date: toStr(row.post_date),
      likes: toStr(row.likes),
      views: toStr(row.views),
      reply_cnt: toStr(row.reply_cnt),
      youtube_url: toStr(row.youtube_url),
      doodlr: toStr(row.doodlr),
      pic_new: toStr(row.pic_new),
      pic_multi: toStr(row.pic_multi),
      // 상세 보기 필드는 레거시 값 그대로(문자열이면 문자열로) 보존한다.
      detail: {
        post_text: toStr(row.post_text),
        replys: toStr(row.replys),
        doodlrurls: toStr(row.doodlrurls),
        fixedpic: toStr(row.fixedpic),
        stack: toStr(row.stack),
      },
    };
    bookmarkByKey.set(key, bookmark);
    bookmarks.push(bookmark);
  }
  bookmarks.sort((a, b) => a.id - b.id);

  // --- LoLWikiMemos → lolwiki_memos
  const memos: MemoRow[] = [];
  const memoKeys = new Set<string>();
  for (const row of legacy.memos) {
    const owner = toStr(row.android_id);
    if (!owner) {
      issue("invalid_memo", "LoLWikiMemos", null, row, "android_id 가 비어 있음");
      continue;
    }
    if (memoKeys.has(`owner:${owner}`)) {
      issue("duplicate_memo_owner", "LoLWikiMemos", owner, row, "같은 android_id 레코드가 여러 개 → 첫 레코드만 펼치고 나머지는 원본 보존");
      continue;
    }
    memoKeys.add(`owner:${owner}`);
    const parsed = parseJsonValue(row.UserMemos);
    if (parsed === null || parsed === undefined) {
      if (row.UserMemos !== null && row.UserMemos !== undefined)
        issue("unparsable_json", "LoLWikiMemos", owner, { UserMemos: row.UserMemos }, "UserMemos JSON 파싱 실패");
      continue;
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      issue("unparsable_json", "LoLWikiMemos", owner, { UserMemos: row.UserMemos }, "UserMemos 가 객체가 아님");
      continue;
    }
    for (const [target, value] of Object.entries(parsed as Row)) {
      const memo = typeof value === "string" ? value : JSON.stringify(value);
      memos.push({ owner, target, memo });
    }
  }

  return {
    users,
    videos,
    playlists,
    items,
    bans,
    ipStats: [...ipStats.values()],
    ipNotes,
    bookmarks,
    memos,
    issues,
    videoIdRemap,
  };
}

function minDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
function maxDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
