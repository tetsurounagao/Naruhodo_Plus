import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "../env";

/**
 * Cookie ベースのセッションを読む Supabase クライアント（anon キー）。
 * ログイン処理とセッション検証にのみ使う。DB の読み書きは admin クライアントで行う
 * （全テーブル RLS 全拒否のため anon では何も読めない）。
 *
 * Server Component / Route Handler から呼ぶ。
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component から呼ばれた場合は set 不可。middleware 側で更新するので無視。
        }
      },
    },
  });
}
