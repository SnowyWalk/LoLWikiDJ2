import registerChatHandler from "./handler/chat.handler.ts";
import type {AppServer} from "./types.ts";

export default function registerSocketEvents(io: AppServer) {

    io.on("connection", (socket) => {
        console.log(`[registerSocketEvents] io.on('connection') invoked. ${socket.id}`);

        registerChatHandler(io, socket);

        socket.on("disconnect", () => {
            console.log(`[registerSocketEvents] socket.on('disconnect') invoked. ${socket.id}`);
        })
    })

}
