"use client";

import { io, type Socket } from "socket.io-client";
import type { ChannelId } from "@/shared/channels";
import type { ClientToServerEvents, ServerToClientEvents } from "@/shared/events";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;
let socketChannel: ChannelId | null = null;

// 앱 전체에서 소켓 하나만 쓴다. (레거시의 전역 socket = io() 와 같은 역할)
export function getSocket(channel: ChannelId): AppSocket {
  if (socket && socketChannel !== channel) {
    socket.disconnect();
    socket = null;
  }
  if (!socket) {
    socket = io({ transports: ["websocket", "polling"], query: { channel } });
    socketChannel = channel;
  }
  return socket;
}
