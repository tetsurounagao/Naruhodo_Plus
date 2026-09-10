"use client";

/** ブラウザから自前 API ルートを叩く薄いヘルパー。Supabase には直接触れない。 */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  return handle<T>(res);
}

export async function apiPost<T>(
  path: string,
  payload: unknown,
  method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: payload === null || payload === undefined ? undefined : JSON.stringify(payload),
  });
  return handle<T>(res);
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `リクエスト失敗 (${res.status})`);
  }
  return res.json() as Promise<T>;
}
