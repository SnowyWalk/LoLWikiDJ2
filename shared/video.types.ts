export type VideoPlayerType = "youtube";

export interface VideoInfo {
    src: string, 
    title: string, 
    duration: number,
}

export interface YoutubeVideoInfo extends VideoInfo {
    author: string,
    thumbnail: string,
}

export interface VideoQueueItem {
    uuid: string, 
    dj: string,
    videoType: VideoPlayerType,
    videoInfo: VideoInfo,
}