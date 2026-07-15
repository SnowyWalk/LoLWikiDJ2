import {C2SSocketEvent, S2CSocketEvent} from "../events.ts";
import type {AppServer, AppServerSocket} from "../types.ts";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type {ChatMessageDTO} from "../../shared/chat-types.ts";
import {getTodayDate} from "../../lib/utils.ts";

const CHAT_IMAGE_DIR = path.join(process.cwd(), "public", "uploads", "chat-images");

export default function registerChatHandler(io: AppServer, socket: AppServerSocket) {

    const buildTextChatMessageDTO = (message: string): ChatMessageDTO => {
        return {
            chatUuid: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            nickname: socket.data.nickname,
            userId: socket.data.id,
            content: {
                type: "text",
                message: message,
            }
        }
    }

    const buildImageChatMessageDTO = ({imagePath, width, height, size}: {
        imagePath: string,
        width: number,
        height: number,
        size: number
    }): ChatMessageDTO => {
        return {
            chatUuid: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            nickname: socket.data.nickname,
            userId: socket.data.id,
            content: {
                type: "image",
                imagePath, width, height, size,
            }
        }
    }

    socket.on(C2SSocketEvent.ChatMessageCreate, (payload) => {
        io.to(socket.data.channel).emit(S2CSocketEvent.ChatMessageCreated, {info: buildTextChatMessageDTO(payload.message)})
    })

    socket.on(C2SSocketEvent.ChatImageCreate, async (payload) => {

        type DetectedImage = {
            extension: "png" | "jpg" | "gif" | "webp";
            mimeType: string;
        };

        function detectImageFormat(buffer: Buffer): DetectedImage | null {
            // PNG
            if (
                buffer.length >= 8 &&
                buffer.subarray(0, 8).equals(
                    Buffer.from([
                        0x89, 0x50, 0x4e, 0x47,
                        0x0d, 0x0a, 0x1a, 0x0a,
                    ]),
                )
            ) {
                return {
                    extension: "png",
                    mimeType: "image/png",
                };
            }

            // JPEG
            if (
                buffer.length >= 3 &&
                buffer[0] === 0xff &&
                buffer[1] === 0xd8 &&
                buffer[2] === 0xff
            ) {
                return {
                    extension: "jpg",
                    mimeType: "image/jpeg",
                };
            }

            // GIF
            const gifHeader = buffer.subarray(0, 6).toString("ascii");

            if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
                return {
                    extension: "gif",
                    mimeType: "image/gif",
                };
            }

            // WebP
            if (
                buffer.length >= 12 &&
                buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
                buffer.subarray(8, 12).toString("ascii") === "WEBP"
            ) {
                return {
                    extension: "webp",
                    mimeType: "image/webp",
                };
            }

            return null;
        }

        const saveImage = async (data: ArrayBuffer) => {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

            if (buffer.length === 0)
                throw new Error("Empty buffer");

            const ext = detectImageFormat(buffer);
            if (!ext)
                throw new Error("Unsupported image format");

            const subFolderName = getTodayDate();
            await mkdir(path.join(CHAT_IMAGE_DIR, subFolderName), {recursive: true});

            const filename = `${crypto.randomUUID()}.${ext.extension}`;
            const filePath = path.join(CHAT_IMAGE_DIR, subFolderName, filename);

            await writeFile(filePath, buffer, {flag: "wx"});

            const metadata = await sharp(filePath).metadata();
            const {width, height} = metadata;

            return {
                imagePath: `${subFolderName}/${filename}`,
                size: buffer.byteLength,
                width,
                height,
            }
        }


        // 파일 저장
        const {data, clientMutationID} = payload;
        try {
            const {imagePath, size, width, height} = await saveImage(data);

            socket.emit(S2CSocketEvent.ChatImageCreated, {
                isSuccess: true,
                clientMutationID: clientMutationID,
                info: buildImageChatMessageDTO({imagePath, size, width, height})
            })
        } catch (err) {
            console.error("ChatImageCreate error", err);
            socket.emit(S2CSocketEvent.ChatImageCreated, {
                isSuccess: false,
                error: (err instanceof Error) ? err.message : String(err),
                clientMutationID: clientMutationID,
            })
        }
    })

}