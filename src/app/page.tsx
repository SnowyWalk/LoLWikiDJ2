import { DjApp } from "@/components/dj-app";
import { DEFAULT_CHANNEL_ID } from "@/shared/channels";

export default function Home() {
  return <DjApp channel={DEFAULT_CHANNEL_ID} />;
}
