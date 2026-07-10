"use client";

import {useEffect, useState} from "react";
import {S2CPayloadType, S2CSocketEvent} from "@/socket/events.ts";
import {socket} from "@/socket.ts";
import {ChatMessageModel} from "@/components/chat/types.ts";

const useChatMessages = () => {
    const [chatMessages, setChatMessages] = useState<ChatMessageModel[]>([]);

    useEffect(() => {
        const handleChatMessageCreated: S2CPayloadType[typeof S2CSocketEvent.ChatMessageCreated] = (payload) => {
            const chatMessageData: ChatMessageModel = {
                id: payload.id,
                nickname: payload.nickname,
                message: payload.message,
                createdAt: new Date(payload.createdAt),
                uuid: payload.uuid,
            };

            console.log(payload, chatMessageData);

            setChatMessages((prev) => [...prev, chatMessageData]);
        };

        socket.on(S2CSocketEvent.ChatMessageCreated, handleChatMessageCreated);

        return () => {
            socket.off(S2CSocketEvent.ChatMessageCreated, handleChatMessageCreated);
        }
    }, []);

    return {chatMessages};
}

export default useChatMessages;