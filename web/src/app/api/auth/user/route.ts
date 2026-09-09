import { requireUser } from "../../../../lib/auth";
import { handle, ok } from "../../../../lib/http";

export const GET = handle(async () => {
  const user = await requireUser();
  return ok({ user: { id: user.id, email: user.email } });
});
