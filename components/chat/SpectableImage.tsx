"use client";

import Image from "next/image";
import {cn} from "@/lib/utils.ts";
import {useState, type MouseEvent} from "react";

type SpectableImageProps = {
    src: string;
    width: number;
    height: number;
    className?: string;
}

type PreviewPanel = {
    left: number;
    top: number;
    width: number;
    height: number;
};

const CURSOR_GAP = 4;
const VIEWPORT_PADDING = 8;
const PANEL_BORDER_WIDTH = 1;

export default function SpectableImage({src, width, height, className}: SpectableImageProps) {
    const [preview, setPreview] = useState<PreviewPanel | null>(null);

    const handleMouseMove = (event: MouseEvent<HTMLImageElement>) => {
        const image = event.currentTarget;

        // 실제 이미지의 원본 크기를 사용한다.
        const originalWidth = image.naturalWidth || width;
        const originalHeight = image.naturalHeight || height;

        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;

        const maxPanelWidth = Math.max(
            1,
            viewportWidth
            - VIEWPORT_PADDING * 2
            - PANEL_BORDER_WIDTH * 2,
        );

        const maxPanelHeight = Math.max(
            1,
            viewportHeight
            - VIEWPORT_PADDING * 2
            - PANEL_BORDER_WIDTH * 2,
        );

        // 원본 비율을 유지하며 뷰포트 안에 들어가도록 축소한다.
        // 1을 포함하므로 원본 크기 이상으로 확대되지는 않는다.
        const scale = Math.min(
            1,
            maxPanelWidth / originalWidth,
            maxPanelHeight / originalHeight,
        );

        const panelWidth = originalWidth * scale;
        const panelHeight = originalHeight * scale;

        const outerWidth = panelWidth + PANEL_BORDER_WIDTH * 2;
        const outerHeight = panelHeight + PANEL_BORDER_WIDTH * 2;

        const desiredLeft =
            event.clientX - CURSOR_GAP - outerWidth;

        const desiredTop =
            event.clientY - CURSOR_GAP - outerHeight;

        const left = Math.min(
            Math.max(desiredLeft, VIEWPORT_PADDING),
            viewportWidth - VIEWPORT_PADDING - outerWidth,
        );

        const top = Math.min(
            Math.max(desiredTop, VIEWPORT_PADDING),
            viewportHeight - VIEWPORT_PADDING - outerHeight,
        );

        setPreview({
            left,
            top,
            width: panelWidth,
            height: panelHeight,
        });
    };

    return (
        <div>
            <Image src={src} alt="Image" width={width} height={height} className={cn(className)}
                   onMouseMove={handleMouseMove}
                   onMouseLeave={() => setPreview(null)}/>
            {
                preview &&
                <div
                    className="
                        pointer-events-none fixed z-50
                        box-content overflow-hidden rounded-md
                        border border-muted-foreground
                    "
                    style={{
                        left: preview.left,
                        top: preview.top,
                        width: preview.width,
                        height: preview.height,
                    }}>
                    <Image src={src} alt="Image" width={width} height={height}
                           className="block size-full object-contain "/>
                </div>
            }
        </div>
    )
}