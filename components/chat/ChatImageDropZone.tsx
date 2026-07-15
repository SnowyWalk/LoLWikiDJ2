"use client";

import React, {ReactNode, useRef, useState} from "react";

type useDropzoneProps = {
    children: ReactNode;
    onImagesDrop?: (files: File[]) => void;
};

export default function ChatImageDropZone({children, onImagesDrop}: useDropzoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const dragOverCountRef = useRef<number>(0);

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        dragOverCountRef.current += 1;
        setIsDragOver(dragOverCountRef.current > 0);
    }
    
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        dragOverCountRef.current = Math.max(0, dragOverCountRef.current - 1);
        setIsDragOver(dragOverCountRef.current > 0);
    }

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        dragOverCountRef.current = 0;
        setIsDragOver(false);

        const dropImages = Array.from(e.dataTransfer?.files).filter(item => item.type.startsWith("image/"));
        if (dropImages.length == 0) {
            e.dataTransfer.dropEffect = "none";
            return;
        }
        e.dataTransfer.dropEffect = "copy";

        onImagesDrop?.(dropImages);
    }

    return (
        <div className="relative w-fit" 
             onDragEnter={handleDragEnter}
             onDragOver={handleDragOver} 
             onDragLeave={handleDragLeave} 
             onDrop={handleDrop}>
            {children}

            {
                isDragOver &&
                <div
                    className="absolute inset-0 justify-center items-center text-center flex backdrop-blur-[2px] pointer-events-none">
                    <div
                        className="flex-1 mx-5 h-24 border-2 rounded-2xl bg-muted text-2xl flex items-center justify-center text-center">Drop
                        files here
                    </div>
                </div>
            }
        </div>

    );
}