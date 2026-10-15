# LoLWiki.DJ 재구성 설계서 (Next.js + Tailwind CSS v4 + shadcn/ui)

작성일: 2026-10-16 · 위치: 신규 프로젝트 `LoLWikiDJ2` (레거시 `LoLWikiDJ` 는 수정하지 않고 참조만 함)

## 0. 목표와 원칙

| 목표 | 기준 |
| --- | --- |
| 사용자 체감 UI 동일 | 레거시 화면과 **픽셀 단위 비교(diff 0px)** 를 CI에서 자동 검증. 예외는 명시적으로 승인된 항목만 |
| 트래픽 비용 절감 | 월 8만원 → 목표 **2만원 이하** (EC2 Data Transfer Out 중심) |
| 내부 구조 개선 | 포트별로 복붙된 18개 서버 파일(약 3,000줄 × 18) → **단일 프로세스, 다중 방(Room)** |
| 배포 | EC2 + Docker Compose, GitHub Actions로 이미지 빌드/배포, 시크릿은 GitHub Secrets |

설계 원칙
1. **동작 계약(소켓 이벤트 이름·페이로드)을 먼저 고정하고 내부만 갈아끼운다.** 프론트/백을 한 번에 바꾸지 않는다.
2. **바이트는 가능한 한 EC2를 통과하지 않게 한다.** 통과해야 한다면 한 번만 통과시키고 이후엔 브라우저/디스크 캐시가 처리한다.
3. **CSS는 처음엔 그대로 옮긴다.** Tailwind 전환은 픽셀 비교 테스트가 보장해줄 때만 점진적으로.

---

## 1. 현황 분석 (실측 근거)

### 1.1 구조
- `8080.js`, `1004.js`, `1111.js` … 18개 파일이 **포트와 공지 문구만 다른 사본** (`diff 1004.js 1111.js` → 2줄 차이). 방 하나 = Node 프로세스 하나 = HTTPS 서버 하나.
- `4444.js`, `7777.js`(롤러팅), `80.js`는 오래된 갈래(8080과 350~940줄 차이).
- 프론트: `dj.html` + 전역 스크립트 9개(`static/index_*.js`, 약 9,500줄) + jQuery 1.11 + `static/index.css`(2,723줄).
- DB: EC2 로컬 MySQL(`localhost`), 문자열 포맷으로 SQL 조립.
- nginx(1.18)가 443을 받아 Express로 프록시. 각 포트 서버는 `/etc/letsencrypt`를 직접 읽어 HTTPS 종단.

### 1.2 트래픽이 새는 곳 (영향 큰 순)

| # | 원인 | 근거 | 영향 |
| --- | --- | --- | --- |
| T1 | **롤백 이미지 전부를 EC2가 중계, 캐시 0** | `static/index_lol.js:5182` `lol_convert_uri_to_mirror`가 `img.lolwiki.kr`까지 강제로 `/lolwiki_mirror`로 보냄. `8080.js:241` 은 매 요청마다 원본을 다시 받고 `Content-Type`/`Cache-Control` 없이 `res.end()` | 게시판을 열 때마다 썸네일 30장 + 아바타 + 본문 이미지가 **원본 → EC2 → 사용자**로 매번 전송. 같은 사람이 같은 글을 다시 봐도 재전송 |
| T2 | 정적 파일 압축 없음 | 실측: `index_lol.js` 168KB, `socket.io.js` 178KB, `hls.js` 322KB, `jquery` 293KB가 `encodedBodySize == 원본` (nginx 기본 `gzip_types`가 `text/html`만) | 첫 접속 JS/CSS 약 1.1MB → gzip/brotli 시 약 300KB |
| T3 | 무거운 정적 이미지 + 중복 로드 | 로그인 화면 첫 로드 **총 6.9MB**. `youtube theme.png` 1.4MB, `bg.jpg` 555KB가 `?ver=` 유무 차이로 **2번** 다운로드, `emoticon/lessy_00.png` 546KB, 폰트 woff2 430KB | 접속 1회당 수 MB |
| T4 | `Cache-Control: public, max-age=0` | 모든 정적 파일이 매번 재검증(304) 요청 | 바이트는 작지만 요청 수 많음 |
| T5 | 소켓 페이로드 중복 | `8080.js` `lol_get_article_list`/`lol_get_article_detail`이 같은 데이터를 `socket.emit('data', ret)`(디버그용, `index_socket.js:433`에서 `console.log`만 함) **+** 본 이벤트로 **2번** 전송 | 게시판 목록/상세 트래픽 2배 |
| T6 | 이미지 업로드를 base64로 소켓 전송 | `image_blob`, `lol_write`, `lol_write_reply`, `lol_icon_change` | 원본 대비 +33%, 업로드는 인바운드라 과금은 적지만 메모리/지연 큼 |

