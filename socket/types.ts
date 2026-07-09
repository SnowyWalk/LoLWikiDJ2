import type {Server, Socket} from "socket.io";
import type {
    C2SPayloadType,
    InterServerPayloadType,
    S2CPayloadType,
    SocketData,
} from "./events.ts";

export type AppServer = Server<
    C2SPayloadType,
    S2CPayloadType,
    InterServerPayloadType,
    SocketData
>;

export type AppServerSocket = Socket<
    C2SPayloadType,
    S2CPayloadType,
    InterServerPayloadType,
    SocketData
>;

export type SocketPayload<T extends (...args: any[]) => any> = Parameters<T>[0];