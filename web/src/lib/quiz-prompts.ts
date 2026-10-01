import type { KnowledgeItem } from "./types";

/**
 * AI チャットに貼り付ける「クイズ化の依頼」プロンプト。
 * クイズ生成はアプリ内で行わず、ユーザーが普段使う AI に MCP 経由で作ってもらう方針。
 * 作り方の細かいルールは MCP の save_quiz の説明文にあるので、ここでは依頼内容だけ書く。
 */

/** 1 件の学びからクイズを 1 問作ってもらう。 */
export function singleQuizPrompt(k: KnowledgeItem): string {
  return [
    "次の「学び」から選択式クイズ（選択肢3〜5個・正解1つ）を1問作り、save_quiz で保存してください。",
    "固有名詞や社内文脈は持ち込まないこと。tags は元の学びのものを引き継ぐこと。",
    `source_knowledge_id: ${k.id}`,
    "",
    `Q: ${k.question}`,
    `A: ${k.answer}`,
    k.context ? `context: ${k.context}` : "",
    `tags: ${k.tags.join(", ") || "(なし)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 未出題の学びを AI 側で一括取得し、1 件につき 1 問ずつ作ってもらう。 */
export function batchQuizPrompt(): string {
  return [
    "Naruhodo+ の list_knowledge を unquizzed_only: true で呼び、まだクイズ化されていない学びを取得してください。",
    "取得した学び 1 件につき選択式クイズ（選択肢3〜5個・正解1つ）を 1 問ずつ作り、それぞれ save_quiz で保存してください。",
    "- source_knowledge_id には元の学びの id を必ず指定すること",
    "- tags は元の学びのものを引き継ぐこと",
    "- 固有名詞や社内文脈は持ち込まないこと",
    "すべて保存し終えたら、保存した件数を教えてください。",
  ].join("\n");
}
