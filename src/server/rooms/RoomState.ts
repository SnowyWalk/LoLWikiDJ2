import type { Socket } from "socket.io";
import type { RoomConfig } from "./rooms.config";

// 레거시 서버의 전역 변수(g_users_dic, g_djs, g_queue, g_video_* …)를 채널(방) 단위로 묶은 상태.
// 레거시에서는 포트마다 프로세스가 따로라 전역이었지만, 이제 한 프로세스가 모든 채널을 맡는다.

export interface RoomUser {
  socket: Socket;
  userId: number;
  iconId: number;
  iconVer: number;
  ip: string;
}

export interface QueueEntry {
  dj: string;
  video_id: string;
  is_twitch: boolean;
  data: { title: string; author: string; thumbnail_url: string; duration: number };
}

export interface RecentVideo {
  video_id: string;
  title: string;
  thumbnail: string;
  dj: string;
  duration: number;
}

export class RoomState {
  /** 닉네임 → 접속 정보 (레거시 g_users_dic) */
  readonly users = new Map<string, RoomUser>();
  djs: string[] = [];
  queue: QueueEntry[] = [];

  currentDj = "";
  videoId = "";
  videoTitle = "";
  videoThumbnail = "";
  videoAuthor = "";
  videoDuration = 0;
  playedTimeMs = 0;
  videoIsTwitch = false;
  endTimer: NodeJS.Timeout | null = null;

  goodList: string[] = [];
  badList: string[] = [];
  recentVideos: RecentVideo[] = [];
  /** 짤 중복 방지 (3분) */
  recentZzals: { date: number; url: string }[] = [];

  constructor(readonly config: RoomConfig) {}

  get id() {
    return this.config.id;
  }

  get isIdle() {
    return this.users.size === 0 && this.djs.length === 0 && this.queue.length === 0 && !this.videoId;
  }
}

const rooms = new Map<string, RoomState>();

export function getRoomState(config: RoomConfig): RoomState {
  let state = rooms.get(config.id);
  if (!state) {
    state = new RoomState(config);
    rooms.set(config.id, state);
  }
  return state;
}

/** 채널이 0~100000 까지 열려 있으므로, 아무도 없는 방은 메모리에서 내린다. */
export function releaseRoomIfIdle(id: string, connectedSockets: number) {
  const state = rooms.get(id);
  if (state && connectedSockets === 0 && state.isIdle) {
    if (state.endTimer) clearTimeout(state.endTimer);
    rooms.delete(id);
  }
}

export function roomStats() {
  return [...rooms.values()].map((room) => ({ id: room.id, users: room.users.size }));
}
