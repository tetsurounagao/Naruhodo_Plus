import { requireUser } from "../../../../lib/auth";
import { handle, ok, fail } from "../../../../lib/http";
import { offerToTree } from "../../../../lib/points";

/** 木にポイントを捧げる。body: { amount }。捧げた後の木の状態を返す。 */
export const POST = handle(async (req) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as { amount?: unknown } | null;
  if (typeof body?.amount !== "number") return fail(400, "amount を指定してください");
  return ok(await offerToTree(body.amount));
});
