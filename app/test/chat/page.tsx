"use client";

import useSocket from "@/hooks/useSocket";
import ChatPanel from "@/components/chat/ChatPanel.tsx";
import ChatImageDropZone from "@/components/chat/ChatImageDropZone.tsx";
import Image from "next/image";
import {useEffect, useRef, useState} from "react";

export default function Test_Chat() {
    const {isConnected, transport} = useSocket();
    const uploadingMutationIDRefs = useRef<string[]>([]);
    const [uploadingMutationIDs, setUploadingMutationIDs] = useState<string[]>([]);
    
    useEffect(()=>{
        setUploadingMutationIDs(uploadingMutationIDRefs?.current ?? [])
    }, [uploadingMutationIDRefs])

    return (
        <>
            <div>
                <p>Status: {isConnected ? "connected" : "disconnected"}</p>
                <p>Transport: {transport}</p>
            </div>
            <ChatImageDropZone uploadingMutationIDRefs={uploadingMutationIDRefs}>
                <ChatPanel className="w-100 h-50" uploadingMutationIDs={uploadingMutationIDs}/>
            </ChatImageDropZone>
            <Image src="/next.svg" alt="Next.js Logo" width={180} height={37} priority/>
            <Image src="/next.svg" alt="Next.js Logo" width={180} height={37} priority/>
        </>
    );
}
