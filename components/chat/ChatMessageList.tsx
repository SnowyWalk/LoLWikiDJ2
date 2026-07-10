"use client";

import ChatMessage from "@/components/chat/ChatMessage.tsx";
import useChatMessages from "@/components/chat/hooks/useChatMessages.tsx";
import {useRef} from "react";
import useChatAutoScroll from "@/components/chat/hooks/useChatAutoScroll.tsx";
import {ChatMessageModel} from "@/components/chat/types.ts";
import {Button} from "@/components/ui/button.tsx";

type ChatMessageListProps = {
    scrollRequest: number;
}

export default function ChatMessageList({scrollRequest}: ChatMessageListProps) {
    const messageListRef = useRef<HTMLDivElement>(null);

    const {chatMessages} = useChatMessages();
    const {unreadCount, scrollToBottom} = useChatAutoScroll<ChatMessageModel>({
        messages: chatMessages,
        scrollDivRef: messageListRef,
        scrollRequest,
    });

    return (
        <div className="relative min-h-0 w-full grow">
            <div ref={messageListRef} className="h-full w-full overflow-y-auto">
                {
                    chatMessages.map(e => (
                        <ChatMessage
                            key={e.uuid}
                            chatMessageData={e}
                        />
                    ))
                }
            </div>

            {unreadCount > 0 && (
                <Button
                    className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-lg"
                    onClick={scrollToBottom}
                    aria-label={`새 메시지 ${unreadCount}개 보기`}
                >
                    새 메시지 {unreadCount}개
                </Button>
            )}
        </div>
    );
}
