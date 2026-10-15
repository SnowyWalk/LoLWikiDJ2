#!/usr/bin/env bash
# 서버(~/dj2)에서 실행: 최신 main 을 받아 이미지를 다시 빌드하고 컨테이너를 교체한다.
#   cd ~/dj2 && ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
mkdir -p secrets
[ -f .env ] || { echo ".env 가 없습니다. .env.example 을 복사해 채워 주세요."; exit 1; }

docker compose up -d --build

for i in $(seq 1 30); do
  if docker exec dj2 wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo "배포 완료: $(git log -1 --format='%h %s')"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done

docker compose logs --tail=100 app
echo "헬스체크 실패"
exit 1
