"use client";

import {useRef} from "react";
import {socket} from "@/socket.ts";
import {C2SSocketEvent} from "@/socket/events.ts";
import {Input} from "@/components/ui/input.tsx";
import {cn} from "@/lib/utils.ts";
import {Button} from "@/components/ui/button.tsx";
import {SendHorizontalIcon} from "lucide-react";

type ChatInputProps = {
    children?: React.ReactNode;
    className?: string;
    onSend?: () => void;
    onImagePaste?: (files: File[]) => void;
};

export default function ChatInput({children, className, onSend, onImagePaste}: ChatInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const sendMessage = (message: string) => {
        socket.emit(C2SSocketEvent.ChatMessageCreate, {message});
        onSend?.();

        inputRef.current!.value = "";
    }

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter")
            return;

        const message = inputRef.current!.value.trim();
        if (!message)
            return;

        sendMessage(message);
    }

    const handleClickedSendButton = () => {
        const message = inputRef.current!.value.trim();
        if (!message)
            return;

        sendMessage(message);
    }

    const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const images = Array.from(e.clipboardData?.items).filter(item => item.type.startsWith("image/")).map(data => data.getAsFile()).filter((file): file is File => file !== null);
        if (images.length == 0)
            return;

        e.preventDefault();
        onImagePaste?.(images);
    }

    return (
        <div className={cn("w-full", className)}>
            {children}

            <div className="w-full h-10 flex flex-row items-center">
                <Input type="text"
                       ref={inputRef}
                       onKeyDown={handleInputKeyDown}
                       onPaste={handleInputPaste}
                       className="w-full h-full px-2 mr-1.5 grow"
                       placeholder="Enter text..."
                       aria-label=""/>
                <Button
                    onClick={handleClickedSendButton}
                    className="grow-0 h-full"><SendHorizontalIcon /></Button>
            </div>
        </div>
    )
}