# LoLWiki.DJ 재구성 설계서 (Next.js + Tailwind CSS v4 + shadcn/ui)

작성일: 2026-10-16 · 위치: 신규 프로젝트 `LoLWikiDJ2` (레거시 `LoLWikiDJ` 는 수정하지 않고 참조만 함)

## 0. 목표와 원칙

| 목표 | 기준 |
| --- | --- |
| 사용자 체감 UI 동일 | 레거시 화면과 **픽셀 단위 비교(diff 0px)** 를 CI에서 자동 검증. 예외는 명시적으로 승인된 항목만 |
| 트래픽 비용 절감 | 월 8만원 → 목표 **2만원 이하** (EC2 Data Transfer Out 중심) |
| 내부 구조 개선 | 포트별로 복붙된 18개 서버 파일(약 3,000줄 × 18) → **단일 프로세스, 다중 방(Room)** |
| 배포 | snowywalk.me EC2의 다른 앱들과 같은 방식: 서버에서 `git pull` → `docker compose up -d --build`, nginx-proxy-manager가 컨테이너 이름으로 연결, 시크릿은 서버 `.env` |

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
                                     ┌──────────── EC2 snowywalk.me 서버 (Docker, 다른 서비스와 공유) ────────────┐
 Browser ──▶ Cloudflare ──443──────▶ │ nginx-proxy-manager (TLS, dj2.snowywalk.me → http://dj2:3000)           │
   │                                 │    │  docker 네트워크 `proxy`                                             │
   │                                 │    ▼                                                                     │
   │                                 │ dj2 컨테이너 (Node 22, Next.js custom server, 포트 미노출, mem 512m)      │
   │                                 │   ├─ Next.js App Router  (페이지, Route Handlers: /lolwiki_mirror, /upload)│
   │                                 │   ├─ Socket.IO server    (채널별 RoomState, 이벤트 계약 그대로)           │
   │                                 │   └─ services: lolwiki, youtube, twitch, tts, danbooru, image-cache      │
   │                                 │        /data volume: cache, uploads, icons, tts                           │
   │                                 └──────────┬───────────────────────────────────────────────────────────────┘
   │                                            ▼  (§9-2: 연결 방식 결정 필요)
   │                                 기존 MySQL — lolwiki.xyz 서버(3.39.119.145)의 localhost
   └──── img.lolwiki.kr / i.ytimg.com 등 외부 이미지는 **브라우저가 직접** 로드
```

### 2.1 왜 Next.js "custom server"인가
- Socket.IO + 메모리 상의 재생/DJ 상태 → 오래 사는 Node 프로세스가 필수. 서버리스 불가.
- Next 공식 문서상 custom server는 `output: 'standalone'`과 함께 못 쓰므로, Docker 이미지는 `next build` 결과물 + 번들링한 `server.js`(esbuild/tsup)를 직접 조립한다.
- HTTP 성격의 기능(이미지 프록시, 업로드, `/attendants`, `/patch_note`, 헬스체크)은 Route Handler로.

### 2.2 채널 통합 — 포트 대신 경로
- 기본 채널: `https://dj2.snowywalk.me/` (레거시 8080). 다른 채널: `https://dj2.snowywalk.me/1004` 처럼 경로에 채널 번호. `/8080` 은 `/` 로 301. 목록에 없는 번호는 404.
- 페이지(`app/page.tsx`, `app/[channel]/page.tsx`)가 채널 번호를 소켓 handshake 쿼리(`channel`)로 보내고, 서버는 그 채널의 `RoomState`(레거시 전역 `g_users_dic`, `g_djs`, `g_queue`… 를 묶은 것)에 소켓을 배정. 기존 `lolwiki.xyz:포트` 주소는 전환(P5) 시 옛 서버에서 새 주소로 리다이렉트한다.
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
.github/workflows/   compose.yaml   Dockerfile
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
   - 추가 옵션: Cloudflare 캐시 규칙으로 `/lolwiki_mirror` 를 엣지 캐시하면 EC2까지 오지도 않는다.

> 예상 효과: 게시판 관련 EC2 아웃바운드가 사실상 0에 수렴 (폴백 비율만큼만 발생).

### 3.2 정적 자산
- 압축: Cloudflare가 사용자 구간을 brotli로 압축하고, EC2→Cloudflare 구간은 Next `compress: true`(gzip)로 줄인다.
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

- **서버 엔트리** `server/index.ts`: `http.createServer` → Next request handler + Socket.IO attach. TLS는 NPM 담당(앱은 평문 HTTP 3000).
- **DB**: `mysql2/promise` 커넥션 풀(현재의 단일 커넥션 + 수동 재연결 제거), 모든 쿼리 파라미터 바인딩. 스키마는 **v2로 재설계**(§5.1), 레거시 데이터는 검증 가능한 스크립트로 이전(§5.2).
- **클라이언트 IP**: `X-Forwarded-For` 를 신뢰 프록시 단계 수(`TRUST_PROXY_HOPS`, 운영 2 = Cloudflare+NPM)만큼만 해석.
- **롤백 API**: `lolwiki-api.js`와 테스트(`lolwiki-api.test.js`)를 TS로 이식, 응답 캐시(목록 10~30초, 상세 60초, 블록 30초)는 방 간 공유.
- **TTS**: 생성한 음성 파일은 텍스트+보이스 해시로 캐시해 재사용(`/data/tts`).
- **로깅**: pino(JSON) → `docker logs`. 기존 `log('INFO', …)` 포맷 유지 가능.
- **헬스체크**: `/healthz` (P1: 프로세스·방 상태. P3에서 DB ping, 데이터 디렉터리 쓰기 가능 여부 추가).

---

### 5.1 DB 재설계 (v2 스키마, `db/migrations/0001_init.sql`)

레거시 문제
- 재생목록 곡 목록이 `Playlists.VideoList` JSON 배열 하나. 곡 하나를 넣고·빼고·옮길 때마다 배열 전체를 읽고 다시 씀.
- **노래가 한 곡 재생될 때마다** DJ 재생목록을 한 칸 순환시키느라 배열 전체를 다시 쓰고, 그 유저의 **모든 재생목록 + 모든 곡 정보**를 소켓으로 다시 보냄(`update_playlist`). 편집 한 번도 마찬가지.
- 계정의 재생목록 목록도 `Accounts.Playlists` JSON. 아이콘은 별도 `Icons` 테이블(이름으로 조인). 접속 기록(`Secures.ConnectData`)도 IP별 JSON을 로그인마다 통째로 다시 씀.
- 외래키·유일키가 없어 중복 영상 행, 깨진 참조, 주인 없는 재생목록이 실제로 쌓여 있음(2021 덤프 기준 영상 중복 23건, 고아 재생목록 21건).

v2 테이블

| 테이블 | 내용 | 레거시 |
| --- | --- | --- |
| `users` | 닉네임, 아이콘 id/버전, 현재·좋아요 재생목록, `playlist_rev` | Accounts + Icons |
| `playlists` | 소유자, 이름, 목록 내 순서(`sort_order`), 곡 수, 소프트 삭제 | Playlists + Accounts.Playlists |
| `playlist_items` | **곡 하나 = 행 하나**, `position`(간격 1024 정렬 키) | Playlists.VideoList |
| `videos` | `youtube_id` UNIQUE(대소문자 구분) | Videos |
| `bans` | IP LIKE 패턴 그대로 | Bans |
| `ip_user_stats`, `ip_notes` | (IP, 닉네임)별 접속 횟수·처음/마지막 접속, IP 메모 | Secures |
| `lolwiki_bookmarks` | 목록용 컬럼 + 상세 `detail` JSON, (owner, post_seq) UNIQUE | LoLWikiArchive |
| `lolwiki_memos` | (작성자, 대상) 메모 한 행 | LoLWikiMemos |
| `legacy_migration_issues` | 새 제약에 안 맞아 옮기지 못한 레거시 행의 **원본** | — |

연산 비용 변화
- 곡 추가/삭제: JSON 배열 재작성 → 행 INSERT/DELETE 1개.
- 순서 변경·재생 후 순환(맨 뒤로): 배열 재작성 → `position` UPDATE 1개 (이웃 사이 간격이 없을 때만 그 재생목록 재정렬).
- 로그인 기록: IP별 JSON 재작성 → `INSERT … ON DUPLICATE KEY UPDATE` 1개.
- 레거시 id(재생목록·영상·아이콘)는 그대로 보존 → 아이콘 파일(`static/icon/{id}.png`)과 검증이 그대로 맞음.

재생목록 동기화(트래픽)
- 접속 시 1회: 내 재생목록 전체 스냅샷 + `playlist_rev`. 클라이언트는 `localStorage`에 보관하고, 재접속 때 rev가 같으면 스냅샷을 다시 받지 않음.
- 이후에는 **변경분만** 전송: `playlist:item_added / item_removed / item_moved / renamed / created / deleted / current_changed` (rev 포함). 재생 순환은 `item_moved` 하나(수십 바이트).
- 같은 유저의 여러 탭은 `user:{id}` 소켓 룸으로 함께 갱신.
- 검색(재생목록 안 곡 이름 검색)은 기존처럼 클라이언트에 있는 데이터로 동작 → UI 동작 동일.

### 5.2 레거시 데이터 이전 (`scripts/db/migrate-legacy.ts`) — 유실 방지 설계

| 장치 | 내용 |
| --- | --- |
| 레거시 읽기 전용 | `START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT` — 레거시에 어떤 쓰기도 하지 않고, 읽는 동안 들어온 변경에 흔들리지 않는 한 시점의 스냅샷 |
| 대상 분리 | 레거시와 대상이 같은 DB면 중단. 대상은 별도 데이터베이스(`lolwikidj_v2`) |
| 모르는 데이터 감지 | 스크립트가 모르는 테이블·컬럼이 레거시에 있으면 중단(`--allow-unmapped`로만 진행) |
| 원자적 쓰기 | 대상 쓰기는 트랜잭션 하나. 실패 시 전부 롤백(실제로 테스트 중 3번 롤백됨) |
| 버리지 않기 | 중복 영상, 깨진 참조, 255자 넘는 쓰레기 닉네임 등은 `legacy_migration_issues`에 **원본 그대로** 저장 |
| 독립 검증 | 커밋 후 대상 DB를 다시 읽어, 변환 코드가 아니라 **레거시 원본과 직접** 비교: 모든 계정·재생목록 목록 순서·현재/좋아요 재생목록, 재생목록별 곡 순서(유튜브 id 열), 아이콘 id/버전, 접속 횟수 합계, 북마크·메모·차단 개수. 하나라도 다르면 exit 1 |
| 반복 실행 | 데이터 규모가 작아(2021 기준 수 초) 전환 직전에 `--reset-target`으로 처음부터 다시 돌리는 방식. 리허설을 몇 번이고 할 수 있음 |
| 레거시 비교 규칙 존중 | 아이콘↔계정 연결은 레거시 DB에서 직접 JOIN(레거시 collation), 접속 기록 닉네임은 레거시 JS처럼 정확히 비교(`utf8mb4_0900_bin`, 끝 공백 구분) |

테스트(2026-10-16): 2021 실제 덤프(계정 829, 재생목록 1,210, 영상 7,498) + 이후 추가된 테이블과 일부러 깨뜨린 엣지 케이스(`scripts/db/test/legacy-extras.sql`)로 실행 → **검증 통과**. 실데이터에서 발견해 반영한 것: 32자 넘는 닉네임, 700자짜리 닉네임, 끝 공백만 다른 닉네임(`'eq'`/`'eq '`), 결합 문자(zalgo) 닉네임.

전환 절차
1. 옛 서버에서 전체 백업: `mysqldump --single-transaction --routines --triggers LoLWikiDJ_DB | gzip` → 서버 밖(로컬/S3)에 보관.
2. 현재 스키마 확인: `scripts/db/inspect-legacy.sql` 결과로 2021 덤프 이후 추가된 컬럼을 확인하고 매핑에 반영(모르는 컬럼이 있으면 스크립트가 어차피 멈춤).
3. 리허설: 백업을 복원한 사본으로 `migrate-legacy` 실행 → 검증 통과 확인.
4. 실제 전환: 레거시 서비스 중지(쓰기 멈춤) → 백업 한 번 더 → `migrate-legacy --reset-target` → 검증 통과 → 새 서비스 시작. 레거시 DB는 지우지 않고 읽기 전용으로 일정 기간 보존.
5. 이후 v2 DB는 매일 `mysqldump` 백업(보관 기간 지정).

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

### 6.2 compose.yaml (EC2 snowywalk.me 서버)
- 서버에는 이미 nginx-proxy-manager(NPM)가 80/443을 점유하고 있고, 다른 서비스들은 외부 docker 네트워크 `proxy` 에 붙어 NPM이 컨테이너 이름으로 프록시한다. 같은 방식을 따른다.
- `app`: `container_name: dj2`, 포트 미노출, `proxy` 네트워크, `/data` 볼륨, `mem_limit: 512m` (RAM 2GB 서버를 공유하므로).
- TLS·도메인: NPM 프록시 호스트 `dj2.snowywalk.me → http://dj2:3000`, Websockets Support 켬. DNS는 Cloudflare.
- 클라이언트 IP: Cloudflare → NPM 두 단계라 `TRUST_PROXY_HOPS=2`.
- 압축: NPM 기본 설정이 JS/CSS를 압축하지 않으므로 Next(`compress: true`)가 gzip.
- 로그 로테이션: `logging: { driver: json-file, options: { max-size: 10m, max-file: 3 } }`.

### 6.3 배포 절차 (서버의 다른 앱들과 동일)
- 최초: `gh repo clone SnowyWalk/LoLWikiDJ2 ~/dj2` → `.env` 작성(`.env.example` 참고) → `./scripts/deploy.sh`
- 이후: `cd ~/dj2 && ./scripts/deploy.sh` (git pull → `docker compose up -d --build` → `/healthz` 확인)
- GitHub Actions 는 CI(타입 검사·린트·빌드)만 담당.

### 6.4 시크릿 (서버 `~/dj2/.env`, 다른 앱들과 동일)
| 이름 | 기존 위치 |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `db_config.txt` |
| `YOUTUBE_API_KEY` | 소스 하드코딩(`request_youtube_video`) — 재발급 권장 |
| `TWITCH_CLIENT_ID`, `TWITCH_SECRET` | `twitch_config.txt` |
| `DANBOORU_LOGIN`, `DANBOORU_API_KEY` | `danbooru_config.txt` |
| `GOOGLE_TTS_CREDENTIALS_JSON_B64` | `tts-api-*.json` (base64) |
| `TOONATION_SESSION_ID` | 소스 하드코딩 (재발급 권장) |
| `MASTER_IP` | 소스 하드코딩 `g_master_ip` |

`.gitignore`에 `.env*`, `data/`, `*.json` 자격증명 패턴 추가. 위 설정 파일들은 git 이력에 커밋된 적 없음을 확인함(`git log --all`).

---

## 7. 마이그레이션 단계

| 단계 | 내용 | 완료 기준 |
| --- | --- | --- |
| P0 (취소) | 레거시 프로젝트는 수정하지 않기로 함. 비용 절감은 P5 전환 시점에 한 번에 반영 | - |
| **P1 기반 ✅** | Next 16 + TS + Tailwind v4(preflight off) + shadcn(Radix) init, custom server(Socket.IO, 경로 기반 채널 배정), env/config, Docker/compose(NPM `proxy` 네트워크), CI/CD 골격 | `npm run build` 통과, 프로덕션 모드에서 `/healthz` OK, 방 배정 확인 (2026-10-16) |
| P2 계약 고정 | 소켓 이벤트 전수 목록(서버 on 약 70개, emit 포함) → `shared/events.ts` zod 스키마. 레거시 서버 대상 계약 테스트 | 계약 테스트가 레거시에 대해 통과 |
| P3 백엔드 이식 | handlers/services/RoomState/DB 풀/이미지 캐시/업로드. **레거시 프론트(dj.html)를 그대로 신규 서버에서 서빙**해서 검증 | 레거시 프론트 + 신규 서버로 친구들과 실사용 1주 |
| P4 프론트 이식 | 화면 단위로 React 컴포넌트화(로그인 → 플레이어 → 채팅 → 패널들 → 롤백 게시판), 매 단계 시각 회귀 0px | 전체 시나리오 diff 0 |
| P5 전환 | 옛 서버(lolwiki.xyz)의 각 포트·도메인을 `dj2.snowywalk.me/채널` 로 301 리다이렉트(또는 lolwiki.xyz DNS를 새 서버로 이전), 레거시 node 프로세스 중단, 1주 병행 모니터링 후 레거시 파일 `legacy/`로 이동 | 비용·에러 지표 확인 |
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
2. ~~MySQL~~ → **결정됨**: 기존 MySQL 그대로 사용. **단, 기존 MySQL은 다른 서버(lolwiki.xyz, 3.39.119.145)의 localhost에 있으므로 새 서버에서 접속할 경로가 필요** (P3 전까지 결정):
   - (a) 옛 서버 MySQL을 새 서버 IP(54.180.125.84)에만 열기: 보안그룹 3306 인바운드 1개 + `bind-address` + 해당 IP 전용 계정. 간단하지만 DB 포트가 인터넷에 노출됨(IP 제한).
   - (b) SSH 터널: 새 서버에서 옛 서버로 autossh 터널(컨테이너). 포트 노출 없음, 구성 요소 하나 추가.
   - (c) 데이터를 새 서버로 이전(MySQL 컨테이너). 전환 시 덤프/복원 필요, 2GB RAM 서버에 메모리 부담.
3. **`eval`/`evalall`(원격 코드 실행) 기능**: 유지/삭제.
4. **이미지 손실 압축(WebP 등)** 허용 범위: 기본은 무손실만.
5. **옛 서버(lolwiki.xyz) 처리**: 전환 후 인스턴스 종료 시 고정비 절감. 단 MySQL 위치(2번)와 연동.
6. 레거시 저장소의 이전 시도 산출물(`src/app`, `dist/`, `.omx/`, `data/*-smoke`) 및 `LoLWikiDJ2 (유기)` 폴더 정리 여부.
7. **롤백과사전(외부 사이트) 연동 사용성 개선** — 로그인 자격증명 입력/유지 방식 등이 불편함(사용자 요청, 2026-10-16). P3에서 `lolwiki-api` 이식 시 함께 재설계.
8. ~~배포 경로~~ → **결정됨**: 서버의 다른 앱들과 같은 방식(서버에서 직접 빌드, NPM 연결).
