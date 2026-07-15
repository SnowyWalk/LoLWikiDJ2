"use client";

import useSocket from "@/hooks/useSocket";
import ChatPanel from "@/components/chat/ChatPanel.tsx";
import Image from "next/image";

export default function Test_Chat() {
    const {isConnected, transport} = useSocket();

    return (
        <>
            <div>
                <p>Status: {isConnected ? "connected" : "disconnected"}</p>
                <p>Transport: {transport}</p>
            </div>
            <ChatPanel/>
            <Image src="/static/images.png" alt="Next.js Logo" width={30} height={30} priority/>
        </>
    );
}
