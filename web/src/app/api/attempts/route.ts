import { requireUser } from "../../../lib/auth";
import { handle, ok, fail } from "../../../lib/http";
import { gradeAndRecord } from "../../../lib/queries";
import type { Confidence } from "../../../lib/types";

const CONFIDENCES: Confidence[] = ["sure", "unsure"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = handle(async (req) => {
  await requireUser();

  const body = (await req.json().catch(() => null)) as
    | { id?: string; quiz_id?: string; user_answer?: string; confidence?: string; points?: number }
    | null;

  if (!body?.quiz_id || !body?.user_answer) {
    return fail(400, "quiz_id と user_answer は必須です");
  }

  // 未指定は「自信あり」扱い（従来どおりの呼び出しを壊さない）
  const confidence = (body.confidence ?? "sure") as Confidence;
  if (!CONFIDENCES.includes(confidence)) {
    return fail(400, "confidence は sure / unsure のいずれかです");
  }

  // id: ブラウザで作った解答 id（再送しても二重に記録しないため。#97）。points: /play の得点
  if (body.id !== undefined && (typeof body.id !== "string" || !UUID.test(body.id))) {
    return fail(400, "id は UUID で指定してください");
  }
  const points = body.points ?? 0;
  if (!Number.isInteger(points) || points < 0) {
    return fail(400, "points は 0 以上の整数で指定してください");
  }

  try {
    const result = await gradeAndRecord(body.quiz_id, body.user_answer, confidence, { id: body.id, points });
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "quiz not found") return fail(404, "クイズが見つかりません");
    if (message === "invalid user_answer") return fail(400, "不正な選択肢です");
    if (message === "points exceed cap") return fail(400, "この解答で得られるポイントを超えています");
    throw err;
  }
});
