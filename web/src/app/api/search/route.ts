import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { searchQuizzes } from "../../../lib/queries";
import type { QuizSortKey, QuizStatusFilter } from "../../../lib/types";

const STATUSES: QuizStatusFilter[] = ["all", "unanswered", "answered"];
const SORTS: QuizSortKey[] = [
  "created_desc",
  "created_asc",
  "answered_desc",
  "answered_asc",
];

export const GET = handle(async (req) => {
  await requireUser();
  const p = new URL(req.url).searchParams;

  const tagsParam = p.get("tags");
  const tags = tagsParam
    ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  const statusParam = p.get("status");
  const status = STATUSES.includes(statusParam as QuizStatusFilter)
    ? (statusParam as QuizStatusFilter)
    : undefined;

  const sortParam = p.get("sort");
  const sort = SORTS.includes(sortParam as QuizSortKey)
    ? (sortParam as QuizSortKey)
    : undefined;

  const minStarRaw = Number(p.get("minStar"));
  const minStar = Number.isFinite(minStarRaw) ? minStarRaw : undefined;

  const quizzes = await searchQuizzes({
    q: p.get("q") ?? undefined,
    tags,
    status,
    sort,
    minStar,
    includeNote: p.get("note") === "1",
    includeLinkTitles: p.get("titles") === "1",
  });
  return ok({ quizzes });
});
