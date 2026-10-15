import type { ChannelId } from "@/shared/channels";

// 레거시 포트별 서버 파일(1004.js, 1111.js …)에서 가져온 채널 공지. 그 밖의 채널은 공지 없음.
const NOTICES: Record<string, string> = {
  "8080": "",
  "8081": "여기는 8081 음악 감상 채널 입니당",
  "8082": "여기는 8082 영화 감상 채널 입니당 ",
  "8083":
    "여기는 8083 인방 채널 입니당\n1080p 제한 해제: https://chrome.google.com/webstore/detail/ttv-lol/ofbbahodfeppoklmgjiokgfdgcndngjm/related",
  "1004": "디아 전용 채널\n개설일 : 2021-12-28",
  "1111": "서버 개설일자: 2022-01-21\n소유자: 다정이",
  "1128": "서버 개설일자: 2022-04-24\n소유자: 코에서코로",
  "1224": "/img https://lolwiki.xyz/static/1.png",
  "1337": "공부채널입니다. (정숙)",
  "1557": "여기는 1557 눈물 전용 채널입니당\n(슬픈 영상만 허용)",
  "2250": "서버 개설일자: 2022-02-11\n소유자: 김네모",
  "3939": "서버 개설일자: 2021-10-03\n소유자: 우뭇가사리\n입찰가: 까방권 1일",
  "4010": "서버 개설일자: 2022-05-24\n소유자: pagolas",
  "49415": "서버 개설일자: 2021-05-12\n소유자: 두림\n판매가: 500원",
  "5599": "서버 개설일자: 2022-05-12\n소유자: 에양",
};

export interface RoomConfig {
  id: ChannelId;
  notice: string;
}

export function roomConfig(id: ChannelId): RoomConfig {
  return { id, notice: NOTICES[id] ?? "" };
}
