"use client";

import {useEffect, useState} from "react";
import {ChatMessageData} from "@/components/ChatMessage.tsx";
import {S2CPayloadType, S2CSocketEvent} from "@/socket/events.ts";
import {socket} from "@/socket.ts";


export default function UseChatMessages() {
    const [chatList, setChatList] = useState<ChatMessageData[]>([]);

    useEffect(() => {
        const handleChatMessageCreated: S2CPayloadType[typeof S2CSocketEvent.ChatMessageCreated] = (payload) => {
            const chatMessageData: ChatMessageData = {
                id: payload.id,
                nickname: payload.nickname,
                message: payload.message,
                createdAt: new Date(payload.createdAt),
            };

            console.log(payload, chatMessageData);

            setChatList((prev) => [...prev, chatMessageData]);
        };

        socket.on(S2CSocketEvent.ChatMessageCreated, handleChatMessageCreated);

        return () => {
            socket.off(S2CSocketEvent.ChatMessageCreated, handleChatMessageCreated);
        }
    }, []);
    
    return {chatList};
}
