"use client";

import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import useSocket from "@/hooks/useSocket";
import {socket} from "@/socket";
import {C2SSocketEvent} from "@/socket/events";
import {useRef} from "react";
import ChatPanel from "@/components/ChatPanel.tsx";

export default function Test_Chat() {
    const {isConnected, transport} = useSocket();
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
            <ChatPanel className="w-100 h-50"/>
            <div className="w-60">
                <Label htmlFor="asd">123</Label>
                <Input id="asd" ref={inputRef} type="text" autoComplete="off" placeholder="Enter text..."
                       aria-label={""}/>
                <Button onClick={onClickSendButton}>Send</Button>
            </div>
        </>
    );
}
