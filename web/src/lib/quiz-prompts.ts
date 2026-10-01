import type { KnowledgeItem, QuizFixSource, QuizPublic } from "./types";

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

/** 問題文を一覧用に 1 行へ詰める（コードブロック等の改行も潰す）。 */
function oneLine(text: string, max = 120): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * タグの学びから、既存の問題と重ならない別角度の問題を追加で作ってもらう。
 * existingQuestions はそのタグの既存の問題文（重複回避のために同梱する）。
 */
export function tagQuizPrompt(tag: string, existingQuestions: string[]): string {
  return [
    `Naruhodo+ の list_knowledge を tags: ["${tag}"] で呼び、タグ「${tag}」の学びを取得してください。`,
    "取得した学びをもとに、下の既存の問題と重ならない別の角度の選択式クイズ（選択肢3〜5個・正解1つ）を 3 問作り、それぞれ save_quiz で保存してください。",
    "- 既存の問題と同じ問い方・同じ論点の言い換えは避け、別の観点（使いどころ・違い・誤用・理由など）から問うこと",
    "- source_knowledge_id には元にした学びの id を指定すること",
    "- tags は元の学びのものを引き継ぐこと",
    "- 固有名詞や社内文脈は持ち込まないこと",
    "すべて保存し終えたら、作った問題の要旨を教えてください。",
    "",
    `## 既存の問題（${existingQuestions.length} 件）`,
    ...(existingQuestions.length
      ? existingQuestions.map((q) => `- ${oneLine(q)}`)
      : ["(なし)"]),
  ].join("\n");
}

/**
 * 何度も正解している問題について、問い方・観点を変えた問題を 1 問作ってもらう。
 * 問題の形を覚えただけになっていないかを確かめる用。選択肢・正解は同梱しない。
 */
export function rephraseQuizPrompt(q: QuizPublic): string {
  return [
    "Naruhodo+ の次のクイズは何度も正解しているので、同じ学びについて問い方・観点を変えた新しい選択式クイズ（選択肢3〜5個・正解1つ）を 1 問作り、save_quiz で保存してください。",
    q.source_knowledge_id
      ? `- 元の学び（id: ${q.source_knowledge_id}）は list_knowledge を tags 指定で呼べば見つかります。source_knowledge_id にはこの id を指定すること`
      : "- 元の学びが分からない問題です。下の問題文から論点を読み取って作ってください",
    "- 元の問題の言い換えにとどめず、別の角度（逆向きに問う・具体例で問う・誤りを選ばせる など）から問うこと",
    `- tags は元の問題のもの（${q.tags.join(", ") || "なし"}）を引き継ぐこと`,
    "- 固有名詞や社内文脈は持ち込まないこと",
    "",
    "## 元の問題",
    q.question,
  ].join("\n");
}
