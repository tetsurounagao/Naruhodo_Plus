import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { homeSummary } from "../../../lib/queries";
import { tzOffsetFrom } from "../../../lib/tz";

/** ホーム画面のデータをまとめて返す（認証1回・DB問い合わせ並列）。?tz= はブラウザの getTimezoneOffset()。 */
export const GET = handle(async (req) => {
  await requireUser();
  return ok(await homeSummary(tzOffsetFrom(req.url)));
});
