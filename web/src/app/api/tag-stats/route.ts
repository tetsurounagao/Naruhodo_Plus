import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { listTagStats } from "../../../lib/queries";

export const GET = handle(async () => {
  await requireUser();
  const stats = await listTagStats();
  return ok({ stats });
});
