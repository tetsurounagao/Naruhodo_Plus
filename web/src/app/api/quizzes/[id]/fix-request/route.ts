import { requireUser } from "../../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../../lib/http";
import { getQuizFixSource } from "../../../../../lib/queries";

/**
 * 修正依頼プロンプト用に、正解・解説を含む問題全体を返す。
 * 要修正（fix_note あり）の問題に限定し、依頼ボタン押下時にだけ呼ぶ
 * （回答前の画面に正解を載せないため、GET /api/quizzes/[id] には含めない）。
 */
export const GET = handleParams<{ id: string }>(async (_req, { id }) => {
  await requireUser();
  try {
    const quiz = await getQuizFixSource(id);
    if (!quiz) return fail(404, "クイズが見つかりません");
    return ok({ quiz });
  } catch (err) {
    if (err instanceof Error && err.message === "not flagged") {
      return fail(409, "この問題は要修正になっていません");
    }
    throw err;
  }
});