검증 결과 (2026-10-16):
- `https://img.lolwiki.kr/i/{id}/thumb` → `200`, `Cache-Control: max-age=31536000, public` (**불변 리소스**), 이 사이트에서 `<img>`로 직접 로드 성공.
- `.../resize` 중 일부는 `302 → http://i.imgur.com/...` (레거시 이미지). 이것 때문에 mixed content를 피하려고 프록시를 쓴 것으로 보이나, 최신 Chrome은 이미지 mixed content를 https로 자동 업그레이드하며 실제로 직접 로드 성공함.

> ⚠️ 비용 내역 확인 필요: AWS Cost Explorer에서 `DataTransfer-Out-Bytes`와 `BoxUsage`(인스턴스 시간) 비율을 확인하면 절감 목표를 정확히 잡을 수 있다. 서울 리전 아웃바운드는 약 $0.126/GB이므로 8만원 전부가 전송비라면 월 약 450GB 수준.

### 1.3 반드시 같이 고쳐야 할 보안 문제
- `/lolwiki_mirror?uri=` 는 **아무 URL이나 받아오는 오픈 프록시**(SSRF, 대역폭 도용 가능). → 도메인 allowlist 필수.
- SQL을 `format('Name LIKE "{0}"', nick)` 으로 조립 → SQL 인젝션. → 파라미터 바인딩.
- `toonation_session_id`가 소스에 하드코딩되어 커밋됨(공개 저장소라면 이미 노출). → 폐기/재발급 후 환경변수로.
- `eval`/`evalall` 소켓 이벤트(관리자 IP 체크 후 클라이언트에 임의 코드 실행). → 유지 여부 결정 필요(§9).

---

## 2. 목표 아키텍처

```
                 ┌────────────────────────── EC2 (Docker Compose) ───────────────────────────┐
 Browser ──443──▶│ nginx (TLS, gzip, 캐시 헤더 / 구 포트 1004…8083 → /채널번호 301 리다이렉트)   │
   │             │    │  host 네트워크, 127.0.0.1:3000                                        │
   │             │    ▼                                                                       │
   │             │ app (Node 22, Next.js custom server)                                       │
   │             │   ├─ Next.js App Router  (페이지, Route Handlers: /lolwiki_mirror, /upload)│
   │             │   ├─ Socket.IO server    (방별 RoomState, 이벤트 계약 그대로)              │
   │             │   └─ services: lolwiki, youtube, twitch, tts, danbooru, image-cache        │
   │             │    │                 │                                                     │
   │             │    ▼                 ▼                                                     │
   │             │ 호스트의 기존 MySQL(127.0.0.1:3306)   /data volume: cache, uploads, icons, tts │
   │             └────────────────────────────────────────────────────────────────────────────┘
   └──────────── img.lolwiki.kr / i.ytimg.com 등 외부 이미지는 **브라우저가 직접** 로드 ────────
```

### 2.1 왜 Next.js "custom server"인가
- Socket.IO + 메모리 상의 재생/DJ 상태 → 오래 사는 Node 프로세스가 필수. 서버리스 불가.
- Next 공식 문서상 custom server는 `output: 'standalone'`과 함께 못 쓰므로, Docker 이미지는 `next build` 결과물 + 번들링한 `server.js`(esbuild/tsup)를 직접 조립한다.
- HTTP 성격의 기능(이미지 프록시, 업로드, `/attendants`, `/patch_note`, 헬스체크)은 Route Handler로.

