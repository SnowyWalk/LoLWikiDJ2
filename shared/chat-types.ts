export type ChatMessageContent = | {
    type: "text";
    message: string;
} | {
    type: "image";
    imagePath: string;
    width: number;
    height: number;
    size: number;
};

export type ChatMessageDTO = {
    userId: string;
    nickname: string;
    createdAt: string;
    chatUuid: string;
    content: ChatMessageContent;
}

