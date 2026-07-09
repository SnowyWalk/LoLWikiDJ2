import {C2SSocketEvent, S2CSocketEvent} from "../events.ts";
import type {AppServer, AppServerSocket} from "../types.ts";

export default function registerChatHandler(io: AppServer, socket: AppServerSocket) {
    
    socket.on(C2SSocketEvent.ChatMessageCreate, (payload) => {
        console.log(`[chat] message received: ${payload.message}`);
        io.to(socket.data.channel).emit(S2CSocketEvent.ChatMessageCreated, {
            id: socket.data.id,
            message: payload.message,
            createdAt: Date.now().toLocaleString(),
        })
    })
    
}
