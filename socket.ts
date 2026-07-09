"use client";

import { io, Socket } from "socket.io-client";
import {C2SPayloadType, S2CPayloadType} from "@/socket/events";

export const socket: Socket<S2CPayloadType, C2SPayloadType> = io({autoConnect: false});