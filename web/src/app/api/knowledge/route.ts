import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { listUnquizzedKnowledge } from "../../../lib/queries";

export const GET = handle(async (req) => {
  await requireUser();

  const url = new URL(req.url);
  // 現状は未クイズ化の一覧のみ提供する（クイズ生成フローの起点）
  const unquizzed = url.searchParams.get("unquizzed") !== "0";
  if (!unquizzed) {
    return ok({ knowledge: [] });
  }

  const knowledge = await listUnquizzedKnowledge();
  return ok({ knowledge });
});
