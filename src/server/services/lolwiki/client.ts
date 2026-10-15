// 레거시 lolwiki-api.js (롤백과사전 앱 API 호환 레이어)를 fetch 기반 request 로 묶은 단일 클라이언트.
// 블록 목록·게시글 캐시를 모든 채널이 함께 쓴다.
import type { Socket } from "socket.io";
import { createLolWikiClient } from "./lolwiki-api";
import { legacyRequest } from "./request-adapter";

/* eslint-disable @typescript-eslint/no-explicit-any -- JS 모듈이 돌려주는 롤백 API 응답은 형태가 느슨하다 */
type Auth = ReturnType<ReturnType<typeof createLolWikiClient>["socketAuth"]>;
type Post = Record<string, any>;

export interface LolwikiClient {
  attachSocket(socket: Socket): void;
  socketAuth(socket: Socket, source?: unknown): Auth;
  getArticleList(socket: Socket, targetUserKey: string, offset?: number, limit?: number, searchBody?: string, searchNickname?: string, popular?: boolean, mine?: boolean, auth?: Auth): Promise<Post[]>;
  getArticleDetail(userKey: string, postSeq: string, auth?: Auth): Promise<Post>;
  getArticleReplies(userKey: string, postSeq: string, auth?: Auth): Promise<Post[]>;
  getArticleAuthorId(postSeq: string): Promise<string>;
  getUserInfo(auth: Auth): Promise<Post>;
  changeNickname(userKey: string, nickname: string, auth: Auth): Promise<boolean>;
  writeReply(postSeq: string, userKey: string, body: string, image: unknown, auth: Auth): Promise<unknown>;
  votePost(postSeq: string, userKey: string, auth: Auth): Promise<boolean>;
  deleteReply(userKey: string, postSeq: string, replySeq: string, auth: Auth): Promise<unknown>;
  writePost(userKey: string, subject: string, body: string, youtubeUrl: string, image: unknown, isGif: boolean, auth: Auth): Promise<unknown>;
  changeIcon(userKey: string, image: unknown, auth: Auth): Promise<unknown>;
  deletePost(userKey: string, postSeq: string, auth: Auth): Promise<unknown>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const lolwiki = createLolWikiClient(legacyRequest) as unknown as LolwikiClient;
