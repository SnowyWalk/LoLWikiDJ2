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
        const handleVideoPlay: S2CPayloadType[typeof S2CSocketEvent.VideoPlay] = (payload) => {
            if (payload.playerType === "youtube") {
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
        let handle: number;

        const update = () => {
            if (youtubeRemoteHandleRef.current === null || !youtubeRemoteHandleRef.current.isReady()) {
                handle = requestAnimationFrame(update);
                return;
            }

            setYoutubePlayerState(youtubeRemoteHandleRef.current.getPlayerState());
            handle = requestAnimationFrame(update);
        }

        handle = requestAnimationFrame(update);

        return () => cancelAnimationFrame(handle);
    }, [])

    const playerStateNames: Record<number, string> = {
    [-1]: "UNSTARTED",
    [0]: "ENDED",
    [1]: "PLAYING",
    [2]: "PAUSED",
    [3]: "BUFFERING",
    [5]: "CUED",
};
    

    return (
        <div className="flex flex-row h-screen w-screen relative">
            {/*<YoutubePlayer remoteHandle={youtubeRemoteHandleRef} className="h-fit min-w-0 flex-1"/>*/}
            <YoutubePlayer remoteHandle={youtubeRemoteHandleRef} className="h-50 w-100"/>
            <ChatPanel className="w-88.5 h-full shrink-0"/>
            <span className="absolute left-60 bottom-5">{youtubePlayerState ? playerStateNames[youtubePlayerState] : "YT is not defined."}</span>
        </div>
    );
}
