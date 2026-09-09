import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "../env";
import { USER_ID_HEADER } from "../user-header";

/**
 * middleware から呼ぶ。セッション Cookie を更新しつつ、現在のユーザーを返す。
 * 返り値の response をそのまま return すること（Cookie と検証済みユーザー ID ヘッダが載っている）。
 */
export async function updateSession(request: NextRequest) {
  // 外部から送られてきた偽の ID ヘッダは必ず捨てる
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(USER_ID_HEADER);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 検証済みユーザー ID を下流の Route Handler へ渡す（requireUser がこれを信頼する）。
  // getUser() 中に更新された可能性のある Set-Cookie は引き継ぐ。
  if (user) {
    requestHeaders.set(USER_ID_HEADER, user.id);
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
    response = next;
  }

  return { response, user };
}
