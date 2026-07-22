"use client";

import {cn} from "@/lib/utils.ts";

type YtPlayerProps = {
    className?: string;
}

export default function YtPlayer({className}: YtPlayerProps) {


    return (
        <div className={cn("relative w-full aspect-video", className)}>
            <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/XO8uwiM0PdA"
                title="YouTube video player"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
            ></iframe>
        </div>
    )
}