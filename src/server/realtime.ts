import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Server } from "socket.io";
import { isChannelId } from "@/shared/channels";
import { env } from "./config";
import { registerLegacyHandlers } from "./legacy/handlers";
import { logger } from "./logger";
import { roomConfig } from "./rooms/rooms.config";
import { getRoomState, releaseRoomIfIdle } from "./rooms/RoomState";

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

// nginx / Cloudflare 가 넣어준 X-Forwarded-For 에서 신뢰 가능한 위치의 IP만 꺼낸다.
export function clientIp(req: IncomingMessage): string {
  const forwarded = header(req, "x-forwarded-for");
  if (forwarded && env.TRUST_PROXY_HOPS > 0) {
    const hops = forwarded.split(",").map((part) => part.trim());
    const ip = hops[Math.max(0, hops.length - env.TRUST_PROXY_HOPS)];
    if (ip) return ip;
  }
  return (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
}

export function attachRealtime(httpServer: HttpServer): Server {
  // P3: 레거시 화면이 쓰는 이벤트(이름·형식 그대로)를 처리한다.
  const io = new Server(httpServer, {
    maxHttpBufferSize: 5e7, // 레거시: 이미지를 base64 로 보내므로 크게
    pingTimeout: 120 * 1000,
    perMessageDeflate: { threshold: 1024 },
  });

  io.on("connection", (socket) => {
    const channel = socket.handshake.query.channel;
    const room = isChannelId(channel) ? roomConfig(channel) : undefined;
    if (!room) {
      logger.warn({ channel }, "unknown channel");
      socket.disconnect(true);
      return;
    }

    const state = getRoomState(room);
    void socket.join(state.id);
    registerLegacyHandlers(io, socket, state, clientIp(socket.request));

    socket.on("disconnect", () => {
      releaseRoomIfIdle(state.id, io.sockets.adapter.rooms.get(state.id)?.size ?? 0);
    });
  });

  return io;
}
