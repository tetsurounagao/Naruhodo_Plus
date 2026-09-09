/** API レスポンスで使う共有型。DB スキーマは docs/requirements.md / supabase/migrations 参照。 */

export interface QuizChoice {
  id: string;
  type: "text" | "image" | "code";
  content: string;
  /** type === "code" のときのハイライト言語 */
  language?: string;
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
}

export interface AttemptResult {
  is_correct: boolean;
  correct_answer: string;
  explanation: string | null;
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
  total_attempts: number;
  correct_attempts: number;
  accuracy: number | null;
  /** 閾値により要復習と判定されたか */
  weak: boolean;
}
