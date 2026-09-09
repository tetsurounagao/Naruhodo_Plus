import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import { normalizeTags } from "../lib/normalize-tags.js";
import { scanSensitive } from "../lib/sensitive.js";
import { putDraft } from "../lib/drafts.js";
import { insertKnowledge } from "../db.js";

const DESCRIPTION = `業務や学習の中で得た「疑問」と「その回答」を1件、復習用ストックに保存する。

## いつ呼ぶか
ユーザーが「メモして」「記録して」「これ保存しといて」「あとで復習したい」等と言ったとき、
または疑問とその解決（回答）が会話中で一通り揃い、ユーザーがそれを残したそうなときに呼ぶ。
雑談や、回答が定まっていない相談段階では呼ばない。

## 保存前に必ず行う抽象化（機密情報対策の1段目）
question / answer / context / コード から、業務・組織を特定しうる情報を取り除き、
技術的な概念だけが残るよう一般化してから渡すこと。

### 取り除く / 置き換える
- 会社名・製品名・サービス名・チーム名・人名などの固有名詞
- 社内システム名、社内URL・ホスト名、社内用語、リポジトリ名、パッケージ名
- チケットID（例: ABC-1234）、PR/Issue 番号、Slack チャンネル名
- ドメインに紐づく識別子: 業務固有のクラス名・関数名・変数名・テーブル名・カラム名
  （例: OrderTaxCalculator → TaxCalculator、shain_kbn → userType）
- 社内処理を説明する日本語コメント、業務ルールの数値で組織を特定しうるもの

### そのまま残してよい
- プログラミング言語のキーワード・構文（const, async, satisfies など）
- 標準ライブラリ / 有名フレームワークの API 名・オプション名
- 学びの核になる一般的な概念・アルゴリズム・型の説明

例: 「◯◯社の決済APIで OrderTaxService.calc() が tax_rate を…」
  → 「決済処理で税額計算の関数に税率を渡すと…」

APIキー・トークン・メールアドレス・社内ドメインが本文に残っていると、サーバー側で保存を拒否する。

## 抽象化メモ（プレビューON時は必須）
abstraction_note に「元の何を、何に置き換えたか」を1〜3行で書く。
プレビュー表示に含めてユーザーが確認できるようにするため。
置き換えが不要だった場合は「業務固有情報なし」と書く。

## コード例を含める場合
answer / question に短いコード例を入れてよい。ただし:
- Markdown のコードフェンス（\`\`\`言語 … \`\`\`）で囲む。Web 画面はこれを整形表示する。
- 上記の抽象化ルールをコードにも適用し、社内固有の識別子は汎用名に置き換える。
- 長い実コードの貼り付けは避け、要点が分かる数行に絞る。

## tags の付け方
- 半角英数の短い文字列を配列で渡す（例: ["react", "hooks", "state-management"]）。
- 既存タグと同じ概念なら必ず同じ表記を使い回す。表記ゆれ・大文字小文字はサーバー側で正規化するので気にしなくてよい。
- 類義語かどうかの判断はしなくてよい（サーバーが機械的に正規化する）。2〜4個程度を目安に。

## 保存の流れ（プレビュー設定）
このツールは設定に応じて動作が変わる:
- プレビューON（既定）: すぐには保存せず、保存内容の下書きと draft_token を返す。
  内容をユーザーに見せて確認を取り、OKなら confirm_knowledge に draft_token を渡して確定する。
- プレビューOFF: このツールの呼び出しだけで即保存する（confirm_knowledge は不要）。
どちらの場合も、生成AI名は created_by 相当としてサーバーが自動記録する。

## 「メモとクイズを両方作って」と言われたとき
このツールで学びを保存（プレビューONなら confirm_knowledge まで）し、確定で返る
knowledge の id を控える。続けて、その内容から選択式クイズを生成し save_quiz を呼ぶ。
その際 source_knowledge_id に控えた id を渡し、tags も引き継ぐ。`;

const shape = {
  question: z.string().min(1).describe("疑問・問い（抽象化済み）"),
  answer: z.string().min(1).describe("その回答・学び（抽象化済み）"),
  context: z
    .string()
    .optional()
    .describe("どんな作業・学習の中で出てきたか（抽象化済み。任意）"),
  source: z
    .string()
    .optional()
    .describe("情報源。例: 自分で調べた / AIに聞いた / 公式ドキュメント（任意）"),
  tags: z
    .array(z.string())
    .default([])
    .describe("タグ。半角英数の短い文字列の配列。既存タグは表記を使い回す"),
  abstraction_note: z
    .string()
    .optional()
    .describe(
      "元の何を何に置き換えて抽象化したかの短いメモ（1〜3行）。プレビューONなら必須。業務固有情報が無ければ「業務固有情報なし」",
    ),
};

function sensitiveError(hits: ReturnType<typeof scanSensitive>["hits"]): string {
  const lines = hits.map((h) => `- ${h.field}: ${h.kind}（"${h.match}"）`);
  return [
    "機密情報の可能性がある文字列が含まれているため保存を中止しました。",
    "以下を取り除くか一般化してから、もう一度 add_knowledge を呼んでください:",
    ...lines,
  ].join("\n");
}

export function registerAddKnowledge(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "add_knowledge",
    {
      title: "学びを保存",
      description: DESCRIPTION,
      inputSchema: shape,
    },
    async ({ question, answer, context, source, tags, abstraction_note }) => {
      const scan = scanSensitive({ question, answer, context, source });
      if (!scan.ok) {
        return {
          isError: true,
          content: [{ type: "text", text: sensitiveError(scan.hits) }],
        };
      }

      const normalizedTags = normalizeTags(tags ?? []);

      if (ctx.config.previewBeforeSave) {
        const token = putDraft({
          question,
          answer,
          context,
          source,
          tags: normalizedTags,
        });
        const note = abstraction_note?.trim();
        const preview = [
          "以下の内容で保存します。抽象化メモを確認し、問題なければ confirm_knowledge に draft_token を渡してください。",
          "",
          `Q: ${question}`,
          `A: ${answer}`,
          context ? `context: ${context}` : null,
          source ? `source: ${source}` : null,
          `tags: ${normalizedTags.join(", ") || "(なし)"}`,
          "",
          `抽象化メモ: ${note || "（未記入。業務由来の内容なら、何を伏せたか確認してください）"}`,
          "",
          `draft_token: ${token}`,
        ]
          .filter((l) => l !== null)
          .join("\n");
        return { content: [{ type: "text", text: preview }] };
      }

      const row = await insertKnowledge(ctx.supabase, {
        question,
        answer,
        context,
        source,
        tags: normalizedTags,
      });
      return {
        content: [
          {
            type: "text",
            text: `保存しました（id: ${row.id}）\ntags: ${normalizedTags.join(", ") || "(なし)"}`,
          },
        ],
      };
    },
  );
}
