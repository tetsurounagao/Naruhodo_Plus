import { requireUser } from "../../../lib/auth";
import { handle, ok, fail } from "../../../lib/http";
import { recordEarning } from "../../../lib/points";

/** /play で解答 1 件ぶんの獲得ポイントを記録する。body: { attempt_id, points } */
export const POST = handle(async (req) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as { attempt_id?: unknown; points?: unknown } | null;
  if (typeof body?.attempt_id !== "string" || typeof body.points !== "number")
    return fail(400, "attempt_id と points を指定してください");
  await recordEarning(body.attempt_id, body.points);
  return ok({ ok: true });
});
