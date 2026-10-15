-- 마이그레이션 테스트용: 2021 덤프(구 스키마)에 이후 추가된 테이블/컬럼과
-- 일부러 깨뜨린 엣지 케이스를 더한다. 실제 개인정보는 넣지 않는다.

ALTER TABLE Accounts ADD COLUMN LikePlaylist INT NULL;
ALTER TABLE Videos   ADD COLUMN Author VARCHAR(100) NULL;

CREATE TABLE Bans (
  IP      VARCHAR(16) NOT NULL,
  Reason  VARCHAR(100) NULL,
  Comment VARCHAR(100) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE LoLWikiArchive (
  No          INT NOT NULL AUTO_INCREMENT,
  Owner       VARCHAR(64) NOT NULL,
  post_seq    VARCHAR(32) NOT NULL,
  icon_img    VARCHAR(255) NULL,
  badge_use   INT NULL,
  post_title  VARCHAR(255) NULL,
  nickname    VARCHAR(64) NULL,
  post_date   VARCHAR(32) NULL,
  likes       INT NULL,
  replys      LONGTEXT NULL,
  youtube_url VARCHAR(255) NULL,
  doodlr      INT NULL,
  pic_new     VARCHAR(255) NULL,
  pic_multi   VARCHAR(1024) NULL,
  post_text   LONGTEXT NULL,
  views       INT NULL,
  doodlrurls  TEXT NULL,
  fixedpic    VARCHAR(255) NULL,
  stack       INT NULL,
  reply_cnt   INT NULL,
  PRIMARY KEY (No)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE LoLWikiMemos (
  android_id VARCHAR(64) NOT NULL,
  UserMemos  JSON NULL,
  PRIMARY KEY (android_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 영상 작성자 채우기 (일부만)
UPDATE Videos SET Author = CONCAT('채널', Id % 50) WHERE Id % 3 = 0;

-- [엣지] 같은 유튜브 영상이 두 번 등록됨 → 중복 제거 후 참조가 옮겨져야 한다
INSERT INTO Videos (Name, VideoId, Length, Thumbnail, Author)
SELECT Name, VideoId, Length, Thumbnail, Author FROM Videos ORDER BY Id LIMIT 3;
SET @dup_id = LAST_INSERT_ID();

-- [엣지] 대소문자만 다른 유튜브 id 는 서로 다른 영상이다
INSERT INTO Videos (Name, VideoId, Length) VALUES ('대소문자 A', 'caseTEST001', 10), ('대소문자 B', 'CASEtest001', 20);

-- [엣지] 재생목록에 중복 영상 id, 존재하지 않는 영상, 문자열 숫자, 중복 등록된 영상 행을 섞는다
UPDATE Playlists p
JOIN (SELECT Id FROM Playlists WHERE JSON_LENGTH(VideoList) > 2 ORDER BY Id LIMIT 1) t ON t.Id = p.Id
SET p.VideoList = JSON_ARRAY_APPEND(JSON_ARRAY_APPEND(JSON_ARRAY_APPEND(JSON_ARRAY_APPEND(p.VideoList,
  '$', 999999), '$', JSON_EXTRACT(p.VideoList, '$[0]')), '$', CAST(@dup_id AS CHAR)), '$', (SELECT MAX(Id) FROM Videos));

-- [엣지] 어떤 계정에도 속하지 않은 재생목록, 삭제된 재생목록
INSERT INTO Playlists (Name, VideoList, Deleted) VALUES ('고아 재생목록', '[1, 2, 3]', 0), ('삭제된 재생목록', '[4, 5]', 1);

-- [엣지] 계정의 재생목록 배열이 없는 id / 남의 재생목록 / 같은 id 두 번을 가리킴
UPDATE Accounts a
JOIN (SELECT Name FROM Accounts ORDER BY Name LIMIT 1) t ON t.Name = a.Name
SET a.Playlists = JSON_ARRAY_APPEND(JSON_ARRAY_APPEND(a.Playlists, '$', 888888), '$', JSON_EXTRACT(a.Playlists, '$[0]'));

-- [엣지] CurrentPlaylist 가 없는 재생목록, LikePlaylist 지정
UPDATE Accounts a JOIN (SELECT Name FROM Accounts ORDER BY Name LIMIT 1 OFFSET 1) t ON t.Name = a.Name SET a.CurrentPlaylist = 777777;
UPDATE Accounts a JOIN (SELECT Name FROM Accounts ORDER BY Name LIMIT 1 OFFSET 2) t ON t.Name = a.Name
SET a.LikePlaylist = CAST(JSON_EXTRACT(a.Playlists, '$[0]') AS UNSIGNED);

-- [엣지] 계정 없이 아이콘만 있는 닉네임
INSERT INTO Icons (Name, Ver) VALUES ('아이콘만있는유저', 3);

INSERT INTO Bans (IP, Reason, Comment) VALUES ('10.0.0.1', '테스트 사유', '메모'), ('192.168.%', '대역 차단', NULL);

-- Secures: 정상, 같은 IP 에 같은 닉네임 두 번, Name 없는 원소, 메모
INSERT INTO Secures (IP, ConnectData, Comment) VALUES
 ('10.0.0.2', '[{"Name":"테스트A","ConnectCount":5,"CreationDate":"2021-01-01 10:00:00","LastLoginDate":"2022-05-05 12:00:00"}]', NULL),
 ('10.0.0.3', '[{"Name":"테스트B","ConnectCount":2,"CreationDate":"2021-02-01 10:00:00","LastLoginDate":"2021-03-01 10:00:00"},{"Name":"테스트B","ConnectCount":3,"CreationDate":"2020-12-01 10:00:00","LastLoginDate":"2021-04-01 10:00:00"},{"ConnectCount":1}]', '공용 PC');

INSERT INTO LoLWikiArchive (Owner, post_seq, icon_img, badge_use, post_title, nickname, post_date, likes, replys, youtube_url, doodlr, pic_new, pic_multi, post_text, views, doodlrurls, fixedpic, stack, reply_cnt) VALUES
 ('dev-1', '1001', 'https://img.lolwiki.kr/i/a/thumb', 0, '첫 글', '닉1', '2023-01-01 10:00:00', 3, '[{"reply_seq":"1","text":"댓글 \\"인용\\""}]', '', 0, '', '', '본문\n두 줄', 10, '', '', 5, 1),
 ('dev-1', '1002', NULL, NULL, '두번째', '닉2', '2023-01-02 10:00:00', 0, '[]', NULL, 0, NULL, NULL, NULL, 0, NULL, NULL, 0, 0),
 ('dev-1', '1001', NULL, 0, '첫 글 (중복 북마크)', '닉1', '2023-01-01 10:00:00', 3, '[]', '', 0, '', '', '본문', 11, '', '', 5, 0),
 ('dev-2', '1001', NULL, 0, '첫 글', '닉1', '2023-01-01 10:00:00', 3, '[]', '', 0, '', '', '본문', 10, '', '', 5, 0);

INSERT INTO LoLWikiMemos (android_id, UserMemos) VALUES
 ('dev-1', '{"writer-a": "착한 사람", "writer-b": "따옴표 \\" 포함", "writer-c": ""}'),
 ('dev-2', '{}');
