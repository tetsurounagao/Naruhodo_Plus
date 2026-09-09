import { after } from "next/server";
import { requireUser } from "../../../../../lib/auth";
import { handleParams, ok, fail } from "../../../../../lib/http";
import { addQuizLink, listQuizLinks, updateLinkTitle } from "../../../../../lib/queries";
import { fetchPageTitle } from "../../../../../lib/link-title";

export const GET = handleParams<{ id: string }>(async (_req, { id }) => {
  await requireUser();
  return ok({ links: await listQuizLinks(id) });
});

/** URL を1件追加。応答後にタイトルを非同期取得して埋める。 */
export const POST = handleParams<{ id: string }>(async (req, { id }) => {
  await requireUser();
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const url = body?.url?.trim();
  if (!url) return fail(400, "url は必須です");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail(400, "URL の形式が不正です");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fail(400, "http / https の URL を指定してください");
  }

  try {
    const link = await addQuizLink(id, url);
    after(async () => {
      try {
        const title = await fetchPageTitle(url);
        await updateLinkTitle(link.id, title);
      } catch {
        await updateLinkTitle(link.id, null);
      }
    });
    return ok({ link });
  } catch (err) {
    if (err instanceof Error && err.message === "quiz not found") {
      return fail(404, "クイズが見つかりません");
    }
    throw err;
  }
});
