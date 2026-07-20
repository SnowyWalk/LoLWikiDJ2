"use client";

import React, {useMemo} from "react";
import {ChatMessageContent, ChatMessageDTO} from "@/shared/chat-types.ts";
import Image from "next/image";
import {formatFileSize} from "@/lib/utils.ts";

type ChatMessageProps = {
    chatMessageDTO: ChatMessageDTO;
}

export default function ChatMessage({chatMessageDTO}: ChatMessageProps) {
    const date = useMemo<string>(() => {
        return new Date(chatMessageDTO.createdAt).toLocaleDateString();
    }, [chatMessageDTO.createdAt]);

    const messageView = (content: ChatMessageContent) => {
        switch (content.type) {
            case "text":
                return content.message;
            case "image":
                const imageUrl = `/uploads/chat-images/${content.imagePath.replaceAll("\\", "/")}`;
                return (
                    <div className="flex flex-col">
                        <Image src={imageUrl}
                               className="rounded-2xl h-auto max-w-full pt-1.5 pb-1"
                               alt="image.."
                               width={content.width}
                               height={content.height}/>
                        <label className="w-full text-right text-muted-foreground text-xs pr-1">{formatFileSize(content.size)}</label>
                    </div>)
            default:
                const exhaustiveCheck: never = content;
                return exhaustiveCheck;
        }
    }

    return (
        <article
            className="relative mx-2 mt-2.5 mb-2 last:mb-0 flow-root rounded-[5px] bg-muted px-1.75 py-0.75 text-left whitespace-pre-line wrap-break-word">
            <Image
                src="/static/images.png"
                alt=""
                width={45}
                height={45}
                className="float-left mr-1.5 size-11.25 rounded-[30%]"/>

            <div> 
                <span className="pl-0.5">
                    {chatMessageDTO.nickname}
                </span>

                <time
                    dateTime={chatMessageDTO.createdAt}
                    className="ml-0.75 mt-1 inline-block align-top text-[12px] text-muted-foreground">
                    {date}
                </time>
            </div>

            <div>
                {messageView(chatMessageDTO.content)}
            </div>
        </article>
    );

    // return (
    //     <div className="flow-root">
    //         <Image className="m-2 mt-[6px] float-left rounded-none" src={"/static/images.png"} alt="" width={40} height={40} />
    //
    //         <div className="mt-0 mb-1 flex items-baseline gap-2">
    //             <span>{chatMessageDTO.nickname}</span>
    //             <span className="text-xs text-muted-foreground">{date}</span>
    //         </div>
    //
    //         <p className="ml-3 break-all">
    //             {messageView(chatMessageDTO.content)}
    //         </p>
    //     </div>
    // )
}