"use client";

import React, {useState} from "react";
import {cn} from "@/lib/utils.ts";
import ChatInput from "@/components/chat/ChatInput.tsx";
import ChatMessageList from "@/components/chat/ChatMessageList.tsx";

type ChatPanelProps = {
    className?: string;
}

export default function ChatPanel({className}: ChatPanelProps) {
    const [scrollRequest, setScrollRequest] = useState(0);

    return (
        <div className={cn("w-60 h-50 border-2 flex flex-col ", className)}>
            <ChatMessageList scrollRequest={scrollRequest}/>
            <ChatInput onSend={() => setScrollRequest((request) => request + 1)}/>
        </div>
    );
}


