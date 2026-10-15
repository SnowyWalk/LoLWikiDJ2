import { createServer } from "node:http";
import next from "next";
import { env, isDev } from "./config";
import { logger } from "./logger";
import { attachRealtime } from "./realtime";
import { roomStats } from "./rooms/RoomState";

async function main() {
  const app = next({ dev: isDev, hostname: env.HOST, port: env.PORT });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    // 컨테이너 헬스체크는 Next를 거치지 않고 바로 응답한다.
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, rooms: roomStats() }));
      return;
    }
    void handle(req, res);
  });

  attachRealtime(server);

  server.listen(env.PORT, env.HOST, () => {
    logger.info(`> ready on http://${env.HOST}:${env.PORT} (${isDev ? "development" : "production"})`);
  });

  const shutdown = () => {
    logger.info("shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.fatal(error);
  process.exit(1);
});
