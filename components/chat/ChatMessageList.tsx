"use client";

import ChatMessage from "@/components/chat/ChatMessage.tsx";
import useChatMessages from "@/components/chat/hooks/useChatMessages.tsx";
import {RefObject, useLayoutEffect, useRef} from "react";
import useChatAutoScroll from "@/components/chat/hooks/useChatAutoScroll.tsx";
import {ChatMessageModel} from "@/components/chat/types.ts";

type ChatMessageListProps = {
    scrollToBottomRequestRef: RefObject<boolean>;
}

export default function ChatMessageList({scrollToBottomRequestRef}: ChatMessageListProps) {
    const messageListRef = useRef<HTMLDivElement>(null);

    const {chatMessages} = useChatMessages();
    const {scrollToBottom} = useChatAutoScroll<ChatMessageModel>({l: chatMessages, scrollDivRef: messageListRef});

    useLayoutEffect(() => {
        if (scrollToBottomRequestRef.current) {
            scrollToBottomRequestRef.current = false;
            scrollToBottom();
        }
    }, [scrollToBottom, scrollToBottomRequestRef])

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