#!/usr/bin/env bash
# 내 PC 에서 실행: GitHub Actions(Image) 가 만든 이미지 파일을 받아 서버에 넣고 컨테이너를 교체한다.
# 서버에 GHCR 로그인이 없어도 되고, 서버에서 빌드하지도 않는다 (서버 메모리 보호).
#
#   NEW_KEY="D:/Private Key/20260409 pem.pem" ./scripts/deploy-via-artifact.sh [커밋 sha, 기본: origin/main]
set -euo pipefail
cd "$(dirname "$0")/.."

NEW="ubuntu@ec2-54-180-125-84.ap-northeast-2.compute.amazonaws.com"
: "${NEW_KEY:?NEW_KEY 필요}"
GH="${GH:-gh}"
SHA="${1:-$(git rev-parse origin/main)}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== 이미지 파일 받기 ($SHA)"
"$GH" run download --repo SnowyWalk/LoLWikiDJ2 --name "dj2-image-$SHA" --dir "$TMP"
ls -la "$TMP/dj2-image.tar.gz"

echo "== 서버로 올리고 교체"
scp -q -i "$NEW_KEY" "$TMP/dj2-image.tar.gz" "$NEW:/tmp/dj2-image.tar.gz"
ssh -i "$NEW_KEY" "$NEW" "set -e
  cd ~/dj2 && git pull --ff-only -q
  gunzip -c /tmp/dj2-image.tar.gz | docker load -q && rm -f /tmp/dj2-image.tar.gz
  docker tag ghcr.io/snowywalk/lolwikidj2:$SHA dj2:local
  docker compose up -d --no-build app
  for i in \$(seq 1 30); do
    if docker exec dj2 wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
      echo \"배포 완료: \$(git log -1 --format='%h %s')\"; docker image prune -f >/dev/null; exit 0
    fi
    sleep 2
  done
  docker compose logs --tail=60 app; exit 1"
