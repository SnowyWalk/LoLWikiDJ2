"use client";

import React, {useEffect, useState} from "react";
import {cn} from "@/lib/utils.ts";
import ChatInput from "@/components/chat/ChatInput.tsx";
import ChatMessageList from "@/components/chat/ChatMessageList.tsx";
import UseChatSendImage from "@/components/chat/hooks/useChatSendImage.tsx";
import ChatImageDropZone from "@/components/chat/ChatImageDropZone.tsx";
import {Spinner} from "@/components/ui/spinner";
import {ImageUpIcon} from "lucide-react";

type ChatPanelProps = {
    className?: string;
}

export default function ChatPanel({className}: ChatPanelProps) {
    const [scrollRequest, setScrollRequest] = useState(0);
    const {uploadingMutationIDs, sendImages} = UseChatSendImage()
    const hasUploadImage = uploadingMutationIDs.length > 0;

    const handleBeforeSendImages = (files: File[]) => {
        console.log("handleBeforeSendImages", files);
        sendImages(files);
    };

    useEffect(() => {
        // TODO: 표현
    }, [uploadingMutationIDs])

    return (
        <ChatImageDropZone onImagesDrop={handleBeforeSendImages}>
            <div className={cn("border-l flex flex-col", className)}>
                <ChatMessageList scrollRequest={scrollRequest}/>

                <ChatInput
                    onSend={() => setScrollRequest((request) => request + 1)}
                    onImagePaste={handleBeforeSendImages}
                    className="px-2 pb-2.5 pt-1 h-fit flex flex-col items-center">
                    <div
                        className="
                        grid grid-rows-[0fr] opacity-0
                        transition-[grid-template-rows,opacity]
                        duration-300 ease-out
                        data-[visible=false]:pt-1
                        data-[visible=true]:grid-rows-[1fr]
                        data-[visible=true]:opacity-100"
                        data-visible={uploadingMutationIDs.length > 0}>
                        <div
                            className="min-h-0 overflow-hidden">
                            <div className="flex flex-row gap-1 items-center justify-center py-1 px-2 mb-1 border w-fit bg-muted rounded-2xl text-center text-xs ">
                                <ImageUpIcon className="size-4"/>
                                <label>이미지 {uploadingMutationIDs.length}개 업로드 중...</label>
                                <Spinner/>
                            </div>
                        </div>
                    </div>
                </ChatInput>
            </div>
        </ChatImageDropZone>
    );
}


