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
import { responseMessage } from "../services/lolwiki/lolwiki-api";

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
  // 롤백 서버가 사유를 알려 줬으면(예: CANNOT_BLOCK_OPERATOR) 안내문 뒤에 붙인다
  const apiError = (error: { code?: string; statusCode?: number; error?: unknown }, message: string) => {
    const reason = responseMessage(error.error);
    socket.emit("lol_api_error", { code: error.code || "", status_code: error.statusCode || 0, message: reason ? `${message}\n사유: ${reason}` : message });
  };
  // 브라우저가 보낸 첨부 형식. GIF·WebP 는 원본 그대로 올린다 (예전 is_gif 불리언도 받는다)
  const imageFormat = (data: Data) => (data.image_format as string) || (data.is_gif ? "gif" : "jpg");

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

  // 응답 { ok, nickname, message, status_code }: 24시간 재변경 제한 같은 거부 사유를 브라우저가 그대로 보여 준다
  on("lol_change_nickname", async (data) => {
    let result;
    try {
      result = await lolwiki.changeNickname(data.user_id, data.new_nick, lolwiki.socketAuth(socket, data.auth));
    } catch (error) {
      logger.warn({ err: error }, "lol_change_nickname 실패");
      return apiError(error as object, "닉네임 변경 요청에 실패했습니다. 롤백과사전 로그인 상태를 확인해주세요.");
    }
    logger.info({ nick: who(), newNick: data.new_nick, ok: result.ok, reason: result.message }, "롤백 닉네임 변경");
    socket.emit("lol_change_nickname", result);
  });

  // parent_id 가 있으면 답글 (부모 댓글 아래에 달린다)
  on("lol_write_reply", async (data) => {
    try {
      await lolwiki.writeReply(data.post_seq, data.android_id, data.body, data.image, lolwiki.socketAuth(socket, data.auth), {
        imageFormat: imageFormat(data),
        parentId: data.parent_id,
      });
    } catch (error) {
      logger.warn({ err: error }, "lol_write_reply 실패");
      return apiError(error as object, "댓글 작성에 실패했습니다. 롤백과사전 계정 정보 또는 API 연결 상태를 확인해주세요.");
    }
    socket.emit("lol_write_reply", await repliesOnly(data));
  });

  // action: 'up'(추천) | 'down'(비추천). 응답 { ok, vote, likes, post_seq } 는 투표 뒤 다시 읽은 실제 값
  on("lol_like", async (data) => {
    try {
      const action = data.action === "down" ? "down" : "up";
      socket.emit("lol_like", await lolwiki.votePost(data.post_seq, data.android_id, lolwiki.socketAuth(socket, data.auth), action));
    } catch (error) {
      logger.warn({ err: error }, "lol_like 실패");
      apiError(error as object, "추천 처리에 실패했습니다. 롤백과사전 로그인 상태를 확인해주세요.");
    }
  });

  on("lol_delete_reply", async (data) => {
    await lolwiki.deleteReply(data.android_id, data.post_seq, data.reply_seq, lolwiki.socketAuth(socket, data.auth));
    socket.emit("lol_delete_reply", await repliesOnly(data));
  });

  // images: [{ image, image_format }] 최대 10장. 예전 브라우저의 image(1장)+is_gif 도 받는다.
  // 응답 { attached, total, image_error }: 사진 일부가 붙지 않았으면 브라우저가 사유를 알린다
  on("lol_write", async (data) => {
    let result;
    try {
      const images = Array.isArray(data.images) ? data.images : data.image ? [{ image: data.image, image_format: imageFormat(data) }] : [];
      result = await lolwiki.writePost(data.android_id, data.subject, data.body, data.youtube_url, images, lolwiki.socketAuth(socket, data.auth));
    } catch (error) {
      logger.warn({ err: error }, "lol_write 실패");
      return apiError(error as object, "글 작성에 실패했습니다. 롤백과사전 계정 정보 또는 API 연결 상태를 확인해주세요.");
    }
    socket.emit("lol_write", result);
  });

  // ---- 차단 (롤백 앱 '내 정보 → 차단 관리'와 같은 목록) ----

  on("lol_block_user", async (data) => {
    try {
      const result = await lolwiki.blockUser(String(data.post_seq ?? ""), lolwiki.socketAuth(socket, data.auth));
      logger.info({ nick: who(), postSeq: data.post_seq, blocked: result.nickname }, "롤백 유저 차단");
      socket.emit("lol_block_user", result);
    } catch (error) {
      logger.warn({ err: error }, "lol_block_user 실패");
      apiError(error as object, "차단에 실패했습니다. 롤백과사전 로그인 상태를 확인해주세요.");
    }
  });

  on("lol_block_list", async (data) => {
    try {
      socket.emit("lol_block_list", { ok: true, ...(await lolwiki.listBlocks(lolwiki.socketAuth(socket, data.auth))) });
    } catch (error) {
      logger.warn({ err: error }, "lol_block_list 실패");
      socket.emit("lol_block_list", { ok: false, results: [], block_limit: 0 });
      apiError(error as object, "차단목록을 불러오지 못했습니다. 롤백과사전 로그인 상태를 확인해주세요.");
    }
  });

  // { blocked_user_id } 하나 또는 { all: true } 전체 해제. 해제 뒤의 목록을 lol_block_list 로 보낸다
  on("lol_unblock", async (data) => {
    try {
      const target = data.all ? ("all" as const) : Number(data.blocked_user_id);
      const list = await lolwiki.unblock(lolwiki.socketAuth(socket, data.auth), target);
      logger.info({ nick: who(), target }, "롤백 차단 해제");
      socket.emit("lol_block_list", { ok: true, ...list, unblocked: target });
    } catch (error) {
      logger.warn({ err: error }, "lol_unblock 실패");
      apiError(error as object, "차단 해제에 실패했습니다. 롤백과사전 로그인 상태를 확인해주세요.");
    }
  });

  // ---- 알림센터: 알림(푸시) + 쪽지 (롤백 앱과 같은 목록). 배지는 조용히 실패한다 ----

  const emitBadge = async (auth: ReturnType<typeof lolwiki.socketAuth>) => {
    try {
      socket.emit("lol_notif_badge", { ok: true, ...(await lolwiki.unreadCounts(auth)) });
    } catch (error) {
      logger.warn({ err: error }, "lol_notif_badge 실패");
      socket.emit("lol_notif_badge", { ok: false });
    }
  };

  on("lol_notif_badge", async (data) => emitBadge(lolwiki.socketAuth(socket, data.auth)));

  on("lol_notif_list", async (data) => {
    try {
      socket.emit("lol_notif_list", { ok: true, ...(await lolwiki.listNotifications(lolwiki.socketAuth(socket, data.auth))) });
    } catch (error) {
      logger.warn({ err: error }, "lol_notif_list 실패");
      socket.emit("lol_notif_list", { ok: false, results: [], unread_count: 0 });
    }
  });

  // { notification_id } 하나 읽음 (없으면 전부). 끝나면 배지를 다시 센다
  on("lol_notif_read", async (data) => {
    const auth = lolwiki.socketAuth(socket, data.auth);
    try {
      await lolwiki.readNotification(auth, data.notification_id);
    } catch (error) {
      logger.warn({ err: error }, "lol_notif_read 실패");
    }
    await emitBadge(auth);
  });

  on("lol_memo_threads", async (data) => {
    try {
      socket.emit("lol_memo_threads", { ok: true, ...(await lolwiki.listMemoThreads(lolwiki.socketAuth(socket, data.auth))) });
    } catch (error) {
      logger.warn({ err: error }, "lol_memo_threads 실패");
      socket.emit("lol_memo_threads", { ok: false, results: [], unread_count: 0 });
    }
  });

  // 대화를 열면 서버가 읽음으로 처리하므로 배지도 다시 센다
  on("lol_memo_thread", async (data) => {
    const auth = lolwiki.socketAuth(socket, data.auth);
    try {
      socket.emit("lol_memo_thread", { ok: true, ...(await lolwiki.getMemoThread(auth, String(data.thread_id ?? ""))) });
    } catch (error) {
      logger.warn({ err: error }, "lol_memo_thread 실패");
      socket.emit("lol_memo_thread", { ok: false, thread_id: String(data.thread_id ?? ""), messages: [] });
      return;
    }
    await emitBadge(auth);
  });

  on("lol_memo_send", async (data) => {
    try {
      socket.emit("lol_memo_thread", { ok: true, sent: true, ...(await lolwiki.sendMemo(lolwiki.socketAuth(socket, data.auth), String(data.thread_id ?? ""), String(data.body ?? ""))) });
    } catch (error) {
      logger.warn({ err: error }, "lol_memo_send 실패");
      apiError(error as object, "쪽지 전송에 실패했습니다.");
    }
  });

  // ---- 고정짤: { image } 등록 또는 { clear: true } 해제. 끝나면 프로필을 다시 보낸다 ----
  on("lol_fixed_image", async (data) => {
    const auth = lolwiki.socketAuth(socket, data.auth);
    try {
      if (data.clear) await lolwiki.clearFixedImage(auth);
      else await lolwiki.setFixedImage(data.image, auth);
    } catch (error) {
      logger.warn({ err: error }, "lol_fixed_image 실패");
      return apiError(error as object, data.clear ? "고정짤 삭제에 실패했습니다." : "고정짤 등록에 실패했습니다. 이미지와 롤백과사전 로그인 상태를 확인해주세요.");
    }
    socket.emit("lol_fixed_image", { ok: true, cleared: Boolean(data.clear) });
    socket.emit("lol_user_info", await lolwiki.getUserInfo(auth));
  });

  on("lol_delete", async (data) => {
    try {
      await lolwiki.deletePost(data.android_id, data.post_seq, lolwiki.socketAuth(socket, data.auth));
    } catch (error) {
      logger.warn({ err: error }, "lol_delete 실패");
      return apiError(error as object, "글 삭제에 실패했습니다. 롤백과사전 로그인 상태를 확인해주세요.");
    }
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
