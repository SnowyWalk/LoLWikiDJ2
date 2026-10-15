# syntax=docker/dockerfile:1.7
# Next.js custom server(Socket.IO 포함) 이미지.
# custom server는 output: 'standalone' 과 함께 쓸 수 없으므로 .next + dist/server.js 를 직접 조립한다.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
# 정적 파일 캐시 무효화용 버전 (GitHub Actions 가 커밋 sha 를 넣는다)
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/dist ./dist
# 서버 시작 시 자동 적용되는 스키마 마이그레이션
COPY --from=build --chown=node:node /app/db ./db
# P3: 레거시 화면 템플릿 (src/server/legacy-page.ts)
COPY --from=build --chown=node:node /app/legacy ./legacy
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "dist/server.js"]
