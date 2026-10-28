-- 레거시 Secures.android_id ("인증한 android_id", IP 별 롤백과사전 계정 id) 보존.
-- 2021 덤프에는 없던 컬럼이라 실데이터 이전 리허설에서 발견됨 (2026-10-28).
ALTER TABLE ip_notes
  MODIFY comment TEXT NULL,
  ADD COLUMN android_id VARCHAR(64) NULL AFTER comment;
