// 서버↔클라이언트 Socket.IO 이벤트 계약.
// P2에서 레거시 이벤트(login, chat_message, chat_update, queue …) 전체를 이름·페이로드 그대로 옮겨온다.

export interface ServerToClientEvents {
  room_info: (data: { room: string }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {}

export interface SocketData {
  room: string;
  name: string;
  ip: string;
}
