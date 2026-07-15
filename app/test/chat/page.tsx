"use client";

import useSocket from "@/hooks/useSocket";
import ChatPanel from "@/components/chat/ChatPanel.tsx";
import Image from "next/image";

export default function Test_Chat() {
    const {isConnected, transport} = useSocket();

    return (
        <div className="flex flex-row h-screen">
            <div className="flex-1">
                <p>Status: {isConnected ? "connected" : "disconnected"}</p>
                <p>Transport: {transport}</p>
            </div>
            <ChatPanel className={"w-88.5 h-full flex-0"}/>
            {/*<Image src="/static/images.png" alt="Next.js Logo" width={30} height={30} priority/>*/}
        </div>
    );
}
