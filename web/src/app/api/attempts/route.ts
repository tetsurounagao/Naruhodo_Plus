import { requireUser } from "../../../lib/auth";
import { handle, ok, fail } from "../../../lib/http";
import { gradeAndRecord } from "../../../lib/queries";
import type { Confidence } from "../../../lib/types";

const CONFIDENCES: Confidence[] = ["sure", "unsure"];

export const POST = handle(async (req) => {
  await requireUser();

  const body = (await req.json().catch(() => null)) as
    | { quiz_id?: string; user_answer?: string; confidence?: string }
    | null;

  if (!body?.quiz_id || !body?.user_answer) {
    return fail(400, "quiz_id と user_answer は必須です");
  }

  // 未指定は「自信あり」扱い（従来どおりの呼び出しを壊さない）
  const confidence = (body.confidence ?? "sure") as Confidence;
  if (!CONFIDENCES.includes(confidence)) {
    return fail(400, "confidence は sure / unsure のいずれかです");
  }

  try {
    const result = await gradeAndRecord(body.quiz_id, body.user_answer, confidence);
    return ok(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "quiz not found") return fail(404, "クイズが見つかりません");
    if (message === "invalid user_answer") return fail(400, "不正な選択肢です");
    throw err;
  }
});
