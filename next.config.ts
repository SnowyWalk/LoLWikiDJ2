import type { NextConfig } from "next";
import { DEFAULT_CHANNEL } from "./src/shared/channels";

const nextConfig: NextConfig = {
  // 압축은 앞단 nginx(gzip)가 담당한다.
  compress: false,
  poweredByHeader: false,
  async redirects() {
    // 기본 채널은 번호 없이 "/" 로만 접근한다.
    return [{ source: `/${DEFAULT_CHANNEL}`, destination: "/", permanent: true }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
