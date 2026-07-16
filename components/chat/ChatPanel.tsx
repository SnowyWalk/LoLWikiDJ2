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
        // TODO: 표현
    }, [uploadingMutationIDs])

    return (
        <ChatImageDropZone onImagesDrop={sendImages}>
            <div className={cn("border-l-1 flex flex-col", className)}>
                <ChatMessageList scrollRequest={scrollRequest}/>
                <ChatInput 
                    onSend={() => setScrollRequest((request) => request + 1)} 
                    onImagePaste={sendImages}
                    className="px-2 pb-2.5 pt-2 h-15"/>
            </div>
        </ChatImageDropZone>
    );
}


