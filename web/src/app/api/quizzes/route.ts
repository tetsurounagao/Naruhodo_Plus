import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { listQuizzes } from "../../../lib/queries";
import type {
  HiddenFilter,
  QuizSortKey,
  QuizStatusFilter,
} from "../../../lib/types";

const STATUSES: QuizStatusFilter[] = ["all", "unanswered", "answered"];
const HIDDEN: HiddenFilter[] = ["exclude", "only", "all"];
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

  const hiddenParam = p.get("hidden");
  const hidden = HIDDEN.includes(hiddenParam as HiddenFilter)
    ? (hiddenParam as HiddenFilter)
    : undefined;

  const quizzes = await listQuizzes({
    tag: p.get("tag") ?? undefined,
    tags,
    status,
    sort,
    minStar,
    hidden,
    unansweredOnly: p.get("unanswered") === "1",
    limit: p.get("limit") ? Number(p.get("limit")) : undefined,
  });
  return ok({ quizzes });
});
