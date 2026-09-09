import { requireUser } from "../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../lib/http";
import { getQuizForAnswering, setQuizAnnotation } from "../../../../lib/queries";

export const GET = handleParams<{ id: string }>(async (_req, { id }) => {
  await requireUser();
  const quiz = await getQuizForAnswering(id);
  if (!quiz) return fail(404, "クイズが見つかりません");
  return ok({ quiz });
});

/** star / note の更新。 */
export const PATCH = handleParams<{ id: string }>(async (req, { id }) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as
    | { star?: number; note?: string | null }
    | null;
  if (!body || (body.star === undefined && body.note === undefined)) {
    return fail(400, "star か note を指定してください");
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
