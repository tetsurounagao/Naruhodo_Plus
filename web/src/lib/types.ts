/** API レスポンスで使う共有型。DB スキーマは docs/requirements.md / supabase/migrations 参照。 */

export interface QuizChoice {
  id: string;
  type: "text" | "image" | "code";
  content: string;
  /** type === "code" のときのハイライト言語 */
  language?: string;
  /**
   * この選択肢がなぜ正解／不正解かの理由。DB の choices には入っているが、
   * 正解の推測に使えてしまうため解答前のレスポンス（QuizPublic）には含めない。
   */
  rationale?: string;
}

export interface QuizLink {
  id: string;
  url: string;
  title: string | null;
  title_status: "pending" | "ok" | "failed";
  created_at: string;
}

/** 一覧・解答画面向け。correct_answer / explanation は解答前は含めない。 */
export interface QuizPublic {
  id: string;
  question: string;
  choices: QuizChoice[];
  tags: string[];
  created_by: string | null;
  created_at: string;
  attempt_count: number;
  last_correct: boolean | null;
  /** 自信ありの連続正解回数（なるほど電球の明るさ・復習間隔の元） */
  correct_streak: number;
  last_answered_at: string | null;
  star: number;
  note: string | null;
  hidden: boolean;
  /** 「問題がおかしい」の指摘。null = 問題なし、文字列 = 要修正 */
  fix_note: string | null;
  /** 元にした学びの id。無ければ null（言い換え問題の依頼で使う。答えそのものは含まない） */
  source_knowledge_id: string | null;
  /** getQuizForAnswering / search の詳細取得時のみ含む */
  links?: QuizLink[];
}

export type HiddenFilter = "exclude" | "only" | "all";

/**
 * 修正依頼プロンプト用の問題全体（正解・解説を含む）。
 * 要修正（fix_note あり）の問題に限って、依頼ボタン押下時にだけ取得する。
 */
export interface QuizFixSource {
  id: string;
  question: string;
  choices: QuizChoice[];
  correct_answer: string;
  explanation: string | null;
  fix_note: string;
  tags: string[];
  source_knowledge_id: string | null;
}

/** クイズの元になった学び。解答後にだけ返す（答えのネタバレになるため）。 */
export interface SourceKnowledge {
  question: string;
  answer: string;
  context: string | null;
}

/** 解答時の自信度。unsure の正解は復習間隔の計算で連続正解に数えない。 */
export type Confidence = "sure" | "unsure";

export interface AttemptResult {
  is_correct: boolean;
  correct_answer: string;
  explanation: string | null;
  /** 元の学び。未指定・削除済みなら null */
  source_knowledge: SourceKnowledge | null;
  /** 選択肢 id → その選択肢の理由。理由が無い選択肢は含めない */
  rationales: Record<string, string>;
}

export type QuizStatusFilter = "all" | "unanswered" | "answered";
export type QuizSortKey =
  | "created_desc"
  | "created_asc"
  | "answered_desc"
  | "answered_asc";

/** 復習おすすめ 1 件（QuizPublic + 経過情報）。 */
export interface ReviewItem extends QuizPublic {
  /** 最終回答からの経過日数（切り捨て） */
  days_since: number;
  /** 経過日数 − 推奨間隔。大きいほど「やるべき」 */
  overdue_days: number;
}

export interface KnowledgeItem {
  id: string;
  question: string;
  answer: string;
  context: string | null;
  source: string | null;
  tags: string[];
  quiz_count: number;
  created_at: string;
}

export interface TagInfo {
  id: string;
  name: string;
  /** #RRGGBB。未設定は null */
  color: string | null;
  quiz_count: number;
}

export interface TagStat {
  tag_id: string;
  tag_name: string;
  /** そのタグが付いたクイズの数（出題比率の分子） */
  quiz_count: number;
  total_attempts: number;
  correct_attempts: number;
  accuracy: number | null;
  /** 閾値により要復習と判定されたか */
  weak: boolean;
}

/**
 * ホームの「灯った知識」（なるほど電球ボード）の 1 行。
 * 1 問は 1 行にだけ入る（そのクイズのタグのうち問題数が最も多いタグの行）。
 */
export interface MasteryGroup {
  /** "tag" = 実在のタグ / "other" = 表示しきれないタグをまとめた行 / "untagged" = タグなし */
  kind: "tag" | "other" | "untagged";
  /** 表示名。kind が "tag" ならタグ名、それ以外は「その他」「タグなし」 */
  label: string;
  /** kind === "other" のとき、まとめたタグの数 */
  tagCount?: number;
  /** その行の問題の明るさ（明るい順）。0 まだ / 1 ほんのり / 2 明るい / 3 身についた */
  levels: (0 | 1 | 2 | 3)[];
}

/** /api/home のレスポンス。 */
export interface HomeSummary {
  stats: TagStat[];
  unanswered: number;
  unquizzed: number;
  quizTotal: number;
  /** 復習期限が来ている問題数（一覧は /review。ホームは件数だけ使う） */
  dueCount: number;
  /** なるほど電球ボード（タグごとの行。問題数の多い順。「その他」「タグなし」は末尾） */
  mastery: MasteryGroup[];
  /** 点灯している（明るさ 1 以上の）問題数 */
  masteryLit: number;
  /** ボードに載っている問題数（非表示を除く全問題） */
  masteryTotal: number;
}
