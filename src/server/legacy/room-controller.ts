// 레거시 8080.js 의 재생/DJ/좋아요 로직을 채널(방) 단위로 옮긴 것.
// 이벤트 이름과 데이터 형식은 레거시 화면이 그대로 쓰므로 바꾸지 않는다.
import type { Server, Socket } from "socket.io";
import { appendVideos, ensureLikePlaylist, legacyPlaylistSnapshot, rotateCurrentPlaylist } from "../db/playlists";
import { resolveVideoIds } from "../db/videos";
import { logger } from "../logger";
import type { QueueEntry, RoomState } from "../rooms/RoomState";
import { fetchYoutubeVideo } from "../services/youtube";
import { twitchStreamInfo, twitchVideoInfo } from "../services/twitch";
import { getTime, secondsToString } from "./util";

const RECENT_LIMIT = 20;

export class RoomController {
  constructor(
    readonly io: Server,
    readonly room: RoomState,
  ) {}

  private get all() {
    return this.io.to(this.room.id);
  }

  log(fields: Record<string, unknown>, msg: string) {
    logger.info({ room: this.room.id, ...fields }, msg);
  }

  // ---------- 브로드캐스트 (레거시 update_*) ----------

  updateUsers() {
    this.all.emit("users", [...this.room.users].map(([nick, u]) => ({ nick, icon_id: u.iconId, icon_ver: u.iconVer })));
  }

  updateDjs() {
    this.all.emit(
      "djs",
      this.room.djs.map((nick) => {
        const u = this.room.users.get(nick);
        return { nick, icon_id: u?.iconId, icon_ver: u?.iconVer };
      }),
    );
  }

  currentVideoPayload() {
    const r = this.room;
    return {
      dj: r.currentDj,
      video_id: r.videoId,
      author: r.videoAuthor,
      title: r.videoTitle,
      duration: r.videoDuration,
      thumbnail: r.videoThumbnail,
      is_twitch: r.videoIsTwitch,
      seek_s: r.videoDuration > 0 ? (Date.now() - r.playedTimeMs - 1000) / 1000 : 999999999,
    };
  }

  updateCurrentVideo(target?: Socket) {
    (target ?? this.all).emit("update_current_video", this.currentVideoPayload());
  }

  updateCurrentQueue(target?: Socket, isOnDemand = false) {
    const dest = target ?? this.all;
    if (this.room.queue.length === 0) {
      if (isOnDemand) dest.emit("chat_update", { type: "system_message", time: getTime(), message: "플레이 대기열 없음", bg: "var(--채팅_시스템)" });
      return;
    }
    const str =
      "플레이 대기열\n\n" +
      this.room.queue.map((x, i) => `${i + 1}. ${x.dj} - ${x.data.title} (${secondsToString(x.data.duration)})`).join("\n\n");
    dest.emit("chat_update", { type: "system_message", time: getTime(), message: str, bg: "var(--채팅_시스템)" });
  }

  updateCurrentRating(target?: Socket) {
    (target ?? this.all).emit("rating", { good: this.room.goodList, bad: this.room.badList });
  }

  updateRecentVideoList(target?: Socket) {
    (target ?? this.all).emit("recent_video_list", this.room.recentVideos);
  }

  async updatePlaylist(socket: Socket, showPlaylistId = 0) {
    const user = this.room.users.get(socket.data.name as string);
    if (!user) return;
    try {
      socket.emit("update_playlist", await legacyPlaylistSnapshot(user.userId, showPlaylistId));
    } catch (error) {
      logger.error({ err: error }, "update_playlist 실패");
    }
  }

  systemMessage(message: string) {
    this.all.emit("chat_update", { type: "system_message", time: getTime(), message });
  }

  // ---------- 재생 ----------

  private addToRecent(video_id: string, title: string, thumbnail: string, dj: string, duration: number) {
    const list = this.room.recentVideos;
    if (list.length >= RECENT_LIMIT) list.splice(RECENT_LIMIT);
    list.unshift({ video_id, title, thumbnail, dj, duration });
  }

  private setEndTimer() {
    const r = this.room;
    if (r.endTimer) clearTimeout(r.endTimer);
    const seek = Date.now() - r.playedTimeMs;
    r.endTimer = setTimeout(() => void this.endOfVideo(), (r.videoDuration + 2) * 1000 - seek);
  }

  private startVideo(dj: string, videoId: string, data: QueueEntry["data"], isTwitch: boolean) {
    const r = this.room;
    r.currentDj = dj;
    r.videoId = videoId;
    r.videoTitle = data.title;
    r.videoAuthor = data.author;
    r.videoThumbnail = data.thumbnail_url;
    r.videoDuration = data.duration;
    r.playedTimeMs = Date.now();
    r.videoIsTwitch = isTwitch;
    if (r.videoDuration !== 0) this.setEndTimer();
    this.updateCurrentVideo();
    this.addToRecent(r.videoId, r.videoTitle, r.videoThumbnail, r.currentDj, r.videoDuration);
    this.updateRecentVideoList();
  }

  /** 레거시 rewind/forward: 재생 시작 시각을 옮긴다 (+ 되감기, - 넘기기) */
  seek(deltaSec: number) {
    const r = this.room;
    r.playedTimeMs += 1000 * deltaSec;
    if (Date.now() < r.playedTimeMs) r.playedTimeMs = Date.now();
    this.setEndTimer();
    this.updateCurrentVideo();
  }

