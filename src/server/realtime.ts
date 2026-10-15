import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "@/shared/events";
import { env } from "./config";
import { logger } from "./logger";
import { isChannelId } from "@/shared/channels";
import { ROOMS } from "./rooms/rooms.config";
import { getRoomState } from "./rooms/RoomState";

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

// nginx 가 넣어준 X-Forwarded-For 에서 신뢰 가능한 위치의 IP만 꺼낸다.
export function clientIp(req: IncomingMessage): string {
  const forwarded = header(req, "x-forwarded-for");
  if (forwarded && env.TRUST_PROXY_HOPS > 0) {
    const hops = forwarded.split(",").map((part) => part.trim());
    const ip = hops[Math.max(0, hops.length - env.TRUST_PROXY_HOPS)];
    if (ip) return ip;
  }
  return req.socket.remoteAddress ?? "";
}

export function attachRealtime(httpServer: HttpServer): IoServer {
  const io: IoServer = new Server(httpServer, {
    maxHttpBufferSize: 5e7,
    pingTimeout: 120 * 1000,
    perMessageDeflate: { threshold: 1024 },
  });

  io.on("connection", (socket) => {
    const req = socket.request;
    // 클라이언트가 접속한 경로("/" 또는 "/1004")에서 채널을 정해 handshake 쿼리로 보낸다.
    const channel = socket.handshake.query.channel;
    const room = isChannelId(channel) ? ROOMS.find((r) => r.id === channel) : undefined;
    if (!room) {
      logger.warn({ channel }, "unknown channel");
      socket.disconnect(true);
      return;
    }

    const state = getRoomState(room);
    socket.data.room = state.id;
    socket.data.name = "";
    socket.data.ip = clientIp(req);
    void socket.join(state.id);
    socket.emit("room_info", { room: state.id });
  });

  return io;
}
