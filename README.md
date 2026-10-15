# LoLWiki.DJ

Next.js 16 + Tailwind CSS v4 + shadcn/ui 기반 LoLWiki.DJ 재구성 프로젝트.
설계는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 참고.

## 개발

```bash
cp .env.example .env
npm install
npm run dev        # custom server(Next + Socket.IO), http://localhost:3000
```

채널은 경로로 구분한다: `/` = 기본 채널(8080), `/1004` = 1004 채널. 채널 목록은 `src/shared/channels.ts`.

## 빌드 / 실행

```bash
npm run build      # next build + 서버 번들(dist/server.js)
npm start
```

## 배포

서버(snowywalk.me EC2)에서 `cd ~/dj2 && ./scripts/deploy.sh` (git pull → `docker compose up -d --build`).
nginx-proxy-manager 가 `https://dj2.snowywalk.me` → `http://dj2:3000` 으로 전달한다. 자세한 내용은 설계서 6절.
