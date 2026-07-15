import {ChatMessageContent} from "@/components/chat/hooks/useChatMessages.tsx";

export type ChatMessageModel = {
    id: string;
    nickname: string;
    createdAt: Date;
    uuid: string;
    content: ChatMessageContent;
}