### 2.2 채널 통합 — 포트 대신 경로
- 기본 채널: `https://lolwiki.xyz/` (레거시 8080). 다른 채널: `https://lolwiki.xyz/1004` 처럼 경로에 채널 번호. `/8080` 은 `/` 로 301. 목록에 없는 번호는 404.
- 페이지(`app/page.tsx`, `app/[channel]/page.tsx`)가 채널 번호를 소켓 handshake 쿼리(`channel`)로 보내고, 서버는 그 채널의 `RoomState`(레거시 전역 `g_users_dic`, `g_djs`, `g_queue`… 를 묶은 것)에 소켓을 배정. 예전 포트 주소(`lolwiki.xyz:1004`)는 nginx가 `lolwiki.xyz/1004` 로 301 리다이렉트(북마크 호환, 나중에 제거 가능).
- 채널 번호 목록은 `src/shared/channels.ts`, 채널별 공지는 `src/server/rooms/rooms.config.ts`.
- 효과: 프로세스 18개 → 1개(메모리 대폭 감소 → 더 작은 인스턴스 가능), 롤백 API 토큰 캐시·블록 캐시·이미지 캐시를 방 간 공유.

### 2.3 디렉터리 구조
```
단일 패키지 (규모상 모노레포 불필요)
src/
  app/                    # Next App Router
    layout.tsx            # <html theme="default"> 등 레거시 루트 속성 그대로
    page.tsx              # DJ 화면 (client component 트리)
    patch-note/page.tsx   # readme.md → 빌드 타임 렌더(SSG)
    lolwiki_mirror/route.ts
    api/upload/route.ts
    (헬스체크는 custom server 의 /healthz 가 Next 를 거치지 않고 직접 응답)
    attendants/route.ts
  components/             # 레거시 DOM 구조·id·class를 그대로 재현한 React 컴포넌트
    login/ player/ chat/ playlist/ djlist/ recent/ option/ lolwiki/ livechat/
    ui/                   # shadcn 생성물 (레거시 스타일로 덮어씀)
  styles/
    legacy.css            # static/index.css 원본 (1단계에선 수정 금지)
    globals.css           # @import "tailwindcss" (preflight 비활성) + @layer legacy
  client/
    socket.ts             # 싱글턴 socket.io-client, 타입드 이벤트
    store/                # zustand: room, player, chat, playlist, lolwiki, options
    hooks/
  shared/
    events.ts             # 서버↔클라 이벤트 계약 (zod 스키마 + 타입)
  server/
    index.ts              # custom server 엔트리 (http + next + socket.io)
    rooms/RoomState.ts
    handlers/             # login, chat, playlist, dj, rating, zzal, tts, lolwiki, image
    services/             # lolwiki-api(기존 lolwiki-api.js 이식), youtube, twitch, tts, danbooru
    images/               # image-cache.ts, upload-store.ts
    db/                   # mysql2 pool + Drizzle(introspect된 기존 스키마)
    config.ts             # env 검증(zod)
public/static/            # 레거시 정적 자산 (경로 유지: /static/..., /fonts/..., /emoticon/...)
docker/ nginx/ .github/workflows/
tests/
  contract/  visual/  e2e/
```

---

## 3. 트래픽/캐싱 설계 (핵심)

### 3.1 롤백 이미지 — 3단 구조
1. **직접 로드 (EC2 전송 0)**: `https://` 이고 allowlist(`img.lolwiki.kr`, `i.imgur.com`, …)에 있으면 프록시하지 않고 원본 URL 그대로 `<img src>`. `img.lolwiki.kr`은 1년 불변 캐시라 브라우저가 재방문 시 네트워크 요청조차 안 함.
2. **폴백 프록시**: `onError` 시에만 `/lolwiki_mirror?uri=...` 로 교체 (http 전용 호스트, 핫링크 차단 호스트 대비).
3. **프록시의 디스크 캐시** (`server/images/image-cache.ts`):
   - 키 = `sha256(정규화된 URL)`, 저장 = `/data/cache/lolwiki/ab/cd/<hash>` + 메타(JSON: content-type, etag, 원본 크기, 마지막 접근).
   - **single-flight**: 같은 URL 동시 요청은 원본 fetch 1회로 합침.
   - 응답 헤더: 정확한 `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`(`/i/{id}/thumb|resize` 같이 불변 URL), 그 외 `max-age=86400, stale-while-revalidate`. `ETag` 지원으로 304.
   - 보호: 호스트 allowlist, 사설 IP 차단, 최대 20MB, `image/*` 만, 타임아웃 10s.
   - 용량 관리: 기본 5GB LRU, 매시간 정리 잡.
   - 실패 시 기존처럼 `static/xbox.jpg` 반환(단, `Cache-Control: no-store`).
   - 추가 옵션: nginx `proxy_cache` 를 앞단에 두면 Node까지 안 오고 끝남.

> 예상 효과: 게시판 관련 EC2 아웃바운드가 사실상 0에 수렴 (폴백 비율만큼만 발생).

