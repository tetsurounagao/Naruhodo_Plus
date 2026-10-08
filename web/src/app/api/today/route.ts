import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { todayTerm } from "../../../lib/queries";
import { tzOffsetFrom } from "../../../lib/tz";

/** 今日の 1 ターム（/play?mode=today 用）。?tz= はブラウザの getTimezoneOffset()。 */
export const GET = handle(async (req) => {
  await requireUser();
  return ok(await todayTerm(tzOffsetFrom(req.url)));
});
