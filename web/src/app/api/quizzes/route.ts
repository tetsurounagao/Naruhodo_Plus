import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { listQuizzes } from "../../../lib/queries";

export const GET = handle(async (req) => {
  await requireUser();

  const url = new URL(req.url);
  const tag = url.searchParams.get("tag") ?? undefined;
  const unansweredOnly = url.searchParams.get("unanswered") === "1";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const quizzes = await listQuizzes({ tag, unansweredOnly, limit });
  return ok({ quizzes });
});