  async endOfVideo(): Promise<void> {
    const r = this.room;
    if (r.endTimer) clearTimeout(r.endTimer);
    r.endTimer = null;
    r.goodList = [];
    r.badList = [];

    if (r.queue.length > 0) {
      const next = r.queue.shift()!;
      if (!r.users.has(next.dj)) {
        r.currentDj = "";
        return this.endOfVideo();
      }
      this.startVideo(next.dj, next.video_id, next.data, next.is_twitch);
      this.updateCurrentQueue();
    } else if (r.djs.length > 0) {
      const dj = r.djs.shift()!;
      r.djs.push(dj);
      const user = r.users.get(dj);
      let video: Awaited<ReturnType<typeof rotateCurrentPlaylist>> = null;
      try {
        video = user ? await rotateCurrentPlaylist(user.userId) : null;
      } catch (error) {
        logger.error({ err: error }, "end_of_video DJ 재생목록 조회 실패");
      }
      if (!video) {
        // 재생목록이 비었으면 자동으로 대기열에서 퇴출
        r.djs = r.djs.filter((x) => x !== dj);
        this.log({ dj }, "end_of_video - auto dj_quit");
        user?.socket.emit("dj_state", false);
        this.updateDjs();
        return this.endOfVideo();
      }
      this.startVideo(dj, video.youtubeId, {
        title: video.title,
        author: video.author ?? "",
        thumbnail_url: video.thumbnail ?? "",
        duration: video.duration,
      }, false);
      this.log({ dj, title: video.title, duration: video.duration }, "dj_play");
      this.updateCurrentQueue();
      if (user) await this.updatePlaylist(user.socket);
    } else {
      r.currentDj = "";
      r.videoId = "";
      r.videoThumbnail = "";
      r.videoDuration = 0;
      r.videoTitle = "";
      r.videoAuthor = "";
      r.videoIsTwitch = false;
      this.all.emit("update_current_video", null);
    }

    for (const [nick, u] of r.users) u.socket.emit("dj_state", r.djs.includes(nick));
    this.updateDjs();
    this.updateCurrentRating();
  }

  /** 레거시 queue_video: 지금 재생 중인 게 없으면 바로 재생, 있으면 대기열에 */
  async queueVideo(data: { dj: string; video_id: string; is_twitch?: boolean; is_naver_video?: boolean }) {
    const isTwitch = Boolean(data.is_twitch);
    try {
      let info: QueueEntry["data"];
      if (data.video_id.includes(".m3u8")) {
        info = { title: "* 스포티비 LIVE *", author: "", thumbnail_url: "/static/%ec%86%90%ed%9d%a5%eb%af%bc.gif", duration: 0 };
      } else if (data.video_id.includes(".flv")) {
        const n = String(Math.floor(Math.random() * 37) + 1).padStart(2, "0");
        info = { title: "* 개인방송 LIVE *", author: "", thumbnail_url: `/emoticon/lessy_${n}.jpg`, duration: 0 };
      } else if (isTwitch) {
        info = data.video_id.startsWith("videos/")
          ? await twitchVideoInfo(data.video_id.replace("videos/", ""))
          : await twitchStreamInfo(data.video_id);
      } else if (data.is_naver_video) {
        return;
      } else {
        const yt = await fetchYoutubeVideo(data.video_id);
        if (!yt) throw new Error("유튜브 영상 없음");
        info = { title: yt.title, author: yt.author, thumbnail_url: yt.thumbnail_url, duration: yt.duration };
      }

      this.log({ dj: data.dj, title: info.title, video: data.video_id }, "queue");
      if (!this.room.videoId) this.startVideo(data.dj, data.video_id, info, isTwitch);
      else {
        this.room.queue.push({ dj: data.dj, video_id: data.video_id, data: info, is_twitch: isTwitch });
        this.updateCurrentQueue();
      }
    } catch (error) {
      logger.warn({ err: error, data }, "queue 실패");
      this.systemMessage(isTwitch ? "트위치 영상 조회 에러!" : "유튜브 영상 조회 에러!");
    }
  }

  /** 레거시 add_to_likeplaylist */
  async addToLikePlaylist(nick: string, youtubeId: string) {
    const user = this.room.users.get(nick);
    if (!user) return;
    try {
      const like = await ensureLikePlaylist(user.userId);
      if (like.created) this.log({ nick, playlist: like.id }, "좋아요 재생목록 생성");
      const resolved = (await resolveVideoIds([youtubeId])).filter((x) => x.Id);
      if (resolved.length === 0) return;
      const { added } = await appendVideos(user.userId, like.id, resolved.map((x) => x.Id));
      if (added.length > 0) await this.updatePlaylist(user.socket);
    } catch (error) {
      logger.error({ err: error }, "add_to_likeplaylist 실패");
    }
  }
}

const controllers = new WeakMap<RoomState, RoomController>();

export function controllerFor(io: Server, room: RoomState): RoomController {
  let c = controllers.get(room);
  if (!c) {
    c = new RoomController(io, room);
    controllers.set(room, c);
  }
  return c;
}
