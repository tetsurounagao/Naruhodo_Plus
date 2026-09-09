import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

/**
 * - すべてのリクエストでセッション Cookie を更新する
 * - 未ログインで保護ページに来たら /login へ
 * - 未ログインで /api/* に来たら 401 JSON（/api/auth/* は除く）
 */
const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith("/api/");
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublicPage = PUBLIC_PATHS.includes(pathname);

  if (user) {
    // ログイン済みで /login に来たらトップへ
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (isApi && !isPublicApi) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isApi && !isPublicPage) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = {
  // 静的ファイルと Next 内部を除外
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
