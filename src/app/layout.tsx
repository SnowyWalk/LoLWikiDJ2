import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoLWiki.DJ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 레거시 dj.html 과 동일하게 theme 속성으로 테마를 전환한다.
    <html lang="ko" theme="default" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
