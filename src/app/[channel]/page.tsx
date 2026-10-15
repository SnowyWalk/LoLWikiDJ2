import { notFound } from "next/navigation";
import { DjApp } from "@/components/dj-app";
import { CHANNEL_IDS, DEFAULT_CHANNEL, isChannelId } from "@/shared/channels";

// 목록에 없는 채널 번호는 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return CHANNEL_IDS.filter((id) => id !== DEFAULT_CHANNEL).map((channel) => ({ channel }));
}

export default async function ChannelPage({ params }: PageProps<"/[channel]">) {
  const { channel } = await params;
  if (!isChannelId(channel)) notFound();
  return <DjApp channel={channel} />;
}