### 3.2 정적 자산
- nginx: `brotli`(또는 gzip) on, `gzip_types`에 js/css/json/svg/woff 아닌 텍스트 전부.
- Next가 빌드하는 JS/CSS는 해시 파일명 → `immutable, max-age=1y`.
- `public/static/*` 레거시 자산: 빌드 시 콘텐츠 해시로 URL을 만들어(`/static/bg.jpg?v=<hash>`) 1년 캐시. 현재처럼 서버가 매 요청 `fs.stat`으로 `$_version` 치환하던 로직 제거.
- `bg.jpg` 중복 로드 제거(preload URL과 CSS URL 일치시킴).
- 큰 이미지: **무손실** 최적화(oxipng/mozjpeg lossless)는 기본 적용(픽셀 동일). WebP/AVIF 변환은 픽셀이 미세하게 달라지므로 §9에서 승인받은 파일만.
- 폰트: woff2만 제공(eot/svg/ttf 폴백 제거 — 모든 현대 브라우저 지원), `font-display` 기존 동작 유지.
- jQuery, `jquery.justifiedGallery`, `hls.js`, `flv.js`: jQuery는 제거, 갤러리는 React로 재구현, hls/flv는 **해당 플레이어가 필요할 때만 dynamic import**.
- 외부 CDN(`cdn.bootcss.com` flv.js — 현재 로드 실패 중, font-awesome)은 npm 패키지로 내재화.

### 3.3 업로드/아이콘
- 채팅 이미지·롤백 글/댓글 이미지·아이콘: `POST /api/upload` (multipart, 바이너리) → `{ url }` 반환 → 소켓에는 URL만 보냄. 기존 `image_blob` 이벤트는 호환 어댑터로 한동안 유지.
- 저장 파일명은 콘텐츠 해시 → `immutable` 캐시 가능.
- 유저 아이콘 `/icon/{id}.png?ver={n}`: 버전이 바뀌면 URL이 바뀌므로 `immutable` 캐시. 지금은 접속자 목록 갱신 때마다 재검증 요청 발생.

### 3.4 소켓
- 디버그용 `socket.emit('data', …)` 이중 전송 제거 (T5).
- `perMessageDeflate` 활성화(텍스트 위주 이벤트라 압축 효율 높음), 클라이언트는 `transports: ['websocket']` 우선.
- 이벤트 이름/페이로드는 1단계에서 **동일**하게 유지 → 신·구 클라이언트 병행 가능.

---

## 4. 프론트엔드 설계 — "1px도 다르지 않게"

### 4.1 전략: DOM·CSS를 먼저 동일하게, 그 다음 내부를 React로
1. **레거시 CSS를 그대로 import** (`styles/legacy.css` = `static/index.css` 원본). 셀렉터가 `#id`·전역 클래스 기반이므로 React 컴포넌트도 **같은 id/class/요소 계층**을 렌더한다.
2. **Tailwind v4 preflight 비활성화**: preflight는 `img{display:block}`, 마진 리셋, `border-style` 등 기본 스타일을 바꿔 레거시 화면을 깨뜨린다.
   ```css
   @layer theme, base, legacy, components, utilities;
   @import "tailwindcss/theme.css" layer(theme);
   @import "tailwindcss/utilities.css" layer(utilities);
   @import "./legacy.css" layer(legacy);
   ```
3. 테마(`<html theme="default|dark|...">`)와 CSS 변수(`index.css:3`, `:79`)는 그대로 쓰고, Tailwind `@theme`에 같은 변수를 연결해 새 코드에서 `bg-[--chat-bg]` 식으로 재사용.
4. **shadcn/ui 사용 범위**: 동작이 복잡한 부분(툴팁, 모달/다이얼로그, 컨텍스트 메뉴, 스크롤 영역, 슬라이더=볼륨)에 Radix 기반 행동만 가져오고, 스타일은 레거시 클래스로 덮어쓴다. shadcn 기본 룩을 그대로 쓰면 화면이 바뀌므로 **"headless로 쓰는 shadcn"** 이 원칙.
5. 레거시 CSS → Tailwind 클래스 전환은 컴포넌트 단위로, 시각 회귀 테스트 통과 시에만 병합.

