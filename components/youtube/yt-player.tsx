"use client";

import {cn} from "@/lib/utils.ts";
import {useEffect, useRef} from "react";

type YtPlayerProps = {
    className?: string;
}

export default function YtPlayer({className}: YtPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);

    useEffect(() => {
        
        const createPlayer = () => {
            if (playerRef.current || !containerRef.current)
                return;
            
            playerRef.current = new YT.Player(containerRef.current, {
                height: "100%",
                width: "100%",
                videoId: "dQw4w9WgXcQ",
            })
        }
        
        
    }, []);
    
    return (
        <div className={cn("relative w-full aspect-video", className)}>
            <div ref={containerRef} className="absolute inset-0 w-full h-full"/>
        </div>
    )
}