import { headers } from "next/headers";
import { createSupabaseServerClient } from "./supabase/server";
import { USER_ID_HEADER } from "./user-header";

export { USER_ID_HEADER };

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Route Handler でログインユーザーを得る。
 *
 * middleware（src/middleware.ts）が全リクエストで getUser() を実行し、検証済みの
 * ユーザー ID を USER_ID_HEADER に載せている（外部からの偽装は middleware が毎回
 * 上書き/削除するので不可）。通常はそのヘッダを読むだけで Supabase への往復は無い。
 * ヘッダが無い場合のみ従来どおり Supabase Auth に問い合わせる。
 */
export async function requireUser(): Promise<{ id: string }> {
  const uid = (await headers()).get(USER_ID_HEADER);
  if (uid) return { id: uid };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new HttpError(401, "unauthorized");
  return { id: user.id };
}
