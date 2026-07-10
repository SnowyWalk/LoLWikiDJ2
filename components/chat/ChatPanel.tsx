"use client";

import React, {useRef} from "react";
import {cn} from "@/lib/utils.ts";
import ChatInput from "@/components/chat/ChatInput.tsx";
import ChatMessageList from "@/components/chat/ChatMessageList.tsx";

type ChatPanelProps = {
    className?: string;
}

export default function ChatPanel({className}: ChatPanelProps) {
    const scrollToBottomRequested = useRef(false);

    return (
        <div className={cn("w-60 h-50 border-2 flex flex-col ", className)}>
            <ChatMessageList scrollToBottomRequestRef={scrollToBottomRequested}/>
            <ChatInput onSend={() => scrollToBottomRequested.current = true}/>
        </div>
    );
}


