import { requireUser } from "../../../../lib/auth";
import { handle, ok } from "../../../../lib/http";
import { recentlyActiveTags } from "../../../../lib/queries";

/** 直近5日間に生成されたクイズで使用が多いタグ（手動追加の候補）。 */
export const GET = handle(async () => {
  await requireUser();
  return ok({ tags: await recentlyActiveTags(5, 8) });
});
