import Image from "next/image";

type ChatMessageProps = {
    imageUrl: string;
    nickname: string;
    time: string;
    body: string;
}

export default function ChatMessage({imageUrl, nickname, time, body} : ChatMessageProps)
{
    const dateTime = new Date(time);

    return (
        <div className="flow-root">
            <Image className="float-left m-2 rounded-full" src={imageUrl} alt="" width={60} height={60} />

            <div className="mt-2 mb-1 flex items-baseline gap-2">
                <span>{nickname}</span>
                <span className="text-xs text-muted-foreground">{dateTime.toLocaleTimeString()}</span>
            </div>

            <p className="ml-3 break-all">
                {body}
            </p>
        </div>
    )
}