/** API レスポンスで使う共有型。DB スキーマは docs/requirements.md / supabase/migrations 参照。 */

export interface QuizChoice {
  id: string;
  type: "text" | "image" | "code";
  content: string;
  /** type === "code" のときのハイライト言語 */
  language?: string;
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
  last_answered_at: string | null;
  star: number;
  note: string | null;
  /** getQuizForAnswering / search の詳細取得時のみ含む */
  links?: QuizLink[];
}

export interface AttemptResult {
  is_correct: boolean;
  correct_answer: string;
  explanation: string | null;
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