### 4.2 상태와 이벤트
- 전역 `g_*` 변수 → zustand 스토어(`room`, `player`, `chat`, `playlist`, `lolwiki`, `options`).
- `socket.on(...)` 핸들러는 스토어 액션으로만 연결(`client/socket.ts`에서 한곳 등록).
- `localStorage` 키 이름은 기존 그대로(자동 로그인, 옵션, 볼륨 등이 끊기지 않게).
- YouTube IFrame API / Twitch embed는 기존처럼 스크립트 로드하되 `next/script strategy="lazyOnload"`.
- 100ms `setInterval` 두 개(`index.js:232-233`)는 `requestAnimationFrame` + 가시성 체크로 대체(동작 동일, CPU 감소).

### 4.3 픽셀 동일성 검증 (Visual Regression)
- Playwright로 **레거시 서버와 신규 서버를 같은 fixture 상태**(목 소켓 서버가 동일 이벤트 재생)로 띄우고 스크린샷 비교(`pixelmatch`, threshold 0).
- 시나리오: 로그인 화면, 메인(재생 중/대기 중), 채팅(텍스트/이미지/이모지/시스템 메시지), 플레이리스트, DJ 목록, 최근 영상, 옵션, 롤백 게시판 목록/상세/글쓰기, 다크 테마, 창 크기 3종.
- 동적 요소(시간, 애니메이션, 외부 iframe)는 마스킹.
- 이 테스트가 "1px도 차이 없음"의 객관적 기준이 된다.

---

## 5. 백엔드 설계

- **서버 엔트리** `server/index.ts`: `http.createServer` → Next request handler + Socket.IO attach. TLS는 nginx 담당(앱은 평문 HTTP 3000).
- **DB**: `mysql2/promise` 커넥션 풀(현재의 단일 커넥션 + 수동 재연결 제거), Drizzle로 기존 테이블 introspect(`Accounts`, `Playlists`, `Icons`, `Bans`, `Secures`, `LoLWikiArchive`, …). 스키마는 **변경하지 않음**(무중단 이전).
- **클라이언트 IP**: nginx가 넣는 `X-Forwarded-For`를 신뢰 프록시 1단계로만 해석.
- **롤백 API**: `lolwiki-api.js`와 테스트(`lolwiki-api.test.js`)를 TS로 이식, 응답 캐시(목록 10~30초, 상세 60초, 블록 30초)는 방 간 공유.
- **TTS**: 생성한 음성 파일은 텍스트+보이스 해시로 캐시해 재사용(`/data/tts`).
- **로깅**: pino(JSON) → `docker logs`. 기존 `log('INFO', …)` 포맷 유지 가능.
- **헬스체크**: `/healthz` (P1: 프로세스·방 상태. P3에서 DB ping, 데이터 디렉터리 쓰기 가능 여부 추가).

---

## 6. Docker / 배포

### 6.1 이미지
```dockerfile
# deps → build → runner (node:22-alpine)
FROM node:22-alpine AS deps      # npm ci
FROM deps AS build               # next build && tsup src/server/index.ts
FROM node:22-alpine AS runner    # .next, public, dist/server.js, prod node_modules만 복사
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "dist/server.js"]
```

### 6.2 compose.yaml
- `nginx`: host 네트워크. 443(서비스) + 구 포트(리다이렉트 전용), `/etc/letsencrypt` 읽기 전용 마운트, 인증서 갱신은 webroot(`/var/www/certbot`) 방식.
- `app`: 내부 네트워크만, `/data` 볼륨.
- MySQL: **EC2 호스트에 이미 있는 MySQL을 그대로 사용**. app 컨테이너를 host 네트워크로 띄워 지금처럼 `127.0.0.1:3306` 으로 접속하므로 bind-address·계정 권한·데이터 이전이 필요 없다. app은 `127.0.0.1:3000` 에만 바인딩되어 외부 노출 없음.
- 로그 로테이션: `logging: { driver: json-file, options: { max-size: 10m, max-file: 3 } }`.

### 6.3 GitHub Actions
1. `ci.yml` (PR): typecheck, lint, unit(lolwiki-api 등), contract, **visual regression**.
2. `deploy.yml` (main push): Docker build → GHCR push → EC2에 SSH → `docker compose pull && docker compose up -d` → health 확인, 실패 시 이전 태그로 롤백.

