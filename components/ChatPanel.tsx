"use client";

import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {S2CPayloadType, S2CSocketEvent} from "@/socket/events.ts";
import {socket} from "@/socket.ts";
import {cn} from "@/lib/utils.ts";

type ChatPanelProps = {
    className?: string;
}

export default function ChatPanel({className}: ChatPanelProps) {
    const chatPanelRef = useRef<HTMLDivElement>(null);
    const shouldStickToBottom = useRef(true);
    const {chatList} = UseChatMessages();

    useLayoutEffect(() => {
        const panel = chatPanelRef.current;
        if (panel == null)
            return;

        if (shouldStickToBottom.current) {
            panel.scrollTop = panel.scrollHeight;
        }
    }, [chatList]);

    function handleScroll() {
        const panel = chatPanelRef.current;
        if (panel == null)
            return;

        const threshold = 8;

        shouldStickToBottom.current =
            panel.scrollHeight - panel.scrollTop - panel.clientHeight <= threshold;
    }

    return (
        <div ref={chatPanelRef} onScroll={handleScroll} className={cn("w-60 h-50 border-2 overflow-auto", className)}>
            {
                chatList &&
                chatList.map(e => (
                    <ChatMessage
                        key={e.uuid}
                        chatMessageData={e}
                    />
                ))
            }
        </div>
    );
}

type ChatMessageData = {
    id: string;
    nickname: string;
    message: string;
    createdAt: Date;
    uuid: string;
}

type ChatMessageProps = {
    chatMessageData: ChatMessageData;
}

function ChatMessage({chatMessageData}: ChatMessageProps) {
    return (
        <div className="flow-root">
            {/*<Image className="float-left m-2 rounded-full" src={""} alt="" width={60} height={60} />*/}

            <div className="mt-2 mb-1 flex items-baseline gap-2">
                <span>{chatMessageData.nickname}</span>
                <span className="text-xs text-muted-foreground">{chatMessageData.createdAt.toLocaleTimeString()}</span>
            </div>

            <p className="ml-3 break-all">
                {chatMessageData.message}
            </p>
        </div>
    )
}

function UseChatMessages() {
    const [chatList, setChatList] = useState<ChatMessageData[]>([]);

    useEffect(() => {
        const handleChatMessageCreated: S2CPayloadType[typeof S2CSocketEvent.ChatMessageCreated] = (payload) => {
            const chatMessageData: ChatMessageData = {
                id: payload.id,
                nickname: payload.nickname,
                message: payload.message,
                createdAt: new Date(payload.createdAt),
                uuid: payload.uuid,
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
