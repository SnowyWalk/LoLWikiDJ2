"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { ChannelId } from "@/shared/channels";

// P1 확인용: 소켓 연결과 채널 배정이 되는지만 보여준다. P4에서 제거된다.
export function ConnectionStatus({ channel }: { channel: ChannelId }) {
  const [room, setRoom] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket(channel);
    const onRoom = (data: { room: string }) => setRoom(data.room);
    socket.on("room_info", onRoom);
    return () => {
      socket.off("room_info", onRoom);
    };
  }, [channel]);

  return <p data-testid="room">{room ? `room ${room}` : "connecting..."}</p>;
}
