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
  changeNickname(userKey: string, nickname: string, auth: Auth): Promise<{ ok: boolean; nickname?: string; message: string; status_code?: number }>;
  writeReply(postSeq: string, userKey: string, body: string, image: unknown, auth: Auth, options?: { imageFormat?: string; parentId?: number | string }): Promise<unknown>;
  votePost(postSeq: string, userKey: string, auth: Auth, action?: "up" | "down"): Promise<{ ok: boolean; vote: string; likes: number | null; post_seq: string }>;
  deleteReply(userKey: string, postSeq: string, replySeq: string, auth: Auth): Promise<unknown>;
  /** images: 최대 10장 [{ image, image_format }] (배열 순서 = 글에 보이는 순서) */
  writePost(userKey: string, subject: string, body: string, youtubeUrl: string, images: PostImage[] | string, auth: Auth): Promise<{ attached: number; total: number; image_error: string }>;
  changeIcon(userKey: string, image: unknown, auth: Auth): Promise<unknown>;
  deletePost(userKey: string, postSeq: string, auth: Auth): Promise<unknown>;
  blockUser(postSeq: string, auth: Auth): Promise<{ ok: boolean; nickname: string; blocked_user_id: number }>;
  listBlocks(auth: Auth): Promise<BlockList>;
  unblock(auth: Auth, blockedUserId: number | "all"): Promise<BlockList>;
  setFixedImage(image: unknown, auth: Auth): Promise<void>;
  clearFixedImage(auth: Auth): Promise<void>;
  listNotifications(auth: Auth): Promise<{ results: Notification[]; unread_count: number }>;
  readNotification(auth: Auth, notificationId?: unknown): Promise<void>;
  listMemoThreads(auth: Auth): Promise<{ results: MemoThread[]; unread_count: number }>;
  getMemoThread(auth: Auth, threadId: string): Promise<{ thread_id: string; messages: MemoMessage[] }>;
  sendMemo(auth: Auth, threadId: string, body: string): Promise<{ thread_id: string; messages: MemoMessage[] }>;
  unreadCounts(auth: Auth): Promise<UnreadCounts>;
}

export interface Notification {
  id: unknown;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  post_seq: string;
}

export interface MemoThread {
  id: unknown;
  other_nickname: string;
  other_avatar_url: string;
  last_body: string;
  last_message_at: string;
  unread_count: number;
}

export interface MemoMessage {
  id: unknown;
  body: string;
  image_url: string;
  created_at: string;
  mine: boolean;
}

export interface UnreadCounts {
  notifications: number;
  memos: number;
  total: number;
}

export interface PostImage {
  image: unknown;
  image_format?: string;
}

export interface BlockList {
  results: { id: number; nickname: string; avatar_url: string; created_at: string }[];
  block_limit: number;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const lolwiki = createLolWikiClient(legacyRequest) as unknown as LolwikiClient;
