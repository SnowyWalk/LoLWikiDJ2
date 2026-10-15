import { renderLegacyPage } from "@/server/legacy-page";
import { isChannelId } from "@/shared/channels";

export const dynamic = "force-dynamic";

// "/1004" = 1004 채널 (0 ~ 100000)
export async function GET(_request: Request, { params }: RouteContext<"/[channel]">) {
  const { channel } = await params;
  if (!isChannelId(channel)) return new Response("Not Found", { status: 404 });
  return renderLegacyPage(channel);
}
