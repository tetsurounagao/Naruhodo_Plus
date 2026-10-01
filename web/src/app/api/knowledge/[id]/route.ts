import { requireUser } from "../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../lib/http";
import { deleteKnowledge } from "../../../../lib/queries";

/** 学びの物理削除（未出題の学びの整理用）。 */
export const DELETE = handleParams<{ id: string }>(async (_req, { id }) => {
  await requireUser();
  try {
    await deleteKnowledge(id);
    return ok({ ok: true });
  } catch (e) {
    const m = e instanceof Error ? e.message : "unknown";
    if (m === "knowledge not found") return fail(404, "学びが見つかりません");
    if (m === "knowledge has quizzes")
      return fail(409, "クイズ化済みの学びは削除できません");
    throw e;
  }
});
