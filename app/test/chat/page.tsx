"use client";

import useSocket from "@/hooks/useSocket";
import ChatPanel from "@/components/chat/ChatPanel.tsx";

export default function Test_Chat() {
    const {isConnected, transport} = useSocket();

    return (
        <>
            <div>
                <p>Status: {isConnected ? "connected" : "disconnected"}</p>
                <p>Transport: {transport}</p>
            </div>
            <ChatPanel className="w-100 h-50"/>
        </>
    );
}
