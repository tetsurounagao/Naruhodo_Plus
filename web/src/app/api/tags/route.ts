import { requireUser } from "../../../lib/auth";
import { handle, ok } from "../../../lib/http";
import { listTags } from "../../../lib/queries";

export const GET = handle(async () => {
  await requireUser();
  return ok({ tags: await listTags() });
});
