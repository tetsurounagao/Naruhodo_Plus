import type { KnowledgeItem, QuizFixSource } from "./types";

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

/**
 * 「問題がおかしい」と指摘された問題を直してもらう。
 * 直した問題は新規保存し、replaces_quiz_id で元の問題を差し替える（元は自動で非表示）。
 */
export function fixQuizPrompt(q: QuizFixSource): string {
  const choices = q.choices.map((c) => {
    const lang = c.type === "code" && c.language ? ` (${c.language})` : "";
    return `- ${c.id} [${c.type}${lang}]: ${c.content}`;
  });
  return [
    "Naruhodo+ の次のクイズに「問題がおかしい」と指摘がありました。",
    "指摘を踏まえて直した問題を作り、save_quiz で保存してください。",
    `- replaces_quiz_id に元の問題の id（${q.id}）を指定すること（元の問題は自動で非表示になります）`,
    "- tags は元の問題のものを引き継ぐこと",
    ...(q.source_knowledge_id
      ? [`- source_knowledge_id には ${q.source_knowledge_id} を指定すること`]
      : []),
    "- 指摘が当たらない（元の問題が正しい）と判断した場合は保存せず、その理由を教えてください",
    "",
    "## 指摘",
    q.fix_note,
    "",
    `## 元の問題（id: ${q.id}）`,
    q.question,
    "",
    "選択肢:",
    ...choices,
    `正解: ${q.correct_answer}`,
    `解説: ${q.explanation ?? "(なし)"}`,
    `tags: ${q.tags.join(", ") || "(なし)"}`,
  ].join("\n");
}
