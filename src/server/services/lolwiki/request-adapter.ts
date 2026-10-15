// lolwiki-api.js 는 레거시 request-promise-native 형태의 request(options) 를 주입받는다.
// 그 중 실제로 쓰는 옵션(uri, method, headers, qs, body, json, formData, timeout)만 fetch 로 구현한다.

interface FormFile {
  value: Buffer;
  options: { filename: string; contentType: string };
}

export interface LegacyRequestOptions {
  uri: string;
  method?: string;
  headers?: Record<string, string>;
  qs?: Record<string, unknown>;
  body?: unknown;
  json?: boolean;
  formData?: Record<string, string | FormFile>;
  timeout?: number;
}

export class LegacyRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly error: unknown,
  ) {
    super(`${statusCode} - ${typeof error === "string" ? error : JSON.stringify(error)}`);
  }
}

export async function legacyRequest(options: LegacyRequestOptions): Promise<unknown> {
  const url = new URL(options.uri);
  for (const [key, value] of Object.entries(options.qs ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  const headers = new Headers(options.headers ?? {});
  let body: BodyInit | undefined;
  if (options.formData) {
    const form = new FormData();
    for (const [key, value] of Object.entries(options.formData)) {
      if (typeof value === "string") form.set(key, value);
      else form.set(key, new Blob([new Uint8Array(value.value)], { type: value.options.contentType }), value.options.filename);
    }
    headers.delete("Content-Type"); // boundary 는 fetch 가 붙인다
    body = form;
  } else if (options.body !== undefined) {
    if (options.json) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    } else body = options.body as BodyInit;
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body,
    signal: AbortSignal.timeout(options.timeout ?? 15_000),
  });
  const text = await res.text();
  let parsed: unknown = text;
  if (options.json && text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) throw new LegacyRequestError(res.status, parsed);
  return parsed;
}
