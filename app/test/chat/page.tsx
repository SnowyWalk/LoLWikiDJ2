"use client";

import ChatMessage from "@/components/ChatMessage";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import useSocket from "@/hooks/useSocket";
import useNow from "@/hooks/useNow";
import {socket} from "@/socket";
import {C2SSocketEvent} from "@/socket/events";
import {useRef} from "react";


export default function Test_Chat() {
    const {isConnected, transport} = useSocket();
    const {now} = useNow();
    const inputRef = useRef<HTMLInputElement>(null);

    
    
    function onClickSendButton() {
        const message = inputRef.current?.value.trim();

        if (!message) {
            return;
        }

        socket.emit(C2SSocketEvent.ChatMessageCreate, {message});
    }

    return (
        <>
            <div>
                <p>Status: {isConnected ? "connected" : "disconnected"}</p>
                <p>Transport: {transport}</p>
            </div>
            <div className="w-60 h-50 border-2 overflow-auto">
                <>
                    <ChatMessage
                        imageUrl={"/static/images.png"}
                        time={now}
                        nickname={"123"}
                        body={"zxczcxzzzxczcxzzzxczcxzzzxczcxzzzxczcxzzzxczcxzz"}
                    />

                    <ChatMessage
                        imageUrl={"/static/images.png"}
                        time={now}
                        nickname={"123"}
                        body={"zxczcxzz"}
                    />

                    <ChatMessage
                        imageUrl={"/static/images.png"}
                        time={now}
                        nickname={"123"}
                        body={"zxczcxzz"}
                    />

                    <ChatMessage
                        imageUrl={"/static/images.png"}
                        time={new Date().toISOString()}
                        nickname={"123"}
                        body={"zxczcxzz"}
                    />

                </>
            </div>
            <div className="w-60">
                <Label htmlFor="asd">123</Label>
                <Input id="asd" ref={inputRef} type="text" autoComplete="off" placeholder="Enter text..."
                       aria-label={""}/>
                <Button onClick={onClickSendButton}>Send</Button>
            </div>
        </>
    );
}
