/**
 * クイズの保存前チェック — 差し替え可能な独立ユニット。
 *
 * 作問の質を AI（モデル）の良し悪しに任せきりにしないため、ルールで判定できる
 * 「悪問のパターン」を保存直前に機械的に調べる。AI 呼び出しは行わない。
 * 引っかかったら保存せず、指摘と直し方を AI に返して出し直してもらう。
 *
 * 閾値は実データ（134 問）で、明らかな悪問だけを止め、作り直しの手間が
 * 増えすぎない値にしている（#77）。将来ここを「ローカル AI による意味のチェック」
 * 付きに差し替えられるよう、呼び出し側は lintQuiz() だけを使う。
 */

export interface LintChoice {
  id: string;
  type: "text" | "image" | "code";
  content: string;
  language?: string;
  rationale: string;
}

export interface LintIssue {
  /** 検出ルールの種類 */
  rule: "duplicate_choice" | "multiple_blanks" | "length_cue";
  /** AI に返す指摘。何が問題で、どう直せばよいかまで書く */
  message: string;
}

export interface LintResult {
  ok: boolean;
  issues: LintIssue[];
  /** 自動で補えるもの（コードの言語など）を補った選択肢。ok のときはこれを保存する */
  choices: LintChoice[];
}

/** 正解だけが長すぎると判定する倍率（正解の長さ ≥ 他の最長 × この値） */
const LENGTH_CUE_RATIO = 2;
/** これより短い正解は長さの偏りを見ない（"null" と "0" のような短い答えを誤検知しないため） */
const LENGTH_CUE_MIN_CHARS = 20;

/** 空白を除いた文字数（全角も 1 文字） */
function charCount(s: string): number {
  return [...s.replace(/\s+/g, "")].length;
}

/**
 * 重複判定用の正規化。
 * コードは書いたとおりに比べる（空白の違いだけ無視。`greet` と `greet()`、`"greet"` は別物）。
 * 文字は大文字小文字・空白・句読点の違いだけ同じとみなす。
 */
function normalize(c: LintChoice): string {
  if (c.type === "code") return c.content.replace(/\s+/g, " ").trim();
  return c.content.toLowerCase().replace(/[\s、。,.]/g, "");
}

/** 問題文の最初のコードフェンスの言語（```ts → "ts"）。無ければ undefined */
function fenceLanguage(question: string): string | undefined {
  const m = question.match(/```([A-Za-z0-9_+#-]+)/);
  return m?.[1];
}

export function lintQuiz(input: {
  question: string;
  choices: LintChoice[];
  correctAnswer: string;
}): LintResult {
  const issues: LintIssue[] = [];

  // 自動補完: コードの選択肢で言語が無ければ、問題文のコードの言語を使う
  const lang = fenceLanguage(input.question);
  const choices = input.choices.map((c) =>
    c.type === "code" && !c.language && lang ? { ...c, language: lang } : c,
  );

  // 1. 選択肢の中身の重複
  const seen = new Map<string, string>();
  for (const c of choices) {
    const key = `${c.type}:${normalize(c)}`;
    const first = seen.get(key);
    if (first) {
      issues.push({
        rule: "duplicate_choice",
        message: `選択肢 ${first} と ${c.id} の中身が同じです。どちらかを別の誤答（よくある勘違い）に差し替えてください。`,
      });
    } else {
      seen.set(key, c.id);
    }
  }

  // 2. 穴埋めの空所は 1 問につき 1 か所
  const blanks = (input.question.match(/_{4,}/g) ?? []).length;
  if (blanks >= 2) {
    issues.push({
      rule: "multiple_blanks",
      message: `穴埋めの空所（____）が ${blanks} か所あります。1 問につき 1 か所にしてください（複数を問いたいときは問題を分ける）。`,
    });
  }

  // 3. 正解だけが極端に長い（長さで正解が分かってしまう）。文字の選択肢だけを見る
  if (choices.every((c) => c.type === "text")) {
    const correct = choices.find((c) => c.id === input.correctAnswer);
    const others = choices.filter((c) => c.id !== input.correctAnswer).map((c) => charCount(c.content));
    if (correct && others.length > 0) {
      const len = charCount(correct.content);
      const maxOther = Math.max(...others);
      if (len >= LENGTH_CUE_MIN_CHARS && len >= maxOther * LENGTH_CUE_RATIO) {
        issues.push({
          rule: "length_cue",
          message:
            `正解（${correct.id}: ${len} 文字）だけが、ほかの選択肢（最長 ${maxOther} 文字）の ${LENGTH_CUE_RATIO} 倍以上の長さで、` +
            `長さだけで正解が分かってしまいます。誤答も正解と同じくらい具体的に書く（よくある勘違いを、正解と同じ粒度で）か、正解を簡潔にしてください。`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues, choices };
}
