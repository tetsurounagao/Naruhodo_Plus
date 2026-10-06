import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import { normalizeTags } from "../lib/normalize-tags.js";
import { lintQuiz } from "../lib/quiz-lint.js";
import {
  insertQuiz,
  knowledgeExists,
  quizExists,
  retireReplacedQuiz,
} from "../db.js";

const DESCRIPTION = `会話で生成した選択式クイズを1問保存する。list_knowledge で取得した学びをもとに作る。

## いつ呼ぶか（自然文トリガー）
- 「クイズ作って」「これのクイズ作って」「復習問題を作って」等と言われたとき。
  元にする学びが会話に無ければ list_knowledge（unquizzed_only: true 等）で取得してから作る。
- 「メモとクイズを両方作って」と言われたときは、先に add_knowledge（プレビューONなら
  confirm_knowledge まで）で学びを保存し、確定で返る id を source_knowledge_id に渡す。
- スラッシュコマンドに頼らず、この自然文で発火してよい。

## 作り方の指針
- 選択式のみ。選択肢は3〜5個（サーバーで強制）。正解はちょうど1つ。
- choices は各要素 { id, type, content, language?, rationale } の配列。
  - id: "a" "b" "c" ... のような短い識別子。
  - type: "text"（文字列）/ "code"（コード片。等幅＋シンタックスハイライト表示）/ "image"（画像URL）。
  - content: 表示内容。type が "code" ならコード文字列そのもの、"image" なら画像URL。
  - language: type が "code" のときのハイライト言語（"ts" "python" "sql" など）。任意。
  - rationale: その選択肢がなぜ正解／不正解かの理由（1〜2文。Markdown 可）。**全選択肢に必須**。
- correct_answer: 正解の選択肢の id（content ではなく id）。
- choices を渡す順序は気にしなくてよい。正解を先頭に置いて残りを後から書いてよい
  （並び順は保存時にサーバー側でランダムに入れ替わる。id は変わらないので correct_answer の指定はそのままでよい）。
- explanation: なぜその答えになるかの簡潔な解説。**必須**。Markdown 可。コードは \`\`\` フェンスで。
- 各選択肢の rationale（誤答はなぜ誤りか、正解はなぜ正しいか）も必須。
  explanation は全体の解説、rationale は選択肢ごとの短い理由。
  rationale は解答後にだけ表示されるので、正解が分かる書き方をしてよい。

## 誤答（不正解の選択肢）の作り方
- 学習者が実際にしがちな勘違い・混同・古い知識から作る。もっともらしいものだけにする。
- 正解と同じくらいの長さ・具体性・文体にそろえる。正解だけ詳しく長いと、長さで正解が分かってしまう。
- 「すべて正しい」「いずれも誤り」「該当なし」のような選択肢は使わない。
- 冗談や明らかに無関係な選択肢（消去法ですぐ外せるもの）を入れない。

## 保存前のチェック（サーバーが機械的に行う）
- 次に当てはまると保存せず、理由と直し方を返す。指摘どおり直して、もう一度 save_quiz を呼ぶこと。
  - 選択肢の中身が重複している
  - 穴埋めの空所（____）が 2 か所以上ある
  - 文字の選択肢で、正解だけがほかの最長の 2 倍以上長い（正解が 20 文字以上のとき）
- コードの選択肢で language を省いた場合は、問題文のコードフェンスの言語で自動的に補う。
- source_knowledge_id: 元にした学びの id（list_knowledge の [id]）。分かる場合は必ず付ける。
- tags: 元の学びのタグを引き継ぐ。半角英数の短い文字列。表記ゆれは自動正規化。

## コードを含む問題・穴埋め
- question に Markdown のコードフェンス（\`\`\`言語 … \`\`\`）を入れてよい。Web 画面が整形表示する。
- 穴埋めにする場合、question のコード内の空所を \`____\`（アンダースコア4つ）で表す。
  空所は1問につき1箇所。選択肢（多くは type: "code"）から正しい断片を1つ選ばせる。
- 例: question に \`const x = arr.____(f);\`、choices が map / flatMap / filter の3つ。

## 注意
- 機密情報の抽象化は add_knowledge 時点で済んでいる前提。クイズ文・コードにも社内固有の
  識別子や固有名詞を持ち込まない。持ち込む必要があるなら汎用名に置き換える。
- 要修正の問題を直すとき（「問題がおかしい」と指摘された問題の修正を頼まれたとき）は、
  元の問題を書き換えるのではなく、直した問題を新規保存し replaces_quiz_id に元の問題の id を渡す。
  元の問題は自動で非表示になり、要修正フラグも外れる。解答履歴は元の問題に残る。
  tags と source_knowledge_id は元の問題のものを引き継ぐ。
- 同じ学びから複数問できても構わない。重複は気にせず保存してよい。
- 生成AI名はサーバーが created_by に自動記録する。`;

