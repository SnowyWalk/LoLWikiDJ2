#!/usr/bin/env bash
# 서버(~/dj2)에서 실행: 최신 main 을 받아 이 서버에서 이미지를 빌드하고 컨테이너를 교체한다.
#   cd ~/dj2 && ./scripts/deploy.sh          # 기본: 이 서버에서 빌드 (메모리 상한을 건 빌드 전용 컨테이너)
#   cd ~/dj2 && ./scripts/deploy.sh --pull   # GitHub Actions 가 GHCR 에 올린 이미지 받기 (GHCR 로그인 필요)
#
# 주의: 이 서버(메모리 2GB)는 여러 앱이 같이 쓴다. 상한 없이 Next 빌드를 하면 메모리가 바닥나
#       서버 전체가 응답하지 않을 수 있다 (2026-10-16 장애). 그래서 빌드는 메모리 상한을 건
#       buildx 빌더 컨테이너(dj2-builder) 안에서만 한다. 상한을 넘으면 서버가 아니라 빌드만 실패한다.
set -euo pipefail
cd "$(dirname "$0")/.."

BUILDER=dj2-builder
BUILD_MEMORY=900m        # 빌드가 쓸 수 있는 메모리
BUILD_MEMORY_SWAP=1600m  # 메모리 + 스왑 합계 상한

git pull --ff-only
mkdir -p secrets backups
[ -f .env ] || { echo ".env 가 없습니다. .env.example 을 복사해 채워 주세요."; exit 1; }
START=$(date +%s)

if [ "${1:-}" = "--pull" ]; then
  APP_IMAGE="ghcr.io/snowywalk/lolwikidj2:$(git rev-parse HEAD)"
  docker pull "$APP_IMAGE" || { echo "이미지 $APP_IMAGE 를 받지 못했습니다 (GitHub Actions 빌드·GHCR 로그인 확인)"; exit 1; }
  docker tag "$APP_IMAGE" dj2:local
else
  if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
    docker buildx create --name "$BUILDER" --driver docker-container \
      --driver-opt "memory=$BUILD_MEMORY" --driver-opt "memory-swap=$BUILD_MEMORY_SWAP" >/dev/null
  fi
  nice -n 15 docker buildx build --builder "$BUILDER" --load \
    --build-arg "APP_VERSION=$(git rev-parse HEAD)" -t dj2:local .
fi

docker compose up -d --no-build app

for i in $(seq 1 30); do
  if docker exec dj2 wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo "배포 완료 ($(( $(date +%s) - START ))초): $(git log -1 --format='%h %s')"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done

docker compose logs --tail=100 app
echo "헬스체크 실패"
exit 1
