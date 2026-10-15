#!/usr/bin/env bash
# 전환(P5) 때 옛 서버(lolwiki.xyz)의 사용자 파일을 새 서버 dj2 데이터 볼륨으로 옮긴다.
#   - static/icon   → /data/icon     (유저 아이콘, 파일명 = 아이콘 id. v2 DB 가 같은 id 를 쓴다)
#   - static/images → /data/images   (채팅 이미지, 채팅 기록의 /img static/images/... 링크)
#
# 내 PC 에서 실행 (두 서버에 SSH 키로 접속 가능해야 함):
#   OLD_KEY="D:/Private Key/20201009 pem.pem" NEW_KEY="D:/Private Key/20260409 pem.pem" ./scripts/cutover/copy-user-files.sh
#
# 옛 서버에서는 읽기만 한다. 여러 번 실행해도 된다 (같은 이름은 덮어씀).
set -euo pipefail

OLD="ubuntu@3.39.119.145"
NEW="ubuntu@ec2-54-180-125-84.ap-northeast-2.compute.amazonaws.com"
: "${OLD_KEY:?OLD_KEY 필요}" "${NEW_KEY:?NEW_KEY 필요}"

for pair in "static/icon:icon" "static/images:images"; do
  src="${pair%%:*}"
  dest="${pair##*:}"
  echo "== $src → /data/$dest"
  # 옛 서버에서 tar 로 묶어 내 PC 를 거쳐 새 서버의 도커 볼륨에 바로 푼다 (중간 파일 없음).
  ssh -i "$OLD_KEY" "$OLD" "cd /var/www/html/$src && tar cf - ." \
    | ssh -i "$NEW_KEY" "$NEW" "docker run --rm -i -v dj2_app-data:/data alpine sh -c 'mkdir -p /data/$dest && tar xf - -C /data/$dest && chown -R 1000:1000 /data/$dest && ls /data/$dest | wc -l'"
done
