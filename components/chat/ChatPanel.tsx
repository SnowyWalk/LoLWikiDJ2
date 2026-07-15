"use client";

import React, {useEffect, useState} from "react";
import {cn} from "@/lib/utils.ts";
import ChatInput from "@/components/chat/ChatInput.tsx";
import ChatMessageList from "@/components/chat/ChatMessageList.tsx";
import UseChatSendImage from "@/components/chat/hooks/useChatSendImage.tsx";
import ChatImageDropZone from "@/components/chat/ChatImageDropZone.tsx";

type ChatPanelProps = {
    className?: string;
}

export default function ChatPanel({className}: ChatPanelProps) {
    const [scrollRequest, setScrollRequest] = useState(0);
    const {uploadingMutationIDs, sendImages} = UseChatSendImage()

    useEffect(() => {

    }, [uploadingMutationIDs])

    return (
        <ChatImageDropZone onImagesDrop={sendImages}>
            <div className={cn("w-60 h-50 border-2 flex flex-col", className)}>
                <ChatMessageList scrollRequest={scrollRequest}/>
                <ChatInput onSend={() => setScrollRequest((request) => request + 1)}/>
            </div>
        </ChatImageDropZone>
    );
}


