// 롤백과사전 게시판 연동 (레거시 8080.js 의 lol_* 핸들러).
// 롤백과사전 계정 인증 정보는 브라우저가 들고 있다가 요청마다 data.auth 로 보낸다 (서버에 저장하지 않음).
// TODO(설계서 9-7): 로그인 자격증명 사용성 개선
import type { Socket } from "socket.io";
import {
  addBookmark,
  getArchivedBookmark,
  getUserMemos,
  isBookmarked,
  listBookmarks,
  removeBookmark,
  setUserMemo,
  type BookmarkPost,
} from "../db/lolwiki";
import { logger } from "../logger";
import { lolwiki } from "../services/lolwiki/client";

const GUEST = "LoLWikiDJ_Guest";

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function registerLolwikiHandlers(socket: Socket) {
  lolwiki.attachSocket(socket);
  const who = () => (socket.data.name as string) || "(비로그인)";
  const on = (event: string, fn: (data: Data) => unknown) =>
    socket.on(event, async (data: Data) => {
      try {
        await fn(data ?? {});
      } catch (error) {
        logger.warn({ err: error, event, nick: who() }, "롤백 연동 오류");
      }
    });
  const apiError = (error: { code?: string; statusCode?: number }, message: string) =>
    socket.emit("lol_api_error", { code: error.code || "", status_code: error.statusCode || 0, message });

  // 댓글 작성·삭제 뒤에는 댓글만 다시 받는다 (롤백은 글 수정이 없어서 본문은 그대로)
  async function repliesOnly(data: Data) {
    const replys = await lolwiki.getArticleReplies(data.android_id, data.post_seq, lolwiki.socketAuth(socket, data.auth));
    return { post_seq: String(data.post_seq), replys };
  }

  on("lol_get_article_list", async (data) => {
    const auth = lolwiki.socketAuth(socket, data.auth);
    const ret = await lolwiki.getArticleList(socket, data.android_id, data.seq, data.cnt, data.body, data.nick, data.vote, data.mine, auth);
    // 레거시는 같은 데이터를 디버그용 'data' 이벤트로 한 번 더 보냈다 → 제거 (트래픽 절반)
    socket.emit("lol_article_list", ret);
  });

  // 본문과 댓글을 동시에 요청하고 먼저 온 쪽부터 따로 보낸다. 브라우저는 그동안 스켈레톤을 보여 준다.
  // requested_seq: 글이 삭제돼 post_seq가 비어도 브라우저가 어느 요청의 응답인지 알 수 있게 한다
  on("lol_get_article_detail", async (data) => {
    const postSeq = String(data.post_seq ?? "");
    const auth = lolwiki.socketAuth(socket, data.auth); // 두 요청이 같은 인증 정보를 써야 토큰 갱신이 한 번으로 묶인다

    const post = (async () => {
      try {
        const [ret, bookmarked] = await Promise.all([
          lolwiki.getArticleDetail(data.android_id, postSeq, auth),
          data.android_id !== GUEST ? isBookmarked(data.android_id, postSeq) : false,
        ]);
        if (bookmarked) ret.isBookmarked = true;
        socket.emit("lol_article_detail", { ...ret, requested_seq: postSeq });
      } catch (error) {
        logger.warn({ err: error, nick: who(), postSeq }, "글 본문 조회 실패");
        socket.emit("lol_article_detail", { post_seq: "", requested_seq: postSeq });
      }
    })();

    const replies = (async () => {
      try {
        const replys = await lolwiki.getArticleReplies(data.android_id, postSeq, auth);
        socket.emit("lol_article_replies", { post_seq: postSeq, replys });
      } catch (error) {
        logger.warn({ err: error, nick: who(), postSeq }, "글 댓글 조회 실패");
        socket.emit("lol_article_replies", { post_seq: postSeq, replys: [], failed: true });
      }
    })();

    await Promise.all([post, replies]);
  });

  on("lol_user_info", async (data) => {
    const info = await lolwiki.getUserInfo(lolwiki.socketAuth(socket, data.auth));
    socket.emit("lol_user_info", info);
  });

  on("lol_change_nickname", async (data) => {
    const ok = await lolwiki.changeNickname(data.user_id, data.new_nick, lolwiki.socketAuth(socket, data.auth));
    logger.info({ nick: who(), newNick: data.new_nick }, "롤백 닉네임 변경");
    socket.emit("lol_change_nickname", ok);
  });

  on("lol_write_reply", async (data) => {
    try {
      await lolwiki.writeReply(data.post_seq, data.android_id, data.body, data.image, lolwiki.socketAuth(socket, data.auth));
    } catch (error) {
      logger.warn({ err: error }, "lol_write_reply 실패");
      return apiError(error as object, "댓글 작성에 실패했습니다. 롤백과사전 계정 정보 또는 API 연결 상태를 확인해주세요.");
    }
    socket.emit("lol_write_reply", await repliesOnly(data));
  });

  on("lol_like", async (data) => {
    socket.emit("lol_like", await lolwiki.votePost(data.post_seq, data.android_id, lolwiki.socketAuth(socket, data.auth)));
  });

  on("lol_delete_reply", async (data) => {
    await lolwiki.deleteReply(data.android_id, data.post_seq, data.reply_seq, lolwiki.socketAuth(socket, data.auth));
    socket.emit("lol_delete_reply", await repliesOnly(data));
  });

  on("lol_write", async (data) => {
    try {
      await lolwiki.writePost(data.android_id, data.subject, data.body, data.youtube_url, data.image, data.is_gif, lolwiki.socketAuth(socket, data.auth));
    } catch (error) {
      logger.warn({ err: error }, "lol_write 실패");
      return apiError(error as object, "글 작성에 실패했습니다. 롤백과사전 계정 정보 또는 API 연결 상태를 확인해주세요.");
    }
    socket.emit("lol_write");
  });

  on("lol_delete", async (data) => {
    await lolwiki.deletePost(data.android_id, data.post_seq, lolwiki.socketAuth(socket, data.auth));
    socket.emit("lol_delete");
  });

  socket.on("lol_get_article_list_others", async (postSeq: string) => {
    try {
      socket.emit("lol_get_article_list_others", await lolwiki.getArticleAuthorId(postSeq));
    } catch (error) {
      logger.warn({ err: error }, "lol_get_article_list_others 실패");
    }
  });

  on("lol_icon_change", async (data) => {
    await lolwiki.changeIcon(data.android_id, data.image, lolwiki.socketAuth(socket, data.auth));
    socket.emit("lol_user_info", await lolwiki.getUserInfo(lolwiki.socketAuth(socket, data.auth)));
  });

  // ---- 북마크(아카이브) / 유저 메모: 이 서비스 DB ----

  on("lol_bookmark", async (data) => {
    const owner = data.android_id as string;
    if (!owner || owner === GUEST) return;
    const post = data.data as BookmarkPost;
    if (data.isRegister) await addBookmark(owner, post);
    else await removeBookmark(owner, post.post_seq);
  });

  on("lol_query_bookmark_list", async (data) => {
    if (!data.android_id || data.android_id === GUEST) return;
    socket.emit("lol_bookmark_list", await listBookmarks(data.android_id, data.offset, data.count));
  });

  on("lol_query_bookmark_archived", async (data) => {
    if (!data.android_id || data.android_id === GUEST) return;
    socket.emit("lol_bookmark_archived", await getArchivedBookmark(data.android_id, data.post_seq));
  });

  socket.on("lol_get_user_memos", async (androidId: string) => {
    try {
      socket.emit("lol_get_user_memos", await getUserMemos(androidId));
    } catch (error) {
      logger.warn({ err: error }, "lol_get_user_memos 실패");
    }
  });

  on("lol_query_article_writer_android_id", async (data) => {
    socket.emit("lol_query_article_writer_android_id", await lolwiki.getArticleAuthorId(data.post_seq));
  });

  on("lol_update_user_memo", async (data) => {
    const writer = await lolwiki.getArticleAuthorId(data.post_seq);
    if (!writer) return;
    await setUserMemo(data.android_id, String(writer), String(data.memo ?? ""));
    socket.emit("lol_get_user_memos", await getUserMemos(data.android_id));
  });
}
