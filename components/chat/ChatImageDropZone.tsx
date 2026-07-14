"use client";

import React, {ReactNode, RefObject, useEffect, useState} from "react";
import {socket} from "@/socket.ts";
import {C2SSocketEvent, S2CPayloadType, S2CSocketEvent} from "@/socket/events.ts";

type useDropzoneProps = {
    children: ReactNode;
    uploadingMutationIDRefs: RefObject<string[]>;
};

export default function ChatImageDropZone({children, uploadingMutationIDRefs}: useDropzoneProps) {
    const [isDropHover, setIsDropHover] = useState(false);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDropHover(true);
    }
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDropHover(false);
    }

    const sendImage = async (file: File, clientMutationID: string) => {
        socket.emit(C2SSocketEvent.ChatImageCreate, {
            data: await file.arrayBuffer(),
            clientMutationID,
        })
    }

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDropHover(false);

        const dropImages = Array.from(e.dataTransfer?.files).filter(item => item.type.startsWith("image/"));
        if (dropImages.length == 0) {
            e.dataTransfer.dropEffect = "none";
            return;
        }
        e.dataTransfer.dropEffect = "copy";

        for (const dropImage of dropImages) {
            const clientMutationID = crypto.randomUUID();
            uploadingMutationIDRefs.current.push(clientMutationID)
            await sendImage(dropImage, clientMutationID);
        }
    }

    useEffect(() => {

        const handleChatImageCreated: S2CPayloadType[typeof S2CSocketEvent.ChatImageCreated] = (payload) => {
            // TODO: uploadingMutationIDRefs.current 에서 payload.clientMutationID 를 찾아서 제거
        }

        socket.on(S2CSocketEvent.ChatImageCreated, handleChatImageCreated);
        return () => {
            socket.off(S2CSocketEvent.ChatImageCreated, handleChatImageCreated);
        }
    }, [])

    return (
        <div className="relative w-fit" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {children}

            {
                isDropHover &&
                <div
                    className="absolute inset-0 justify-center items-center text-center flex backdrop-blur-[2px] pointer-events-none">
                    <div
                        className="flex-1 mx-5 h-24 border-2 rounded-2xl bg-muted text-2xl flex items-center justify-center text-center">Drop
                        files here
                    </div>
                </div>
            }
        </div>

    );
}

 // ### 추천 구조
 //
 //  업로드 상태를 ChatPanel 내부의 useChatImageUpload 훅이 소유하게 하는 것이 가장 자연스럽습니다.
 //
 //  ChatPanel
 //   ├─ useChatImageUpload       업로드 상태와 소켓 응답 처리
 //   ├─ ChatImageDropZone        드롭된 파일만 전달
 //   ├─ ChatMessageList
 //   └─ UploadingIndicator
 //
 //  페이지에서는 이제 이것만 렌더링합니다.
 //
 //  <ChatPanel className="h-50 w-100" />
 //
 //  ChatImageDropZone은 외부 ref 대신 파일 콜백만 받습니다.
 //
 //  type ChatImageDropZoneProps = {
 //      children: React.ReactNode;
 //      onImagesDropped: (files: File[]) => void;
 //  };
 //
 //  ### 업로드 훅 예제
 //
 //  ID만 저장하기보다 나중에 파일명, 실패 상태 등을 확장할 수 있도록 Map이 적합합니다.
 //
 //  import {useCallback, useEffect, useReducer} from "react";
 //  import {socket} from "@/socket";
 //  import {
 //      C2SSocketEvent,
 //      S2CPayloadType,
 //      S2CSocketEvent,
 //  } from "@/socket/events";
 //
 //  type PendingUpload = {
 //      clientMutationID: string;
 //      fileName: string;
 //  };
 //
 //  type Action =
 //      | {type: "started"; upload: PendingUpload}
 //      | {type: "finished"; clientMutationID: string};
 //
 //  function reducer(
 //      state: Map<string, PendingUpload>,
 //      action: Action,
 //  ) {
 //      const next = new Map(state);
 //
 //      switch (action.type) {
 //          case "started":
 //              next.set(action.upload.clientMutationID, action.upload);
 //              break;
 //
 //          case "finished":
 //              next.delete(action.clientMutationID);
 //              break;
 //      }
 //
 //      return next;
 //  }
 //
 //  export default function useChatImageUpload() {
 //      const [pendingByID, dispatch] = useReducer(
 //          reducer,
 //          new Map<string, PendingUpload>(),
 //      );
 //
 //      useEffect(() => {
 //          const handleImageCreated:
 //              S2CPayloadType[typeof S2CSocketEvent.ChatImageCreated] =
 //              (payload) => {
 //                  dispatch({
 //                      type: "finished",
 //                      clientMutationID: payload.clientMutationID,
 //                  });
 //
 //                  if (!payload.isSuccess) {
 //                      // toast.error(payload.error);
 //                  }
 //              };
 //
 //          socket.on(
 //              S2CSocketEvent.ChatImageCreated,
 //              handleImageCreated,
 //          );
 //
 //          return () => {
 //              socket.off(
 //                  S2CSocketEvent.ChatImageCreated,
 //                  handleImageCreated,
 //              );
 //          };
 //      }, []);
 //
 //      const uploadImages = useCallback(async (files: File[]) => {
 //          for (const file of files) {
 //              const clientMutationID = crypto.randomUUID();
 //
 //              dispatch({
 //                  type: "started",
 //                  upload: {
 //                      clientMutationID,
 //                      fileName: file.name,
 //                  },
 //              });
 //
 //              try {
 //                  socket.emit(C2SSocketEvent.ChatImageCreate, {
 //                      clientMutationID,
 //                      data: await file.arrayBuffer(),
 //                  });
 //              } catch {
 //                  // 서버 전송 이전에 실패한 경우도 제거
 //                  dispatch({
 //                      type: "finished",
 //                      clientMutationID,
 //                  });
 //              }
 //          }
 //      }, []);
 //
 //      return {
 //          uploadImages,
 //          pendingUploads: Array.from(pendingByID.values()),
 //      };
 //  }
 //
 //  ChatPanel에서 조합하면 됩니다.
 //
 //  export default function ChatPanel({className}: ChatPanelProps) {
 //      const {uploadImages, pendingUploads} = useChatImageUpload();
 //
 //      return (
 //          <ChatImageDropZone onImagesDropped={uploadImages}>
 //
 //                  {pendingUploads.map((upload) => (
 //                      <div key={upload.clientMutationID}>
 //                          {upload.fileName} 업로드 중...
 //                      </div>
 //                  ))}
 //
 //                  <ChatInput />
 //              </div>
 //          </ChatImageDropZone>
 //      );
 //  }