### 6.4 시크릿 (GitHub Secrets → 배포 시 EC2 `.env`로 기록)
| 이름 | 기존 위치 |
| --- | --- |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `db_config.txt` |
| `TWITCH_CLIENT_ID`, `TWITCH_SECRET` | `twitch_config.txt` |
| `DANBOORU_LOGIN`, `DANBOORU_API_KEY` | `danbooru_config.txt` |
| `GOOGLE_TTS_CREDENTIALS_JSON` (base64) | `tts-api-*.json` |
| `TOONATION_SESSION_ID` | 소스 하드코딩 (재발급 권장) |
| `MASTER_IP` | 소스 하드코딩 `g_master_ip` |
| `EC2_HOST`, `EC2_SSH_KEY` | 배포용 |

`.gitignore`에 `.env*`, `data/`, `*.json` 자격증명 패턴 추가. 위 설정 파일들은 git 이력에 커밋된 적 없음을 확인함(`git log --all`).

---

## 7. 마이그레이션 단계

| 단계 | 내용 | 완료 기준 |
| --- | --- | --- |
| P0 (취소) | 레거시 프로젝트는 수정하지 않기로 함. 비용 절감은 P5 전환 시점에 한 번에 반영 | - |
| **P1 기반 ✅** | Next 16 + TS + Tailwind v4(preflight off) + shadcn(Radix) init, custom server(Socket.IO, 경로 기반 채널 배정), env/config, Docker/compose/nginx, CI/CD 골격 | `npm run build` 통과, 프로덕션 모드에서 `/healthz` OK, 방 배정 확인 (2026-10-16) |
| P2 계약 고정 | 소켓 이벤트 전수 목록(서버 on 약 70개, emit 포함) → `shared/events.ts` zod 스키마. 레거시 서버 대상 계약 테스트 | 계약 테스트가 레거시에 대해 통과 |
| P3 백엔드 이식 | handlers/services/RoomState/DB 풀/이미지 캐시/업로드. **레거시 프론트(dj.html)를 그대로 신규 서버에서 서빙**해서 검증 | 레거시 프론트 + 신규 서버로 친구들과 실사용 1주 |
| P4 프론트 이식 | 화면 단위로 React 컴포넌트화(로그인 → 플레이어 → 채팅 → 패널들 → 롤백 게시판), 매 단계 시각 회귀 0px | 전체 시나리오 diff 0 |
| P5 전환 | 호스트 nginx·레거시 node 프로세스 중단(443/80 포트 반환) 후 compose 기동, certbot 갱신 방식을 webroot로 전환, 1주 병행 모니터링 후 레거시 파일 `legacy/`로 이동 | 비용·에러 지표 확인 |
| P6 정리 | 레거시 CSS → Tailwind 점진 전환, 이미지 WebP(승인분), 불필요 코드 삭제 | 선택 사항 |

---

## 8. 기대 효과 요약

| 항목 | 현재 | 목표 |
| --- | --- | --- |
| 롤백 이미지 EC2 전송 | 조회마다 전량 | ≈0 (직접 로드 + 폴백만, 그것도 1회 후 캐시) |
| 첫 접속 전송량 | 6.9MB | ~2MB 이하 (압축, 중복 제거, 무손실 최적화, 지연 로드) |
| 재방문 전송량 | 재검증 수십 건 | 대부분 메모리/디스크 캐시 히트 |
| 게시판 소켓 페이로드 | 2배 | 1배 + deflate |
| 프로세스 | 18개 | 1개 |
| SQL 인젝션 / 오픈 프록시 | 있음 | 제거 |

---

## 9. 결정이 필요한 항목

1. ~~방 범위~~ → **결정됨**: 포트 대신 경로(`/채널번호`)로 채널 구분. 컨트롤타워 폐기. (`4444`/`7777` 롤러팅/`index_neural`/`8079`/`1024`/`8000 youtubetitle`/`9000 RTMP` 는 미정 — 현재 범위 밖)
2. ~~MySQL~~ → **결정됨**: 기존 호스트 MySQL 그대로 사용.
3. **`eval`/`evalall`(원격 코드 실행) 기능**: 유지/삭제.
4. **이미지 손실 압축(WebP 등)** 허용 범위: 기본은 무손실만.
5. **인스턴스 사양**: 프로세스 통합 후 더 작은 인스턴스(예: t4g.small)로 내릴지 — 전송비 외 고정비 절감.
6. 레거시 저장소의 이전 시도 산출물(`src/app`, `dist/`, `.omx/`, `data/*-smoke`) 및 `LoLWikiDJ2 (유기)` 폴더 정리 여부.
