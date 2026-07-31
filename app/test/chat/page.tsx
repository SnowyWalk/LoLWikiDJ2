"use client";

import useSocket from "@/hooks/useSocket";
import ChatPanel from "@/components/chat/ChatPanel.tsx";
import YtPlayer from "@/components/youtube/yt-player.tsx";
import {useState} from "react";

export default function Test_Chat() {
    
    return (
        <div className="flex flex-row h-screen w-screen">
            <YtPlayer className="h-fit min-w-0 flex-1"/>
            <ChatPanel className="w-88.5 h-full shrink-0"/>
        </div>
    );
}
