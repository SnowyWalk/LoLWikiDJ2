import { renderLegacyPage } from "@/server/legacy-page";
import { DEFAULT_CHANNEL } from "@/shared/channels";

export const dynamic = "force-dynamic";

// "/" = 기본 채널
export function GET() {
  return renderLegacyPage(DEFAULT_CHANNEL);
}
