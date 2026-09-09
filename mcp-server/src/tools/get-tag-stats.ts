import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import { normalizeTag } from "../lib/normalize-tags.js";
import { getTagStats } from "../db.js";

// 苦手タグ判定の暫定閾値（要件 9）。環境変数で上書き可能。
const MIN_ATTEMPTS = Number(process.env.NARUHODO_WEAK_TAG_MIN_ATTEMPTS ?? 3);
const MAX_ACCURACY = Number(process.env.NARUHODO_WEAK_TAG_MAX_ACCURACY ?? 0.6);

const DESCRIPTION = `タグ別の解答実績（解答回数・正答率）を返す。チャット上で復習状況を確認するための任意ツール。

- tag: 指定するとそのタグのみ。省略で全タグ。
- 「要復習」= 解答 ${MIN_ATTEMPTS} 回以上 かつ 正答率 ${Math.round(
  MAX_ACCURACY * 100,
)}% 未満（閾値は環境変数で変更可）。
- 集計は DB 側の SQL のみで行い、AI 呼び出しは発生しない。`;

const shape = {
  tag: z.string().optional().describe("対象タグ名（省略で全タグ）"),
};

export function registerGetTagStats(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_tag_stats",
    {
      title: "タグ別の正答率",
      description: DESCRIPTION,
      inputSchema: shape,
    },
    async ({ tag }) => {
      const rows = await getTagStats(
        ctx.supabase,
        tag ? normalizeTag(tag) : undefined,
      );

      if (rows.length === 0) {
        return { content: [{ type: "text", text: "集計対象のデータがありません。" }] };
      }

      const text = rows
        .map((r) => {
          const attempts = r.total_attempts;
          const pct =
            r.accuracy === null ? "—" : `${Math.round(r.accuracy * 100)}%`;
          const weak =
            attempts >= MIN_ATTEMPTS &&
            r.accuracy !== null &&
            r.accuracy < MAX_ACCURACY;
          return `${weak ? "⚠️ " : ""}${r.tag_name}: ${r.correct_attempts}/${attempts} 正答（${pct}）`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `${text}\n\n⚠️ = 要復習（${MIN_ATTEMPTS}回以上かつ${Math.round(MAX_ACCURACY * 100)}%未満）`,
          },
        ],
      };
    },
  );
}
