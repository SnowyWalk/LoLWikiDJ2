// 레거시 8080.js 의 socket.on(...) 핸들러를 옮긴 것 (롤백 게시판 lol_* 제외 — lolwiki.ts).
// 이벤트 이름·데이터 형식은 레거시 화면(public/static/index_*.js)이 쓰는 그대로 둔다.
//
// 보안상 옮기지 않은 레거시 이벤트:
//   debug(서버에서 임의 코드 실행), query / test_begin / test_commit(인증 없이 임의 SQL 실행)
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Server, Socket } from "socket.io";
import { env } from "../config";
import {
  appendVideos,
  createPlaylist,
  deletePlaylist,
  deleteVideoFromPlaylist,
  moveVideo,
  renamePlaylist,
  selectPlaylist,
  shufflePlaylist,
} from "../db/playlists";
import { bumpIconVersion, findBan, loginUser } from "../db/users";
import { findVideoById, resolveVideoIds } from "../db/videos";
import { writeIcon } from "../icons";
import { logger } from "../logger";
import type { RoomState } from "../rooms/RoomState";
import { fetchYoutubePlaylistVideoIds } from "../services/youtube";
import { fetchDanbooruZzal } from "../services/danbooru";
import { controllerFor } from "./room-controller";
import { fileSizeLabel, getDateForFilename, getTime, secondsToString } from "./util";

export const IMAGE_DIR = path.resolve(env.DATA_DIR, "images");

