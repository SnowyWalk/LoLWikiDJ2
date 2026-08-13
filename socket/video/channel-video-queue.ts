import {VideoQueueItem} from "@/shared/video.types.ts";
import {AppServer} from "@/socket/types.ts";
import {S2CSocketEvent} from "@/socket/events.ts";

class ChannelVideoQueue {
    private readonly m_channel: string;
    private readonly m_io: AppServer;
    private m_current: VideoQueueItem | null = null;
    private m_queue: VideoQueueItem[] = [];

    constructor(io: AppServer, channel: string) {
        this.m_io = io;
        this.m_channel = channel;
    }

    public enqueue(videoQueueItem: VideoQueueItem) {
        // 이미 재생 중이면 큐에 넣고 끝
        if (this.m_current) {
            this.m_queue.push(videoQueueItem);
            this.notifyQueueListToChannel();
            return;
        }
        // 재생중이 아니라면 바로 재생

        this.m_io.to(this.m_channel).emit(S2CSocketEvent.VideoPlay, {
            playerType: videoQueueItem.videoType,
            src: videoQueueItem.videoInfo.src,
        })
    }

    private notifyQueueListToChannel() {
        this.m_io.to(this.m_channel).emit(S2CSocketEvent.VideoQueueList, {
            queue: this.m_queue
        })
    }

}