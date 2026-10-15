-- 옛 서버에서 실행해 레거시 DB 의 "구조와 규모"만 확인한다. 개인정보(닉네임, IP, 메모 내용)는 출력하지 않는다.
--
--   mysql -u root -p LoLWikiDJ_DB < inspect-legacy.sql > legacy-inspect.txt
--
-- 결과 파일을 공유하면 마이그레이션 매핑(scripts/db/migrate-legacy.ts 의 KNOWN)을 현재 스키마에 맞춘다.

SELECT '== tables ==' AS section;
SELECT TABLE_NAME, ENGINE, TABLE_ROWS, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb, TABLE_COLLATION
FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME;

SELECT '== columns ==' AS section;
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLLATION_NAME
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT '== indexes ==' AS section;
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE;

SELECT '== exact row counts ==' AS section;
SELECT 'Accounts' t, COUNT(*) n FROM Accounts
UNION ALL SELECT 'Icons', COUNT(*) FROM Icons
UNION ALL SELECT 'Playlists', COUNT(*) FROM Playlists
UNION ALL SELECT 'Videos', COUNT(*) FROM Videos;

SELECT '== playlist sizes ==' AS section;
SELECT COUNT(*) AS playlists, SUM(JSON_LENGTH(VideoList)) AS total_items, MAX(JSON_LENGTH(VideoList)) AS max_items,
       ROUND(AVG(JSON_LENGTH(VideoList)), 1) AS avg_items, SUM(Deleted = 1) AS deleted
FROM Playlists;

SELECT '== duplicate youtube ids (count only) ==' AS section;
SELECT COUNT(*) AS duplicated_video_ids FROM (SELECT VideoId FROM Videos GROUP BY BINARY VideoId HAVING COUNT(*) > 1) d;

SELECT '== server ==' AS section;
SELECT VERSION() AS version, @@character_set_server, @@collation_server, @@lower_case_table_names, @@sql_mode;
