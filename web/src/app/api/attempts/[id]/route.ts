import { requireUser } from "../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../lib/http";
import { markAttemptEasy } from "../../../../lib/queries";

/** 「簡単すぎた」。body: { easy: true }。自信ありで正解した解答にだけ付けられる。 */
export const PATCH = handleParams<{ id: string }>(async (req, { id }) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as { easy?: boolean } | null;
  if (body?.easy !== true) return fail(400, "easy: true を指定してください");
  try {
    await markAttemptEasy(id);
    return ok({ ok: true });
  } catch (err) {
    const m = err instanceof Error ? err.message : "unknown";
    if (m === "attempt not found") return fail(404, "解答が見つかりません");
    if (m === "not a confident correct answer")
      return fail(409, "「簡単すぎた」は自信ありで正解した解答にだけ付けられます");
    throw err;
  }
});
