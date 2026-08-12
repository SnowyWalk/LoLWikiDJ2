"use client";

import ChatPanel from "@/components/chat/ChatPanel.tsx";
import YoutubePlayer, {YoutubePlayerHandle} from "@/components/youtube/youtube-player.tsx";
import {useEffect, useRef, useState} from "react";
import {socket} from "@/socket.ts";
import {S2CPayloadType, S2CSocketEvent} from "@/socket/events.ts";

export default function Test_Chat() {
    const [youtubePlayerState, setYoutubePlayerState] = useState<YT.PlayerState | null>(null);
    const youtubeRemoteHandleRef = useRef<YoutubePlayerHandle>(null);


    useEffect(() => {
        const handleVideoPlay: S2CPayloadType[typeof S2CSocketEvent.VideoPlay] = (payload) =>  {
        if (payload.playerType === "youtube")
        {
            if (youtubeRemoteHandleRef.current === null)
                return;
            
            youtubeRemoteHandleRef.current.setVideo(payload.src);
            return;
        }
    };
        
        socket.on(S2CSocketEvent.VideoPlay, handleVideoPlay);
        return () => {
            socket.off(S2CSocketEvent.VideoPlay, handleVideoPlay);
        };
    }, []);
    
    
    useEffect(() => {
        const handle = requestAnimationFrame(() => {
            if (youtubeRemoteHandleRef.current === null)
                return;
            
            setYoutubePlayerState(youtubeRemoteHandleRef.current.getPlayerState());
        });
        
        return () => cancelAnimationFrame(handle);
    }, [])
    

    return (
        <div className="flex flex-row h-screen w-screen relative">
            <YoutubePlayer remoteHandle={youtubeRemoteHandleRef} className="h-fit min-w-0 flex-1"/>
            <ChatPanel className="w-88.5 h-full shrink-0"/>
            <span className="absolute left-60 bottom-5">{youtubePlayerState ?? "YT is not defined."}</span>
        </div>
    );
}
