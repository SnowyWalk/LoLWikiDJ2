export const C2SSocketEvent = {
    Login: "login:login",
    ChatMessageCreate: "chat:message:create",
} as const;

export const S2CSocketEvent = {
    LoginResult: "login:result",
    ChatMessageCreated: "chat:message:created",
} as const;

export type C2SPayloadType = {
    [C2SSocketEvent.Login]: (payload: {
        nickname: string;
        channel: string;
    }) => void, 
    [C2SSocketEvent.ChatMessageCreate]: (payload: {
        message: string;
    }) => void;
};

export type S2CPayloadType = {
    [S2CSocketEvent.LoginResult]: (payload: {
        id: string;
        nickname: string;
        channel: string;
    }) => void,
    [S2CSocketEvent.ChatMessageCreated]: (payload: {
        id: string;
        nickname: string;
        message: string;
        createdAt: string;
    }) => void;
};

export type InterServerPayloadType = {
    ["test"]: () => void;
};

export type SocketData = {
    id: string;
    nickname: string;
    channel: string;
};
