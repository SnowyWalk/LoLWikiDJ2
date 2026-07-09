"use client";

import {useEffect} from "react";
import {socket} from "@/socket";

export default function SocketProvider({children}: { children: React.ReactNode }) {
    useEffect(() => {
        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            socket.disconnect();
        };
    }, []);
    
    return children;
}