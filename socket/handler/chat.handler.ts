import {C2SSocketEvent, S2CSocketEvent} from "../events.ts";
import type {AppServer, AppServerSocket} from "../types.ts";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const CHAT_IMAGE_DIR = "@/uploads/chat-images/";

export default function registerChatHandler(io: AppServer, socket: AppServerSocket) {

    socket.on(C2SSocketEvent.ChatMessageCreate, (payload) => {
        io.to(socket.data.channel).emit(S2CSocketEvent.ChatMessageCreated, {
            id: socket.data.id,
            nickname: socket.data.nickname,
            message: payload.message,
            createdAt: new Date().toISOString(),
            uuid: crypto.randomUUID(),
        })
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

            await mkdir(CHAT_IMAGE_DIR, {recursive: true});

            const filename = `${crypto.randomUUID()}.${ext}`;
            const filePath = path.join(CHAT_IMAGE_DIR, filename);

            await writeFile(filePath, buffer, {flag: "wx"});

            const metadata = await sharp(filePath).metadata();
            const {width, height} = metadata;

            return {
                filename,
                size: buffer.byteLength,
                width,
                height,
            }
        }
        
        console.log("ChatImageCreate", payload);

        // 파일 저장
        const {data, clientMutationID} = payload;
        try {
            const {filename, size, width, height} = await saveImage(data);

            socket.emit(S2CSocketEvent.ChatImageCreated, {
                isSuccess: true,
                clientMutationID: clientMutationID,
                uuid: crypto.randomUUID(), // 채팅메시지에 대한 uuid임
                id: socket.data.id,
                nickname: socket.data.nickname,
                createdAt: new Date().toISOString(),
                size: size,
                width: width,
                height: height,
                imageUrl: filename,
            })
        } catch (err) {
            socket.emit(S2CSocketEvent.ChatImageCreated, {
                isSuccess: false,
                error: (err instanceof Error) ? err.message : String(err),
                clientMutationID: clientMutationID,
            })
        }
    })

}