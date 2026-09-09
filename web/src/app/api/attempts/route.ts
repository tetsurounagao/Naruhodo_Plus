import { requireUser } from "../../../lib/auth";
import { handle, ok, fail } from "../../../lib/http";
import { gradeAndRecord } from "../../../lib/queries";

export const POST = handle(async (req) => {
  await requireUser();

  const body = (await req.json().catch(() => null)) as
    | { quiz_id?: string; user_answer?: string }
    | null;

  if (!body?.quiz_id || !body?.user_answer) {
    return fail(400, "quiz_id と user_answer は必須です");
  }

  try {
    const result = await gradeAndRecord(body.quiz_id, body.user_answer);
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "quiz not found") return fail(404, "クイズが見つかりません");
    if (message === "invalid user_answer") return fail(400, "不正な選択肢です");
    throw err;
  }
});
