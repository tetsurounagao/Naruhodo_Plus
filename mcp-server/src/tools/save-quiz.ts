import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import { normalizeTags } from "../lib/normalize-tags.js";
import { insertQuiz, knowledgeExists } from "../db.js";

const DESCRIPTION = `会話で生成した選択式クイズを1問保存する。list_knowledge で取得した学びをもとに作る。

## いつ呼ぶか（自然文トリガー）
- 「クイズ作って」「これのクイズ作って」「復習問題を作って」等と言われたとき。
  元にする学びが会話に無ければ list_knowledge（unquizzed_only: true 等）で取得してから作る。
- 「メモとクイズを両方作って」と言われたときは、先に add_knowledge（プレビューONなら
  confirm_knowledge まで）で学びを保存し、確定で返る id を source_knowledge_id に渡す。
- スラッシュコマンドに頼らず、この自然文で発火してよい。

## 作り方の指針
- 選択式のみ。選択肢は3〜5個。正解はちょうど1つ。
- choices は各要素 { id, type, content } の配列。
  - id: "a" "b" "c" ... のような短い識別子。
  - type: 現状は "text" のみ（画像対応は将来拡張。今は text 固定でよい）。
  - content: 選択肢の表示文字列。
- correct_answer: 正解の選択肢の id（content ではなく id）。
- explanation: なぜその答えになるかの簡潔な解説。
- source_knowledge_id: 元にした学びの id（list_knowledge の [id]）。分かる場合は必ず付ける。
- tags: 元の学びのタグを引き継ぐ。半角英数の短い文字列。表記ゆれは自動正規化。

## 注意
- 機密情報の抽象化は add_knowledge 時点で済んでいる前提。クイズ文にも固有名詞を持ち込まない。
- 同じ学びから複数問できても構わない。重複は気にせず保存してよい。
- 生成AI名はサーバーが created_by に自動記録する。`;

const choiceSchema = z.object({
  id: z.string().min(1).describe('選択肢の識別子（"a" など）'),
  type: z
    .enum(["text", "image"])
    .default("text")
    .describe('現状は "text" 固定'),
  content: z.string().min(1).describe("表示文字列（image の場合は画像URL）"),
});

const shape = {
  question: z.string().min(1).describe("設問文"),
  choices: z
    .array(choiceSchema)
    .min(2)
    .max(6)
    .describe("選択肢の配列（3〜5個推奨）"),
  correct_answer: z
    .string()
    .min(1)
    .describe("正解の選択肢の id"),
  explanation: z.string().optional().describe("解説（任意だが推奨）"),
  source_knowledge_id: z
    .string()
    .uuid()
    .optional()
    .describe("元にした学びの id（分かる場合は必ず指定）"),
  tags: z
    .array(z.string())
    .default([])
    .describe("タグ。元の学びから引き継ぐ"),
};

export function registerSaveQuiz(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "save_quiz",
    {
      title: "クイズを保存",
      description: DESCRIPTION,
      inputSchema: shape,
    },
    async ({
      question,
      choices,
      correct_answer,
      explanation,
      source_knowledge_id,
      tags,
    }) => {
      const ids = choices.map((c) => c.id);
      if (new Set(ids).size !== ids.length) {
        return {
          isError: true,
          content: [{ type: "text", text: "choices の id が重複しています。" }],
        };
      }
      if (!ids.includes(correct_answer)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `correct_answer "${correct_answer}" が choices の id（${ids.join(", ")}）に存在しません。`,
            },
          ],
        };
      }

      if (source_knowledge_id) {
        const exists = await knowledgeExists(ctx.supabase, source_knowledge_id);
        if (!exists) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `source_knowledge_id ${source_knowledge_id} に対応する学びが見つかりません。`,
              },
            ],
          };
        }
      }

      const { id } = await insertQuiz(ctx.supabase, {
        question,
        choices: choices.map((c) => ({
          id: c.id,
          type: c.type,
          content: c.content,
        })),
        correctAnswer: correct_answer,
        explanation,
        sourceKnowledgeId: source_knowledge_id,
        createdBy: ctx.config.clientName,
        tags: normalizeTags(tags ?? []),
      });

      return {
        content: [
          {
            type: "text",
            text: `クイズを保存しました（id: ${id}, created_by: ${ctx.config.clientName}）`,
          },
        ],
      };
    },
  );
}
