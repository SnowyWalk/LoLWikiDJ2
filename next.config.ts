import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NPM 기본 설정은 JS/CSS를 압축하지 않으므로 Node에서 gzip 한다.
  compress: true,
  poweredByHeader: false,
  async redirects() {
    // 기본 채널(src/shared/channels.ts 의 DEFAULT_CHANNEL)은 번호 없이 "/" 로만 접근한다.
    // 이 파일은 운영 이미지에서 src/ 없이 로드되므로 값을 직접 적는다.
    return [{ source: "/8080", destination: "/", permanent: true }];
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
