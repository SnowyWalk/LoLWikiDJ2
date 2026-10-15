import "react";

declare module "react" {
  // 레거시 CSS가 <html theme="..."> 선택자로 테마를 구분한다.
  interface HtmlHTMLAttributes<T> extends HTMLAttributes<T> {
    theme?: string;
  }
}
