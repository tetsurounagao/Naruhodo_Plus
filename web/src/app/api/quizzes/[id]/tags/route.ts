import { requireUser } from "../../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../../lib/http";
import { setQuizTags } from "../../../../../lib/queries";

/** クイズのタグを指定リストで置き換える（手動での追加・削除）。 */
export const PUT = handleParams<{ id: string }>(async (req, { id }) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as
    | { tags?: unknown }
    | null;
  if (!body || !Array.isArray(body.tags)) {
    return fail(400, "tags（文字列配列）を指定してください");
  }
  const raw = body.tags.filter((t): t is string => typeof t === "string");

  try {
    const tags = await setQuizTags(id, raw);
    return ok({ tags });
  } catch (err) {
    if (err instanceof Error && err.message === "quiz not found") {
      return fail(404, "クイズが見つかりません");
    }
    throw err;
  }
});
