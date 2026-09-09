import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import { normalizeTags } from "../lib/normalize-tags.js";
import { listKnowledge } from "../db.js";

const DESCRIPTION = `保存済みの学びを条件抽出する。主にクイズ生成の元データを取得するために使う。

- tags: 指定したタグのいずれかが付いた学びに絞る（省略時は全件対象）。表記ゆれは自動正規化。
- unquizzed_only: true にすると、まだ1問もクイズ化されていない学びだけを返す。
  「新しく復習クイズを作って」と言われたときはこれを true にするとよい。
- limit: 返す最大件数（既定 50、上限 200）。

各件には id / question / answer / context / source / tags / quiz_count（既存クイズ数）が入る。
この結果をもとに選択式クイズを作り、save_quiz で保存する。`;

const shape = {
  tags: z
    .array(z.string())
    .optional()
    .describe("絞り込むタグ（いずれか一致）。省略で全件"),
  unquizzed_only: z
    .boolean()
    .default(false)
    .describe("まだクイズ化されていない学びだけに絞るなら true"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe("返す最大件数（既定 50 / 上限 200）"),
};

export function registerListKnowledge(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_knowledge",
    {
      title: "学びを一覧・抽出",
      description: DESCRIPTION,
      inputSchema: shape,
    },
    async ({ tags, unquizzed_only, limit }) => {
      const rows = await listKnowledge(ctx.supabase, {
        tags: tags && tags.length > 0 ? normalizeTags(tags) : undefined,
        unquizzedOnly: unquizzed_only,
        limit,
      });

      if (rows.length === 0) {
        return { content: [{ type: "text", text: "該当する学びはありません。" }] };
      }

      const text = rows
        .map((r, i) => {
          const lines = [
            `${i + 1}. [${r.id}] (quiz_count: ${r.quiz_count})`,
            `   Q: ${r.question}`,
            `   A: ${r.answer}`,
          ];
          if (r.context) lines.push(`   context: ${r.context}`);
          if (r.source) lines.push(`   source: ${r.source}`);
          lines.push(`   tags: ${r.tags.join(", ") || "(なし)"}`);
          return lines.join("\n");
        })
        .join("\n\n");

      return {
        content: [
          { type: "text", text: `${rows.length} 件:\n\n${text}` },
        ],
      };
    },
  );
}
