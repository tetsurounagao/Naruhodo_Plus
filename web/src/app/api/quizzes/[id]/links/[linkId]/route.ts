import { requireUser } from "../../../../../../lib/auth";
import { handleParams, ok } from "../../../../../../lib/http";
import { deleteQuizLink } from "../../../../../../lib/queries";

export const DELETE = handleParams<{ id: string; linkId: string }>(
  async (_req, { id, linkId }) => {
    await requireUser();
    await deleteQuizLink(id, linkId);
    return ok({ ok: true });
  },
);
