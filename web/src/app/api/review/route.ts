import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { dueForReview } from "../../../lib/queries";

/** 復習おすすめ（忘却曲線ベース）の全件。グルーピングはクライアント側。 */
export const GET = handle(async () => {
  await requireUser();
  return ok({ items: await dueForReview() });
});
