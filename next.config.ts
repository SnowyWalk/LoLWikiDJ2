import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NPM 기본 설정은 JS/CSS를 압축하지 않으므로 Node에서 gzip 한다.
  compress: true,
  poweredByHeader: false,
  async headers() {
    return [
      // 폰트는 내용이 바뀌지 않으므로 1년
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // 레거시 화면 자산: 새로고침마다 서버에 다시 묻지 않도록 1일 + 이후 7일은 쓰면서 뒤에서 갱신.
      // 스크립트·CSS 는 dj.html 에서 ?ver=<배포 버전> 이 붙어 배포 때마다 새 주소가 된다.
      {
        source: "/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      { source: "/patch_note/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ];
  },
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
