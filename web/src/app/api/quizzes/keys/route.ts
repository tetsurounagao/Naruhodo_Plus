import { requireUser } from "../../../../lib/auth";
import { handle, ok, fail } from "../../../../lib/http";
import { answerKeys } from "../../../../lib/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /play で出題中の問題の答え合わせ用の情報（#97）。body: { ids: string[] }（100 件まで）。
 * ボタンを押した瞬間に正誤を出すため、解く前に裏で取っておく。
 */
export const POST = handle(async (req) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = body?.ids;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
    return fail(400, "ids は UUID の配列で指定してください");
  }
  return ok({ keys: await answerKeys(ids as string[]) });
});
