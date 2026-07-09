import Image from "next/image";

export type ChatMessageData = {
    id: string;
    nickname: string;
    message: string;
    createdAt: Date;
}

type ChatMessageProps = {
    chatMessageData: ChatMessageData;
}

export default function ChatMessage({chatMessageData} : ChatMessageProps)
{
    return (
        <div className="flow-root">
            {/*<Image className="float-left m-2 rounded-full" src={""} alt="" width={60} height={60} />*/}

            <div className="mt-2 mb-1 flex items-baseline gap-2">
                <span>{chatMessageData.nickname}</span>
                <span className="text-xs text-muted-foreground">{chatMessageData.createdAt.toLocaleTimeString()}</span>
            </div>

            <p className="ml-3 break-all">
                {chatMessageData.message}
            </p>
        </div>
    )
}