import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { homeSummary } from "../../../lib/queries";

/** ホーム画面のデータをまとめて返す（認証1回・DB問い合わせ並列）。 */
export const GET = handle(async () => {
  await requireUser();
  return ok(await homeSummary());
});
