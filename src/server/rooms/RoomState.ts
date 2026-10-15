import type { RoomConfig } from "./rooms.config";

// 레거시 서버의 전역 변수(g_users_dic, g_djs, g_queue …)를 방 단위로 묶은 상태.
// 핸들러 이식(P3) 때 필드가 채워진다.
export class RoomState {
  readonly users = new Map<string, { socketId: string; iconId: number; iconVer: number; ip: string }>();
  djs: string[] = [];
  queue: unknown[] = [];

  constructor(readonly config: RoomConfig) {}

  get id() {
    return this.config.id;
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
  if (state && connectedSockets === 0 && state.users.size === 0 && state.djs.length === 0 && state.queue.length === 0)
    rooms.delete(id);
}

export function roomStats() {
  return [...rooms.values()].map((room) => ({ id: room.id, users: room.users.size }));
}
