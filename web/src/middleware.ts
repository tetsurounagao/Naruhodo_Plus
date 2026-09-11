import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

/**
 * - すべてのリクエストでセッション Cookie を更新する
 * - 未ログインで保護ページに来たら /login へ
 * - 未ログインで /api/* に来たら 401 JSON（/api/auth/*・/api/connect/* は除く）
 * - 環境変数未設定など Supabase クライアントを作れないときは /connect へ誘導
 */
const PUBLIC_PATHS = ["/login", "/connect"];
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/connect/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isApi = pathname.startsWith("/api/");
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublicPage = PUBLIC_PATHS.includes(pathname);

  let session: Awaited<ReturnType<typeof updateSession>>;
  try {
    session = await updateSession(request);
  } catch {
    // Supabase の環境変数が無い / 壊れている。セットアップウィザードだけ通す。
    if (isPublicPage || isPublicApi) return NextResponse.next();
    if (isApi) return NextResponse.json({ error: "not_configured" }, { status: 503 });
    return NextResponse.redirect(new URL("/connect", request.url));
  }

  const { response, user } = session;

  if (user) {
    // ログイン済みで /login に来たらトップへ（/connect は再設定用に許可）
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
