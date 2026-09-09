import { requireUser } from "../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../lib/http";
import { getQuizForAnswering } from "../../../../lib/queries";

export const GET = handleParams<{ id: string }>(async (_req, { id }) => {
  await requireUser();
  const quiz = await getQuizForAnswering(id);
  if (!quiz) return fail(404, "クイズが見つかりません");
  return ok({ quiz });
});
