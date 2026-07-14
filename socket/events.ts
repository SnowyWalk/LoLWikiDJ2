export const C2SSocketEvent = {
    Login: "login:login",
    ChatMessageCreate: "chat:message:create",
    ChatImageCreate: "chat:image:create",
} as const;

export const S2CSocketEvent = {
    LoginResult: "login:result",
    ChatMessageCreated: "chat:message:created",
    ChatImageCreated: "chat:image:created",
} as const;

export type C2SPayloadType = {
    [C2SSocketEvent.Login]: (payload: {
        nickname: string;
        channel: string;
    }) => void,
    [C2SSocketEvent.ChatMessageCreate]: (payload: {
        message: string;
    }) => void,
    [C2SSocketEvent.ChatImageCreate]: (payload: {
        data: ArrayBuffer;
        clientMutationID: string;
    }) => void,
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
        uuid: string;
    }) => void,
    [S2CSocketEvent.ChatImageCreated]: (payload:
                                            | {
                                            isSuccess: true;
                                            id: string;
                                            nickname: string;
                                            createdAt: string;
                                            clientMutationID: string;
                                            imageUrl: string;
                                            size: number;
                                            width: number;
                                            height: number;
                                            uuid: string;
                                        }
                                            | {
                                            isSuccess: false;
                                            clientMutationID: string;
                                            error: string;
                                        }) => void,
};

export type InterServerPayloadType = {
    ["test"]: () => void;
};

export type SocketData = {
    id: string;
    nickname: string;
    channel: string;
};
