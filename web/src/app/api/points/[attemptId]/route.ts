import { requireUser } from "../../../../lib/auth";
import { handleParams, ok } from "../../../../lib/http";
import { removeEarning } from "../../../../lib/points";

/** 解いた後に取り下げた問題のポイントを戻す。 */
export const DELETE = handleParams<{ attemptId: string }>(async (_req, { attemptId }) => {
  await requireUser();
  await removeEarning(attemptId);
  return ok({ ok: true });
});
