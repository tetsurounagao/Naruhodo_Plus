import { createSupabaseServerClient } from "./supabase/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Route Handler でログインセッションを検証する。
 * 未ログインなら 401 の HttpError を投げる。
 */
export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, "unauthorized");
  }
  return user;
}
