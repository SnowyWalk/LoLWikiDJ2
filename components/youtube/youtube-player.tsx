"use client";

import {cn} from "@/lib/utils.ts";
import {useEffect, useRef} from "react";

declare global {
    interface Window {
        onYouTubeIframeAPIReady: () => void;
    }
}

type YtPlayerProps = {
    className?: string;
}

export default function YoutubePlayer({className}: YtPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);

    useEffect(() => {

        const createPlayer = () => {
            if (playerRef.current || !containerRef.current)
                return;

            playerRef.current = new YT.Player(containerRef.current, {
                height: "100%",
                width: "100%",
                videoId: "E4fK_B8ys9Y",
                events: {
                    onReady: () => {
                        console.log("onReady");
                    },
                }
            })
        }

        window.onYouTubeIframeAPIReady = createPlayer;

        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const script = document.createElement("script");
            script.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(script);
        }

        return () => {
            playerRef.current?.destroy();
            playerRef.current = null;
        };
    }, []);

    return (
        <div className={cn("relative w-full aspect-video", className)}>
            <div ref={containerRef} className="absolute inset-0 w-full h-full"/>
        </div>
    )
}