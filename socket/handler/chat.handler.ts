import {C2SSocketEvent, S2CSocketEvent} from "../events.ts";
import type {AppServer, AppServerSocket} from "../types.ts";

export default function registerChatHandler(io: AppServer, socket: AppServerSocket) {
    
    socket.on(C2SSocketEvent.ChatMessageCreate, (payload) => {
        console.log(`[chat] message received: ${payload.message}`);
        io.to(socket.data.channel).emit(S2CSocketEvent.ChatMessageCreated, {
            id: socket.data.id,
            nickname: socket.data.nickname,
            message: payload.message,
            createdAt: new Date().toISOString(),
            uuid: crypto.randomUUID(),
        })
        
    })
    
}