const choiceSchema = z.object({
  id: z.string().min(1).describe('選択肢の識別子（"a" など）'),
  type: z
    .enum(["text", "image", "code"])
    .default("text")
    .describe('"text" / "code"（コード片）/ "image"（画像URL）'),
  content: z
    .string()
    .min(1)
    .describe('表示内容。"code" ならコード文字列、"image" なら画像URL'),
  language: z
    .string()
    .optional()
    .describe('type が "code" のときのハイライト言語（"ts" 等）。任意'),
  rationale: z
    .string({ error: "rationale（この選択肢がなぜ正解／不正解かの理由）は全選択肢に必須です" })
    .trim()
    .min(1, "rationale（この選択肢がなぜ正解／不正解かの理由）は全選択肢に必須です")
    .describe("この選択肢がなぜ正解／不正解かの理由（1〜2文。Markdown 可）。必須"),
});

const shape = {
  question: z.string().min(1).describe("設問文"),
  choices: z
    .array(choiceSchema)
    .min(3, "選択肢は 3〜5 個にしてください")
    .max(5, "選択肢は 3〜5 個にしてください")
    .describe("選択肢の配列（3〜5個）"),
  correct_answer: z
    .string()
    .min(1)
    .describe("正解の選択肢の id"),
  explanation: z
    .string({ error: "explanation（全体の解説）は必須です" })
    .trim()
    .min(1, "explanation（全体の解説）は必須です")
    .describe("なぜその答えになるかの解説。必須"),
  source_knowledge_id: z
    .string()
    .uuid()
    .optional()
    .describe("元にした学びの id（分かる場合は必ず指定）"),
  tags: z
    .array(z.string())
    .default([])
    .describe("タグ。元の学びから引き継ぐ"),
  replaces_quiz_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "要修正の問題を直したときだけ指定する元の問題の id。保存後に元の問題は自動で非表示になる",
    ),
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
      replaces_quiz_id,
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

      // 保存前の機械チェック。引っかかったら保存せず、指摘と直し方をまとめて返す
      const lint = lintQuiz({ question, choices, correctAnswer: correct_answer });
      if (!lint.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "保存していません。次の点を直して、もう一度 save_quiz を呼んでください。\n" +
                lint.issues.map((i) => `- ${i.message}`).join("\n"),
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

      if (replaces_quiz_id) {
        const exists = await quizExists(ctx.supabase, replaces_quiz_id);
        if (!exists) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `replaces_quiz_id ${replaces_quiz_id} に対応するクイズが見つかりません。`,
              },
            ],
          };
        }
      }

      const { id } = await insertQuiz(ctx.supabase, {
        question,
        choices: lint.choices.map((c) => ({
          id: c.id,
          type: c.type,
          content: c.content,
          ...(c.type === "code" && c.language ? { language: c.language } : {}),
          rationale: c.rationale,
        })),
        correctAnswer: correct_answer,
        explanation,
        sourceKnowledgeId: source_knowledge_id,
        createdBy: ctx.config.clientName,
        tags: normalizeTags(tags ?? []),
      });

      // 新しい問題の保存に成功してから元の問題を退役させる（失敗時に元が消えないように）
      if (replaces_quiz_id) {
        await retireReplacedQuiz(ctx.supabase, replaces_quiz_id);
      }

      return {
        content: [
          {
            type: "text",
            text:
              `クイズを保存しました（id: ${id}, created_by: ${ctx.config.clientName}）` +
              (replaces_quiz_id
                ? `。元の問題 ${replaces_quiz_id} は非表示にしました`
                : ""),
          },
        ],
      };
    },
  );
}
