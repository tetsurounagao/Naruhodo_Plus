import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { activityTimestamps } from "../../../lib/queries";

/** クイズ生成の稼働カレンダー用。生成日時の配列（tz はクライアント側で local バケット）。 */
export const GET = handle(async (req) => {
  await requireUser();
  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 400) : 190;
  return ok({ timestamps: await activityTimestamps(days) });
});
