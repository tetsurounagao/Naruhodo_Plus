import { NextResponse } from "next/server";
import { HttpError } from "./auth";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function toResponse(err: unknown): Response {
  if (err instanceof HttpError) return fail(err.status, err.message);
  console.error("[api] unhandled error:", err);
  return fail(500, "internal_error");
}

/** パラメータなしの Route Handler を包み、例外を JSON レスポンスに変換する。 */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (err) {
      return toResponse(err);
    }
  };
}

/** 動的セグメントを持つ Route Handler 用。 */
export function handleParams<P extends Record<string, string>>(
  fn: (req: Request, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      return await fn(req, await ctx.params);
    } catch (err) {
      return toResponse(err);
    }
  };
}
