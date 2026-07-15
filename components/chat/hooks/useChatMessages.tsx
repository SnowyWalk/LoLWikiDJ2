"use client";

import {useCallback, useEffect, useState} from "react";
import {S2CPayloadType, S2CSocketEvent} from "@/socket/events.ts";
import {socket} from "@/socket.ts";
import {ChatMessageModel} from "@/components/chat/types.ts";

export type ChatMessageData = {
    id: string;
    nickname: string;
    createdAt: Date;
    uuid: string;
    content: ChatMessageContent;
}

export type ChatMessageContent = |
    {
        type: "text";
        message: string;
    }
    | {
        type: "image";
        imageUrl: string;
        width: number;
        height: number;
        size: number;
    };

const useChatMessages = () => {
    const [chatMessages, setChatMessages] = useState<ChatMessageModel[]>([]);

    const addChatMessage = useCallback((message: ChatMessageModel) => {

    }, []);

    useEffect(() => {
        const handleChatMessageCreated: S2CPayloadType[typeof S2CSocketEvent.ChatMessageCreated] = (payload) => {
            const chatMessageData: ChatMessageModel = {
                id: payload.id,
                nickname: payload.nickname,
                message: payload.message,
                createdAt: new Date(payload.createdAt),
                uuid: payload.uuid,
            };

            setChatMessages((prev) => [...prev, chatMessageData]);
        };

        socket.on(S2CSocketEvent.ChatMessageCreated, handleChatMessageCreated);

        return () => {
            socket.off(S2CSocketEvent.ChatMessageCreated, handleChatMessageCreated);
        }
    }, []);

    return {chatMessages, addChatMessage};
}

export default useChatMessages;