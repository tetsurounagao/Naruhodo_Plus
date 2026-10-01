import { requireUser } from "../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../lib/http";
import { getQuizForAnswering, setQuizAnnotation } from "../../../../lib/queries";

export const GET = handleParams<{ id: string }>(async (_req, { id }) => {
  await requireUser();
  const quiz = await getQuizForAnswering(id);
  if (!quiz) return fail(404, "クイズが見つかりません");
  return ok({ quiz });
});

/** star / note / hidden / fix_note の更新。fix_note は null で解除。 */
export const PATCH = handleParams<{ id: string }>(async (req, { id }) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as
    | { star?: number; note?: string | null; hidden?: boolean; fix_note?: string | null }
    | null;
  if (
    !body ||
    (body.star === undefined &&
      body.note === undefined &&
      body.hidden === undefined &&
      body.fix_note === undefined)
  ) {
    return fail(400, "star / note / hidden / fix_note のいずれかを指定してください");
  }
  if (
    body.fix_note !== undefined &&
    body.fix_note !== null &&
    typeof body.fix_note !== "string"
  ) {
    return fail(400, "fix_note は文字列か null で指定してください");
  }
  try {
    const updated = await setQuizAnnotation(id, body);
    return ok(updated);
  } catch (err) {
    const m = err instanceof Error ? err.message : "unknown";
    if (m === "quiz not found") return fail(404, "クイズが見つかりません");
    if (m.startsWith("star")) return fail(400, m);
    throw err;
  }
});
