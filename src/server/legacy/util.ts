// 레거시 서버(8080.js)의 출력 형식을 그대로 맞추기 위한 작은 함수들.

/** 레거시 format('{0} {1}', a, b) */
export function format(template: string, ...args: unknown[]): string {
  return template.replace(/\{(\d+)\}/g, (_m, index) => String(args[Number(index)]));
}

function kst(date = new Date()) {
  // 레거시는 new Date().addHours(9) 로 KST 를 만들었다 (서버 시간대 UTC 가정).
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}
const pad = (n: number) => String(n).padStart(2, "0");

/** 채팅 시간 표시 'HH:MI' (KST) */
export function getTime(): string {
  const d = kst();
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 'YYYY-MM-DD HH:MI:SS' (KST) */
export function getDate(): string {
  const d = kst();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** 업로드 파일명용 'YYYYMMDDHHMISS' (KST) */
export function getDateForFilename(): string {
  return getDate().replace(/\D/g, "");
}

/** 초 → 'M:SS' / 'H:MM:SS', 0 이면 'LIVE' */
export function secondsToString(sec: number): string {
  if (!sec) return "LIVE";
  let s = Math.round(sec);
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const mm = m < 10 ? `0${m}` : String(m);
  const ss = s < 10 ? `0${s}` : String(s);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 유튜브 'PT1H2M3S' → 초 */
export function parseIsoDuration(pt: string): number {
  const h = /(\d+)H/i.exec(pt);
  const m = /(\d+)M/i.exec(pt);
  const s = /(\d+)S/i.exec(pt);
  return (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
}

/** 1KB 미만도 KB 로, 1MB 이상은 MB 로 (레거시 get_file_size_from_length) */
export function fileSizeLabel(length: number): string {
  if (length < 1024 * 1024) return `${Math.floor((length / 1024) * 100) / 100} KB`;
  return `${Math.floor((length / 1024 / 1024) * 100) / 100} MB`;
}

export function shuffleInPlace<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
