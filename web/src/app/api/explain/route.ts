import { requireUser } from "../../../lib/auth";
import { handle, ok, fail } from "../../../lib/http";
import { explainAvailable, explainTerm } from "../../../lib/explain";

export const GET = handle(async () => {
  await requireUser();
  return ok({ available: explainAvailable() });
});

export const POST = handle(async (req) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as
    | { term?: string; context?: string }
    | null;

  const term = body?.term?.trim();
  if (!term) return fail(400, "term は必須です");
  if (term.length > 120) return fail(400, "調べる語が長すぎます（120 文字まで）");

  const context = body?.context?.trim().slice(0, 500) || undefined;
  // HttpError は handle() が JSON に変換する
  return ok(await explainTerm(term, context));
});
