"use client";

import {cn} from "@/lib/utils.ts";
import {Ref, useEffect, useImperativeHandle, useRef} from "react";

declare global {
    interface Window {
        onYouTubeIframeAPIReady: () => void;
    }
}

export interface VideoPlayerHandle { // 나중에 다른 플레이어도 생기면 공용코드 shared로 빼자
    isReady(): boolean;

    getCurrentTime(): number;

    getDuration(): number;

    getVolume(): number;

    setVolume(volume: number): void;

    setVideo(src: string): void;

    play(): void;

    pause(): void;

    seekTo(seconds: number): void;

    stop(): void;
}

export interface YoutubePlayerHandle extends VideoPlayerHandle {
    getVideoId(): string;

    getVideoUrl(): string;

    getVideoTitle(): string;

    getVideoAuthor(): string;

    getPlayerState(): YT.PlayerState;
}

type YtPlayerProps = {
    remoteHandle: Ref<YoutubePlayerHandle>;
    className?: string;
}

export default function YoutubePlayer({remoteHandle, className}: YtPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YT.Player | null>(null);
    const isPlayerReadyRef = useRef(false);

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
                        isPlayerReadyRef.current = true;
                    },
                }
            })
        }

        if (window.YT?.Player) {
            createPlayer();
        } else {
            window.onYouTubeIframeAPIReady = createPlayer;
            if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
                const script = document.createElement("script");
                script.src = "https://www.youtube.com/iframe_api";
                document.head.appendChild(script);
            }
        }

        return () => {
            playerRef.current?.destroy();
            playerRef.current = null;
            isPlayerReadyRef.current = false;
        };
    }, []);

    useImperativeHandle(remoteHandle, () => ({
        isReady: () => isPlayerReadyRef.current,

        getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
        getDuration: () => playerRef.current?.getDuration() ?? 0,
        getVolume: () => playerRef.current?.getVolume() ?? 0,
        setVolume: (volume: number) => playerRef.current?.setVolume(volume),

        setVideo: (videoId: string) => playerRef.current?.cueVideoById(videoId),
        play: () => playerRef.current?.playVideo(),
        pause: () => playerRef.current?.pauseVideo(),
        seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
        stop: () => playerRef.current?.stopVideo(),

        getVideoId: () => playerRef.current?.getVideoData().video_id ?? "",
        getVideoUrl: () => playerRef.current?.getVideoUrl() ?? "",
        getVideoTitle: () => playerRef.current?.getVideoData()?.title ?? "",
        getVideoAuthor: () => playerRef.current?.getVideoData()?.author ?? "",
        getPlayerState: () => playerRef.current?.getPlayerState() ?? YT.PlayerState.UNSTARTED,
    }), []);

    return (
        <div className={cn("relative w-full aspect-video", className)}>
            <div ref={containerRef} className="absolute inset-0 w-full h-full"/>
        </div>
    )
}