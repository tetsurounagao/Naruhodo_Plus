import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import { takeDraft } from "../lib/drafts.js";
import { insertKnowledge } from "../db.js";

const DESCRIPTION = `add_knowledge がプレビューON時に返した下書きを確定して実際に保存する。

- add_knowledge のレスポンスに含まれる draft_token をそのまま渡す。
- ユーザーが保存内容に同意した後にのみ呼ぶ。修正が必要なら confirm せず、
  修正後の内容で add_knowledge を呼び直して新しい draft_token を得る。
- draft_token は一度使うと無効になる（30分で自動失効）。`;

const shape = {
  draft_token: z
    .string()
    .min(1)
    .describe("add_knowledge が返した draft_token"),
};

export function registerConfirmKnowledge(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "confirm_knowledge",
    {
      title: "学びの保存を確定",
      description: DESCRIPTION,
      inputSchema: shape,
    },
    async ({ draft_token }) => {
      const draft = takeDraft(draft_token);
      if (!draft) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "draft_token が無効か期限切れです。add_knowledge を呼び直してください。",
            },
          ],
        };
      }

      const row = await insertKnowledge(ctx.supabase, {
        question: draft.question,
        answer: draft.answer,
        context: draft.context,
        source: draft.source,
        tags: draft.tags,
      });
      return {
        content: [
          {
            type: "text",
            text: `保存しました（id: ${row.id}）\ntags: ${draft.tags.join(", ") || "(なし)"}`,
          },
        ],
      };
    },
  );
}
