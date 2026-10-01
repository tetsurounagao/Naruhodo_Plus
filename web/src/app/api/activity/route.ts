import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { activityTimestamps, answerTimestamps } from "../../../lib/queries";

/**
 * 稼働カレンダー用。日時の配列（tz はクライアント側で local バケット）。
 * kind=answers は解答日時、kind=quizzes（既定）はクイズ生成日時。
 */
export const GET = handle(async (req) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const daysParam = Number(params.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 400) : 190;
  const timestamps =
    params.get("kind") === "answers" ? await answerTimestamps(days) : await activityTimestamps(days);
  return ok({ timestamps });
});
