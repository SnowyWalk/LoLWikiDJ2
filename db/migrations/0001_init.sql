-- LoLWiki.DJ v2 스키마
--
-- 레거시(LoLWikiDJ_DB)와의 대응:
--   Accounts + Icons        → users              (닉네임 단위 계정, 아이콘 id/버전 통합)
--   Accounts.Playlists(JSON)→ playlists.owner_id + playlists.sort_order
--   Playlists.VideoList(JSON)→ playlist_items      (곡 하나 = 행 하나)
--   Videos                  → videos              (youtube_id UNIQUE)
--   Bans                    → bans
--   Secures(JSON)           → ip_user_stats + ip_notes
--   LoLWikiArchive          → lolwiki_bookmarks
--   LoLWikiMemos(JSON)      → lolwiki_memos       (메모 하나 = 행 하나)
--
-- 레거시 id(Playlists.Id, Videos.Id, Icons.Id)는 그대로 보존한다.
--   - 아이콘 파일이 static/icon/{Icons.Id}.png 로 저장되어 있어 icon_id 를 바꾸면 안 된다.
--   - 마이그레이션 검증을 id 기준으로 1:1 비교할 수 있다.

SET NAMES utf8mb4;

CREATE TABLE users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(32)  NOT NULL,
  password_hash       VARCHAR(128) NULL,              -- 레거시 Accounts.Password (미사용 기능, 값 보존)
  icon_id             INT UNSIGNED NULL,              -- static/icon/{icon_id}.png
  icon_ver            INT UNSIGNED NOT NULL DEFAULT 1,
  current_playlist_id INT UNSIGNED NULL,
  like_playlist_id    INT UNSIGNED NULL,
  playlist_rev        INT UNSIGNED NOT NULL DEFAULT 0, -- 이 유저의 재생목록이 바뀔 때마다 +1 (클라이언트 캐시 검증용)
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- 레거시 Accounts.Name 과 같은 collation(대소문자·악센트 무시) 으로 유일성 유지
  UNIQUE KEY uq_users_name (name),
  UNIQUE KEY uq_users_icon (icon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE videos (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  youtube_id    VARCHAR(64)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, -- 유튜브 id 는 대소문자 구분
  title         VARCHAR(255) NOT NULL DEFAULT '제목 없음',
  duration_sec  INT UNSIGNED NOT NULL DEFAULT 0,
  thumbnail_url VARCHAR(512) NULL,
  author        VARCHAR(255) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_videos_youtube (youtube_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE playlists (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id    INT UNSIGNED NULL,           -- 레거시에서 어떤 계정에도 속하지 않던 재생목록은 NULL
  name        VARCHAR(100) NOT NULL DEFAULT '새 재생목록',
  sort_order  INT          NOT NULL DEFAULT 0, -- 유저의 재생목록 목록에서의 순서 (레거시 Accounts.Playlists 배열 순서)
  item_count  INT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at  DATETIME     NULL,           -- 레거시 Deleted=1 (소프트 삭제, 데이터 보존)
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_playlists_owner (owner_id, deleted_at, sort_order),
  CONSTRAINT fk_playlists_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD CONSTRAINT fk_users_current_playlist FOREIGN KEY (current_playlist_id) REFERENCES playlists (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_users_like_playlist    FOREIGN KEY (like_playlist_id)    REFERENCES playlists (id) ON DELETE SET NULL;

-- 곡 하나 = 행 하나.
-- position 은 간격(1024)을 둔 정렬 키라서 이동/순환(재생 후 맨 뒤로)이 행 하나 UPDATE 로 끝난다.
-- 같은 영상이 한 재생목록에 여러 번 들어갈 수 있으므로(레거시 허용) 행 id 를 따로 둔다.
CREATE TABLE playlist_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  playlist_id INT UNSIGNED    NOT NULL,
  video_id    INT UNSIGNED    NOT NULL,
  position    BIGINT          NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_items_order (playlist_id, position),
  KEY ix_items_video (video_id),
  CONSTRAINT fk_items_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (id),
  CONSTRAINT fk_items_video    FOREIGN KEY (video_id)    REFERENCES videos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 레거시 Bans: IP 는 LIKE 패턴(예: '1.2.%')으로 비교됐으므로 패턴 그대로 보존한다.
CREATE TABLE bans (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip_pattern VARCHAR(64)  NOT NULL,
  reason     TEXT         NULL,
  comment    TEXT         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_bans_ip (ip_pattern)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 레거시 Secures.ConnectData([{Name, ConnectCount, CreationDate, LastLoginDate}]) 를 행으로 펼친 것.
-- 로그인마다 JSON 전체를 다시 쓰던 것을 INSERT ... ON DUPLICATE KEY UPDATE 한 번으로 바꾼다.
CREATE TABLE ip_user_stats (
  ip            VARCHAR(45) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  user_name     VARCHAR(255) COLLATE utf8mb4_0900_bin NOT NULL, -- 레거시는 JS 에서 정확히 같은 문자열로 비교했다(끝 공백도 구분: NO PAD). 계정이 없어진 닉네임도 기록이 남도록 이름으로 보존 (레거시 기록엔 32자 넘는 이름도 있음)
  connect_count INT UNSIGNED NOT NULL DEFAULT 0,
  first_login   DATETIME     NULL,
  last_login    DATETIME     NULL,
  PRIMARY KEY (ip, user_name),
  KEY ix_ip_stats_user (user_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ip_notes (
  ip      VARCHAR(45) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  comment TEXT NULL,
  PRIMARY KEY (ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 레거시 LoLWikiArchive (롤백 게시글 북마크/아카이브).
-- 목록 화면에 쓰는 컬럼은 그대로 두고, 상세 보기 전용 필드는 detail JSON 으로 묶는다.
CREATE TABLE lolwiki_bookmarks (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,   -- 레거시 No (목록 정렬 기준)
  owner       VARCHAR(128) NOT NULL,                  -- 레거시 Owner (롤백 android_id / user key)
  post_seq    VARCHAR(64)  NOT NULL,
  post_title  TEXT         NULL,
  nickname    VARCHAR(255) NULL,
  icon_img    TEXT         NULL,
  badge_use   VARCHAR(32)  NULL,
  post_date   VARCHAR(64)  NULL,
  likes       VARCHAR(32)  NULL,
  views       VARCHAR(32)  NULL,
  reply_cnt   VARCHAR(32)  NULL,
  youtube_url TEXT         NULL,
  doodlr      VARCHAR(32)  NULL,
  pic_new     TEXT         NULL,
  pic_multi   TEXT         NULL,
  detail      JSON         NULL,                      -- {post_text, replys, doodlrurls, fixedpic, stack}
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookmarks_owner_post (owner, post_seq),
  KEY ix_bookmarks_owner (owner, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 레거시 LoLWikiMemos.UserMemos({ "<작성자 id>": "메모" }) 를 행으로 펼친 것.
CREATE TABLE lolwiki_memos (
  owner      VARCHAR(128) NOT NULL,
  target     VARCHAR(128) NOT NULL,
  memo       TEXT         NOT NULL,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (owner, target)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 마이그레이션 중 새 스키마의 제약에 맞지 않아 그대로 옮길 수 없었던 레거시 데이터.
-- 버리지 않고 원본(payload) 그대로 여기에 남긴다.
CREATE TABLE legacy_migration_issues (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind       VARCHAR(64)  NOT NULL,
  source     VARCHAR(64)  NOT NULL,   -- 레거시 테이블명
  source_key VARCHAR(255) NULL,       -- 레거시 행 식별자
  payload    JSON         NULL,
  note       TEXT         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_issues_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE schema_migrations (
  version    VARCHAR(64) NOT NULL,
  applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
