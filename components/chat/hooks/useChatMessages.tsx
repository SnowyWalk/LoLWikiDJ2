"use client";

import {useCallback, useEffect, useState} from "react";
import {S2CPayloadType, S2CSocketEvent} from "@/socket/events.ts";
import {socket} from "@/socket.ts";
import {ChatMessageDTO} from "@/shared/chat-types.ts";

const useChatMessages = () => {
    const [chatMessages, setChatMessages] = useState<ChatMessageDTO[]>([]);

    const addChatMessage = useCallback((chatMessageDTO: ChatMessageDTO) => {
        setChatMessages((prev) => [...prev, chatMessageDTO]);
    }, []);

    useEffect(() => {
        const handleChatMessageCreated: S2CPayloadType[typeof S2CSocketEvent.ChatMessageCreated] = (payload) => {
            addChatMessage(payload.info);
        };

        const handleChatImageCreated: S2CPayloadType[typeof S2CSocketEvent.ChatImageCreated] = (payload) => {
            if (!payload.isSuccess) {
                console.error("ChatImageCreated failed", payload.error); // TODO: 웹에서 표현
                addChatMessage({
                    userId: "system",
                    nickname: "System",
                    createdAt: new Date().toISOString(),
                    chatUuid: crypto.randomUUID(),
                    content: {
                        type: "text",
                        message: "이미지 업로드 실패;;",
                    }
                })
                return;
            }

            addChatMessage(payload.info);
        }

        socket.on(S2CSocketEvent.ChatMessageCreated, handleChatMessageCreated);
        socket.on(S2CSocketEvent.ChatImageCreated, handleChatImageCreated);

        return () => {
            socket.off(S2CSocketEvent.ChatMessageCreated, handleChatMessageCreated);
            socket.off(S2CSocketEvent.ChatImageCreated, handleChatImageCreated);
        }
    }, [addChatMessage]);

    return {chatMessages, addChatMessage};
}

export default useChatMessages;