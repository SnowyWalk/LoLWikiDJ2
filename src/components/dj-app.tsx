import { ConnectionStatus } from "@/components/connection-status";
import type { ChannelId } from "@/shared/channels";

// 채널 하나의 DJ 화면. P4에서 레거시 dj.html 구조를 그대로 재현한 컴포넌트 트리로 교체된다.
export function DjApp({ channel }: { channel: ChannelId }) {
  return (
    <main>
      <ConnectionStatus channel={channel} />
    </main>
  );
}
