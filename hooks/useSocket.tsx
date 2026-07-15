"use client";

import {useEffect, useState} from "react";
import {socket} from "@/socket";


export default function useSocket() {
    const [isConnected, setIsConnected] = useState(false);
    const [transport, setTransport] = useState<string>("N/A");

    useEffect(() => {
        if (socket.connected)
            onConnect();

        function onConnect() {
            setIsConnected(true);
            setTransport(socket.io.engine.transport.name);

            socket.io.engine.on("upgrade", (transport) => {
                setTransport(transport.name);
            })
        }

        function onDisconnect(reason: string, details: unknown) {
            console.log("socket disconnected", reason, details);
            setIsConnected(false);
            setTransport("N/A");
        }

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        }
    }, [])

    return {isConnected, transport}
}