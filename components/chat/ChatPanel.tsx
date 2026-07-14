"use client";

import React, {useEffect, useState} from "react";
import {cn} from "@/lib/utils.ts";
import ChatInput from "@/components/chat/ChatInput.tsx";
import ChatMessageList from "@/components/chat/ChatMessageList.tsx";
import { toast } from "sonner"

type ChatPanelProps = {
    className?: string;
    uploadingMutationIDs: string[];
}

export default function ChatPanel({className, uploadingMutationIDs}: ChatPanelProps) {
    const [scrollRequest, setScrollRequest] = useState(0);
    
    useEffect(() => {
        toast(`uploadingMutationIDs: ${uploadingMutationIDs}`)
    }, [uploadingMutationIDs])

    return (
        <div className={cn("w-60 h-50 border-2 flex flex-col ", className)}>
            <ChatMessageList scrollRequest={scrollRequest}/>
            <ChatInput onSend={() => setScrollRequest((request) => request + 1)}/>
        </div>
    );
}


