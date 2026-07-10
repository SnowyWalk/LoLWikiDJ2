"use client";

import ChatMessage from "@/components/chat/ChatMessage.tsx";
import useChatMessages from "@/components/chat/hooks/useChatMessages.tsx";
import {useRef} from "react";
import useChatAutoScroll from "@/components/chat/hooks/useChatAutoScroll.tsx";
import {ChatMessageModel} from "@/components/chat/types.ts";

type ChatMessageListProps = {
    scrollRequest: number;
}

export default function ChatMessageList({scrollRequest}: ChatMessageListProps) {
    const messageListRef = useRef<HTMLDivElement>(null);

    const {chatMessages} = useChatMessages();
    useChatAutoScroll<ChatMessageModel>({
        messages: chatMessages,
        scrollDivRef: messageListRef,
        scrollRequest,
    });

    return (
        <div ref={messageListRef} className="overflow-auto w-full grow">
            {
                chatMessages &&
                chatMessages.map(e => (
                    <ChatMessage
                        key={e.uuid}
                        chatMessageData={e}
                    />
                ))
            }
        </div>
    );
}
