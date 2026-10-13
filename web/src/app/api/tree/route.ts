import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { getTree } from "../../../lib/points";

/** 神殿の木の状態（残高・経験値・レベル）。 */
export const GET = handle(async () => {
  await requireUser();
  return ok(await getTree());
});
