#!/usr/bin/env bash
# 서버(~/dj2)에서 실행: 최신 main 을 받고, GitHub Actions 가 만든 이미지를 받아 컨테이너를 교체한다.
#   cd ~/dj2 && ./scripts/deploy.sh            # 기본: 이미지 받기 (서버에서 빌드하지 않음)
#   cd ~/dj2 && ./scripts/deploy.sh --build-here  # 비상시에만: 서버에서 직접 빌드 (메모리 확인 후)
#
# 주의: 이 서버(메모리 2GB)는 여러 앱이 같이 쓴다. Next 빌드를 여기서 하면 메모리가 바닥나
#       서버 전체가 응답하지 않을 수 있다 (2026-10-16 장애). 그래서 기본은 이미지 받기다.
#       이미지 받기에는 GHCR 로그인이 한 번 필요하다:
#         gh auth refresh -h github.com -s read:packages
#         gh auth token | docker login ghcr.io -u SnowyWalk --password-stdin
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
mkdir -p secrets backups
[ -f .env ] || { echo ".env 가 없습니다. .env.example 을 복사해 채워 주세요."; exit 1; }

if [ "${1:-}" = "--build-here" ]; then
  avail_mb=$(awk '/MemAvailable/ { print int($2 / 1024) }' /proc/meminfo)
  if [ "$avail_mb" -lt 1500 ]; then
    echo "사용 가능한 메모리 ${avail_mb}MB < 1500MB: 서버에서 빌드하면 다른 앱까지 멈출 수 있어 중단합니다."
    exit 1
  fi
  nice -n 19 docker compose build app
else
  export APP_IMAGE="ghcr.io/snowywalk/lolwikidj2:$(git rev-parse HEAD)"
  if ! docker pull "$APP_IMAGE"; then
    echo "이미지 $APP_IMAGE 를 받지 못했습니다. GitHub Actions(Image) 빌드가 끝났는지, GHCR 로그인이 되어 있는지 확인하세요."
    exit 1
  fi
  docker tag "$APP_IMAGE" dj2:local
fi

docker compose up -d --no-build

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
