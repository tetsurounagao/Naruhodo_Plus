import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { listKnowledge, listUnquizzedKnowledge } from "../../../lib/queries";

export const GET = handle(async (req) => {
  await requireUser();

  const url = new URL(req.url);
  // 既定は未クイズ化の一覧（クイズ生成フローの起点）。unquizzed=0 でクイズ化済みも含めた全件
  const unquizzed = url.searchParams.get("unquizzed") !== "0";
  const knowledge = unquizzed ? await listUnquizzedKnowledge() : await listKnowledge();
  return ok({ knowledge });
});
