import { notFound } from "next/navigation";
import { DjApp } from "@/components/dj-app";
import { isChannelId } from "@/shared/channels";

// 채널 번호(0~100000)는 미리 만들지 않고, 처음 요청될 때 렌더링해 캐시한다.
export function generateStaticParams() {
  return [];
}

export default async function ChannelPage({ params }: PageProps<"/[channel]">) {
  const { channel } = await params;
  if (!isChannelId(channel)) notFound();
  return <DjApp channel={channel} />;
}
