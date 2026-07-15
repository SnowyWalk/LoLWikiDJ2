import {socket} from "@/socket.ts";
import {C2SSocketEvent, S2CPayloadType, S2CSocketEvent} from "@/socket/events.ts";
import {useEffect, useState} from "react";

const useChatSendImage = () => {
    const [uploadingMutationIDs, setUploadingMutationIDs] = useState<string[]>([]);

    useEffect(() => {
        const handleChatImageCreated: S2CPayloadType[typeof S2CSocketEvent.ChatImageCreated] = (payload) => {
            console.log("ChatImageCreated", payload);
            setUploadingMutationIDs((ids) => ids.filter((id) => id !== payload.clientMutationID));
        }

        socket.on(S2CSocketEvent.ChatImageCreated, handleChatImageCreated);
        return () => {
            socket.off(S2CSocketEvent.ChatImageCreated, handleChatImageCreated);
        }
    }, [])

    const sendImage = async (file: File, clientMutationID: string) => {
        setUploadingMutationIDs([...uploadingMutationIDs, clientMutationID]);
        socket.emit(C2SSocketEvent.ChatImageCreate, {
            data: await file.arrayBuffer(),
            clientMutationID,
        })
    }

    const sendImages = async (dropImages: File[]) => {
        for (const dropImage of dropImages) {
            const clientMutationID = crypto.randomUUID();
            await sendImage(dropImage, clientMutationID);
        }
    }

    return {uploadingMutationIDs, sendImages};
};

export default useChatSendImage;