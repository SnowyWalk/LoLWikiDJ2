"use client";

import ChatMessage from "@/components/chat/ChatMessage.tsx";
import useChatMessages from "@/components/chat/hooks/useChatMessages.tsx";
import {useRef} from "react";
import useChatAutoScroll from "@/components/chat/hooks/useChatAutoScroll.tsx";
import {Button} from "@/components/ui/button.tsx";
import {ChatMessageDTO} from "@/shared/chat-types.ts";
import {cn} from "@/lib/utils.ts";

type ChatMessageListProps = {
    scrollRequest: number;
    className?: string;
}

export default function ChatMessageList({scrollRequest, className}: ChatMessageListProps) {
    const messageListRef = useRef<HTMLDivElement>(null);

    const {chatMessages} = useChatMessages();
    const {unreadCount, scrollToBottom} = useChatAutoScroll<ChatMessageDTO>({
        messages: chatMessages,
        scrollDivRef: messageListRef,
        scrollRequest,
    });

    return (
        <div className={cn("relative min-h-0 w-full grow", className)}>
            <div ref={messageListRef} className="h-full w-full overflow-y-auto">
                {
                    chatMessages.map(e => (
                        <ChatMessage
                            key={e.chatUuid}
                            chatMessageDTO={e}
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
