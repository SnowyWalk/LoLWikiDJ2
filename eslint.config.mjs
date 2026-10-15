import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // 레거시에서 그대로 가져온 CommonJS 모듈과 그 테스트
    files: ["src/server/services/lolwiki/lolwiki-api.js", "tests/unit/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // custom server 번들 출력
    "dist/**",
    // P3 단계에서 그대로 쓰는 레거시 화면 스크립트 (React 전환 시 제거)
    "public/static/**",
    "legacy/**",
  ]),
]);

export default eslintConfig;
