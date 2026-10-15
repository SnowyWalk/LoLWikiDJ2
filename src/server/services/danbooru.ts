// 짤 검색 (레거시 load_danbooru_zzal). 결과는 채팅 시스템 메시지 문자열.
import { env } from "../config";
import { logger } from "../logger";

const zzalReg = /<picture>.*?srcset="(https?:\/\/(?:cdn|danbooru)\.donmai\.us\/(?:data\/)?(?:sample|original).*?)"/i;
const zzalGifReg = /<video.*?id="image".*?src="(.*?)"/i;
const zzalUrlReg = /<link rel="canonical" href="(.*?)">/;
const filterReg = />(muscular male|mountain \(arknights\))</i;

export async function fetchDanbooruZzal(rawTag: string, recent: { date: number; url: string }[]): Promise<string> {
  const tag = String(rawTag).replace(/ /g, "_");
  const auth = env.DANBOORU_LOGIN ? `Basic ${Buffer.from(`${env.DANBOORU_LOGIN}:${env.DANBOORU_API_KEY}`).toString("base64")}` : undefined;

  for (let retry = 0; retry <= 5; retry++) {
    try {
      const res = await fetch(`https://danbooru.donmai.us/posts/random?tags=${encodeURIComponent(tag)}`, {
        headers: auth ? { Authorization: auth } : {},
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return `${tag} 짤 검색결과 없음!`;
      if (!res.ok) throw new Error(`danbooru ${res.status}`);
      const html = (await res.text()).replace(/[\r\n]/g, " ");
      const url = zzalUrlReg.exec(html)?.[1];
      if (!url) throw new Error("canonical 없음");

      // 3분 안에 나온 짤은 다시 뽑는다
      const now = Date.now();
      while (recent.length && now - recent[0].date >= 3 * 60 * 1000) recent.shift();
      if (recent.some((z) => z.url === url)) throw new Error("중복 짤");
      recent.push({ date: now, url });

      if (filterReg.test(html)) throw new Error("금지어");
      const img = zzalReg.exec(html)?.[1];
      if (img) return `/img ${img} ${url}?tags=${tag}`;
      const video = zzalGifReg.exec(html)?.[1];
      if (video) return `/video ${video} ${url}?tags=${tag}`;
      throw new Error("이미지 없음");
    } catch (error) {
      logger.warn({ err: error, tag, retry }, "zzal 재시도");
    }
  }
  return `${tag} 짤 불러오기 실패`;
}
