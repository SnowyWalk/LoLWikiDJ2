import { DjApp } from "@/components/dj-app";
import { DEFAULT_CHANNEL } from "@/shared/channels";

export default function Home() {
  return <DjApp channel={DEFAULT_CHANNEL} />;
}