export function registerLegacyHandlers(io: Server, socket: Socket, room: RoomState, ip: string) {
  const ctl = controllerFor(io, room);
  const all = io.to(room.id);
  const name = () => socket.data.name as string;
  const me = () => room.users.get(name());
  /** 로그인한 소켓에서만 처리 (레거시: if(!socket.name) return) */
  // 레거시 클라이언트가 보내는 데이터는 타입이 정해져 있지 않아 핸들러마다 형태를 적는다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const on = (event: string, fn: (...args: any[]) => unknown) =>
    socket.on(event, async (...args: unknown[]) => {
      if (!name() || !me()) return;
      try {
        await fn(...args);
      } catch (error) {
        logger.error({ err: error, event, room: room.id, nick: name() }, "핸들러 오류");
      }
    });
  const isMaster = () => Boolean(env.MASTER_IP) && me()?.ip === env.MASTER_IP;
  const userMessage = (message: string) => ({
    type: "message",
    message,
    name: name(),
    time: getTime(),
    icon_id: me()?.iconId,
    icon_ver: me()?.iconVer,
  });

  socket.data.name = "";

  // ===================== 접속 / 로그인 =====================

  socket.on("check_user", (nick: string) => {
    const existing = room.users.get(nick);
    // 레거시: 같은 IP 에서 이미 접속 중일 때만 true (교체 로그인 확인용)
    socket.emit("check_user", Boolean(existing && existing.ip === ip));
  });

  socket.on("login", async (nick: unknown) => {
    if (typeof nick !== "string" || !nick) {
      socket.emit("login", false);
      return;
    }
    socket.data.name = nick;

    const existing = room.users.get(nick);
    if (existing) {
      if (existing.ip === ip) {
        ctl.log({ nick }, "중복 로그인 교체 연결");
        disconnectProcess(existing.socket);
        existing.socket.disconnect(true);
      } else {
        socket.data.name = "";
        socket.emit("login", false);
        return;
      }
    }

    try {
      const ban = await findBan(ip);
      if (ban) {
        ctl.log({ ip, reason: ban.reason, comment: ban.comment }, "밴 대상 접속 차단");
        socket.data.name = "";
        socket.emit("ban", ban.reason);
        return;
      }
      const r = await loginUser(nick, ip);
      ctl.log(
        { nick, ip, newUser: r.isNewUser, count: r.connectCount, suspicious: !r.isNewUser && r.isNewOnThisIp, comment: r.ipComment },
        "login",
      );
      room.users.set(nick, { socket, userId: r.user.id, iconId: r.user.icon_id!, iconVer: r.user.icon_ver, ip });
      socket.join(`user:${r.user.id}`);
      socket.emit("login", true);
      ctl.updateCurrentVideo(socket);
      ctl.updateCurrentQueue(socket);
      ctl.updateCurrentRating(socket);
      await ctl.updatePlaylist(socket);
      ctl.updateRecentVideoList(socket);
      if (room.config.notice) socket.emit("chat_update", { type: "connect", name: "SERVER", message: room.config.notice });
    } catch (error) {
      logger.error({ err: error, nick }, "로그인 실패");
      socket.data.name = "";
      socket.emit("login", false);
    }
  });

  on("chat_newUser", () => {
    ctl.log({ nick: name(), users: room.users.size }, "chat_newUser");
    all.emit("chat_update", { type: "connect", name: "SERVER", message: `'${name()}' 님이 접속하였습니다.` });
    ctl.updateUsers();
    ctl.updateDjs();
  });

  function disconnectProcess(target: Socket) {
    const nick = target.data.name as string;
    if (!nick || room.users.get(nick)?.socket !== target) return;
    room.users.delete(nick);
    if (room.djs.includes(nick)) {
      room.djs = room.djs.filter((x) => x !== nick);
      ctl.updateDjs();
    }
    if (room.currentDj === nick) void ctl.endOfVideo();
    target.broadcast.to(room.id).emit("chat_update", { type: "disconnect", message: `'${nick}' 님이 나가셨습니다.` });
    ctl.updateUsers();
  }
  socket.on("disconnect", () => disconnectProcess(socket));

  // ===================== 관리자 (MASTER_IP) =====================

  on("refresh", (nick: string) => {
    if (!isMaster()) return;
    room.users.get(nick)?.socket.emit("refresh");
  });
  on("eval", (data: { nick: string; code: string }) => {
    if (!isMaster()) return;
    room.users.get(data.nick)?.socket.emit("eval", data.code);
  });
  on("evalall", (code: string) => {
    if (!isMaster()) return;
    for (const u of room.users.values()) u.socket.emit("eval", code);
  });
  on("volcheck", (data: { target_nick: string; message: string }) => {
    all.emit("chat_update", userMessage(data.message));
    room.users
      .get(data.target_nick)
      ?.socket.emit(
        "eval",
        "socket.emit('chat_message', {type: 'message', message:format('음량: {0}% {1}', player.getVolume(), player.isMuted() ? '(음소거)' : ''), tts_hash:''})",
      );
  });

  // ===================== 채팅 =====================

  on("chat_message", (data: Record<string, unknown>) => {
    const u = me()!;
    all.emit("chat_update", { ...data, name: name(), time: getTime(), icon_id: u.iconId, icon_ver: u.iconVer });
  });

  on("ping", () => socket.emit("ping"));
  on("maxim", () => all.emit("chat_update", { type: "system_message", message: "맥심 막힘. ㅠㅠ" }));

  on("ad", (message: string) => {
    all.emit("ad", { message, hRate: Math.random() });
  });

  on("image_blob", async (blob: string) => {
    const match = /^data:image\/(.*?);base64,/.exec(blob.slice(0, 40));
    if (!match) return;
    const ext = match[1].replace(/[^a-z0-9]/gi, "").slice(0, 8) || "png";
    const data = blob.slice(match[0].length);
    const filename = `${getDateForFilename()}_${Math.round(Math.random() * 10_000_000)}.${ext}`;
    await mkdir(IMAGE_DIR, { recursive: true });
    await writeFile(path.join(IMAGE_DIR, filename), data, "base64");
    ctl.log({ nick: name(), file: filename, size: data.length }, "image_blob");
    all.emit("chat_update", { ...userMessage(`${fileSizeLabel(data.length)} /img static/images/${filename}`), is_blob: true });
  });

  on("icon_register", async (imageData: string) => {
    const u = me()!;
    let buffer: Buffer;
    if (imageData.startsWith("data:image/")) buffer = Buffer.from(imageData.replace(/^data:image\/png;base64,/, ""), "base64");
    else {
      const res = await fetch(imageData, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`아이콘 이미지 다운로드 실패 ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
    }
    await writeIcon(u.iconId, buffer);
    await bumpIconVersion(u.userId);
    u.iconVer += 1;
    socket.emit("chat_update", { type: "system_message", message: "아이콘이 변경되었습니다." });
    ctl.updateUsers();
  });

  on("zzal", async (tag: string) => {
    const result = await fetchDanbooruZzal(tag, room.recentZzals);
    all.emit("chat_update", { type: "system_message", message: result });
  });
  on("zzal_clear", () => {
    room.recentZzals = [];
  });

  on("tts", (data: { text: string; tts_hash: string; voice_name: string }) => {
    // TODO(P3): Google TTS 연동 (서비스 계정 키 필요). 지금은 기록만 남긴다.
    ctl.log({ nick: name(), voice: data.voice_name }, "tts 요청 (미구현)");
  });

  // ===================== 재생 / DJ =====================

  on("queue", (data: { dj: string; video_id: string; is_twitch?: boolean; is_naver_video?: boolean }) => ctl.queueVideo(data));

  on("queue_video_index", async (videoIndex: number) => {
    const video = await findVideoById(Number(videoIndex));
    if (!video) return;
    ctl.log({ nick: name(), video: video.youtube_id }, "즉시 재생");
    await ctl.queueVideo({ dj: name(), video_id: video.youtube_id });
  });

  on("queue_list", () => ctl.updateCurrentQueue(socket, true));
  on("playing", () => ctl.updateCurrentVideo(socket));

  on("rewind", (data: { sec: number; message: string }) => {
    all.emit("chat_update", userMessage(data.message));
    all.emit("chat_update", { type: "system_message", message: `영상을 ${data.sec}초 되감았습니다.`, name: name(), time: getTime() });
    ctl.seek(Number(data.sec));
  });
  on("forward", (data: { sec: number; message: string }) => {
    all.emit("chat_update", userMessage(data.message));
    all.emit("chat_update", { type: "system_message", message: `영상을 ${data.sec}초 넘겼습니다.`, name: name(), time: getTime() });
    ctl.seek(-Number(data.sec));
  });
  on("skip", (message: string) => {
    if (message) all.emit("chat_update", userMessage(message));
    all.emit("chat_update", { type: "system_message", message: "영상이 스킵 되었습니다.", time: getTime() });
    void ctl.endOfVideo();
  });

  on("users", () => ctl.updateUsers());
  on("djs", () => {
    socket.emit("djs", { data: `디제잉 목록 (${room.djs.length})\n${room.djs.map((x, i) => `${i + 1}. ${x}`).join("\n")}` });
  });

  on("rating", (isGood: boolean) => {
    if (!room.videoId) return;
    const nick = name();
    const inGood = room.goodList.includes(nick);
    const inBad = room.badList.includes(nick);
    room.goodList = room.goodList.filter((x) => x !== nick);
    room.badList = room.badList.filter((x) => x !== nick);
    if (isGood && !inGood) room.goodList.push(nick);
    if (!isGood && !inBad) room.badList.push(nick);
    if (isGood && !inGood) void ctl.addToLikePlaylist(nick, room.videoId);
    ctl.updateCurrentRating();
    if (room.badList.length >= 5) {
      all.emit("chat_update", { type: "system_message", time: getTime(), message: "싫어요 5개 이상 투표를 받아 스킵되었습니다." });
      void ctl.endOfVideo();
    }
  });

  on("dj_enter", () => {
    // 레거시: 맨 뒤(지금 재생 중인 DJ) 바로 앞에 끼워 넣는다
    if (!room.djs.includes(name())) room.djs.splice(-1, 0, name());
    socket.emit("dj_state", true);
    ctl.updateDjs();
    if (!room.videoId) void ctl.endOfVideo();
  });
  on("dj_quit", () => {
    room.djs = room.djs.filter((x) => x !== name());
    socket.emit("dj_state", false);
    ctl.updateDjs();
  });

  // ===================== 재생목록 =====================

  const userId = () => me()!.userId;

  on("playlist", () => ctl.updatePlaylist(socket));

  on("new_playlist", async () => {
    const id = await createPlaylist(userId(), "새 재생목록");
    await ctl.updatePlaylist(socket, id);
  });

  on("select_playlist", async (playlistId: number) => {
    await selectPlaylist(userId(), Number(playlistId));
    await ctl.updatePlaylist(socket);
  });

  on("rename_playlist", async (data: { name: string; playlist_id: number }) => {
    await renamePlaylist(userId(), Number(data.playlist_id), String(data.name));
    await ctl.updatePlaylist(socket);
  });

  on("delete_playlist", async (playlistId: number) => {
    await deletePlaylist(userId(), Number(playlistId));
    await ctl.updatePlaylist(socket);
  });

  on("delete_video", async (data: { playlist_id: number; video_id: number }) => {
    const remaining = await deleteVideoFromPlaylist(userId(), Number(data.playlist_id), Number(data.video_id));
    await ctl.updatePlaylist(socket);
    if (room.djs.includes(name()) && remaining === 0) {
      room.djs = room.djs.filter((x) => x !== name());
      socket.emit("dj_state", false);
      ctl.updateDjs();
    }
  });

  on("shuffle", async (playlistId: number) => {
    await shufflePlaylist(userId(), Number(playlistId));
    await ctl.updatePlaylist(socket);
  });

  on("change_video_order", async (data: { playlist_id: number; video_index: number; video_id: number; isDown: boolean; isForceMost: boolean }) => {
    try {
      await moveVideo(userId(), Number(data.playlist_id), Number(data.video_index), Number(data.video_id), Boolean(data.isDown), Boolean(data.isForceMost));
    } finally {
      await ctl.updatePlaylist(socket);
    }
  });

  async function pushVideos(youtubeIds: string[], playlistId: number) {
    try {
      const result = await resolveVideoIds(youtubeIds);
      const succeeded = result.filter((x) => x.Id);
      const blocked = result.filter((x) => !x.Id && x.Name);
      const failed = result.filter((x) => !x.Id && !x.Name);
      const { added, duplicated } = await appendVideos(userId(), playlistId, succeeded.map((x) => x.Id));
      const byId = new Map(succeeded.map((x) => [x.Id, x]));
      let message = "";
      if (duplicated.length) message += duplicated.map((id) => `[중복됨] ${byId.get(id)!.Name} (${secondsToString(byId.get(id)!.Length)})`).join("\n") + "\n";
      if (blocked.length) message += blocked.map((x) => `[외부 재생 제한] ${x.Name} (${secondsToString(x.Length)})`).join("\n") + "\n";
      if (failed.length) message += failed.map((x) => `[조회 실패] ${x.VideoId}`).join("\n") + "\n";
      if (added.length) message += added.map((id) => `[등록 성공] ${byId.get(id)!.Name} (${secondsToString(byId.get(id)!.Length)})`).join("\n");
      socket.emit("push_video_result", { isSuccess: true, message });
      await ctl.updatePlaylist(socket);
    } catch (error) {
      logger.error({ err: error }, "push_videos 실패");
      socket.emit("push_video_result", { isSuccess: false, message: "영상을 추가하는 중에 오류가 발생했습니다.\n" });
    }
  }

  on("push_video", (data: { video_id: string | string[]; playlist_id: number }) =>
    pushVideos(Array.isArray(data.video_id) ? data.video_id : [data.video_id], Number(data.playlist_id)),
  );

  on("push_playlist", async (data: { youtube_playlist_id: string; playlist_id: number }) => {
    try {
      const ids = await fetchYoutubePlaylistVideoIds(data.youtube_playlist_id);
      await pushVideos(ids, Number(data.playlist_id));
    } catch (error) {
      logger.error({ err: error }, "push_playlist 실패");
      socket.emit("push_video_result", { isSuccess: false, message: "영상을 추가하는 중에 오류가 발생했습니다.\n" });
    }
  });
}
