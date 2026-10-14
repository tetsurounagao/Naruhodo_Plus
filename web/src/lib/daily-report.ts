import { scoreTurn } from "./quiz-score";
import type { AttemptConfidence } from "./types";

/**
 * Slack に送る「今日の成果」（#95）— 差し替え可能な独立ユニット（純関数のみ。DB は見ない）。
 * 日の区切りは日本時間（cron はサーバーで動くので、ブラウザの tz は使えない）。
 */

/** 日本時間の UTC からのずれ（ミリ秒） */
const JST_MS = 9 * 3_600_000;

/** 日本時間の日付キー（YYYY-MM-DD）。 */
export function jstDateKey(at: Date | string): string {
  return new Date(new Date(at).getTime() + JST_MS).toISOString().slice(0, 10);
}

/** その時刻を含む日本時間の 1 日（[from, to)）。 */
export function jstDayRange(now: Date): { key: string; from: string; to: string } {
  const key = jstDateKey(now);
  const from = new Date(Date.parse(`${key}T00:00:00Z`) - JST_MS);
  return { key, from: from.toISOString(), to: new Date(from.getTime() + 86_400_000).toISOString() };
}

/** today から 1 日ずつさかのぼって、解答のある日が何日続いているか。 */
export function streakUntil(days: Set<string>, today: string): number {
  let n = 0;
  let cur = Date.parse(`${today}T00:00:00Z`);
  while (days.has(new Date(cur).toISOString().slice(0, 10))) {
    n += 1;
    cur -= 86_400_000;
  }
  return n;
}

export interface DayAttempt {
  is_correct: boolean;
  confidence: AttemptConfidence | null;
}

/** 解答を古い順に流したときの最長コンボ（/play と同じ数え方。後から「簡単」にしたものは自信ありの扱い）。 */
export function longestCombo(attempts: DayAttempt[]): number {
  let combo = 0;
  let best = 0;
  for (const a of attempts) {
    combo = scoreTurn(a.is_correct, a.confidence === "unsure" ? "unsure" : "sure", combo).combo;
    best = Math.max(best, combo);
  }
  return best;
}

export interface DailyReport {
  /** YYYY-MM-DD（日本時間） */
  date: string;
  answered: number;
  correct: number;
  sureCorrect: number;
  points: number;
  combo: number;
  streak: number;
  newKnowledge: number;
  /** 今日追加した知識に付いたタグ（多い順） */
  newTags: string[];
  newQuizzes: number;
  weakTags: { name: string; accuracy: number }[];
  tree: { level: number; toNext: number; maxed: boolean; balance: number };
  /** アプリの URL（リンク用。無ければ載せない） */
  appUrl?: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Slack に送る本文にする。plain = false なら mrkdwn（太字・リンク記法）。
 * ワークフロービルダーの Webhook は変数に入れた記法をそのまま表示することがあるので、plain = true で記号を使わない。
 */
export function formatReport(r: DailyReport, plain = false): string {
  const [, m, d] = r.date.split("-").map(Number);
  const b = (s: string) => (plain ? s : `*${s}*`);
  const lines = [b(`📚 なるほど+ 今日の成果（${m}/${d}）`)];
  const rate = r.answered > 0 ? r.correct / r.answered : 0;
  lines.push(`解いた問題: ${b(`${r.answered} 問`)}　正答率 ${pct(rate)}（自信ありで正解 ${r.sureCorrect}）`);
  lines.push(`獲得ポイント: ${b(`+${r.points.toLocaleString()} pt`)}　最長コンボ ${r.combo}${r.combo >= 10 ? " 🎰" : ""}`);
  if (r.streak >= 2) lines.push(`連続学習: 🔥 ${r.streak} 日`);
  if (r.newKnowledge > 0) {
    const tags = r.newTags.slice(0, 5).map((t) => `#${t}`).join(" ");
    lines.push(`新しく追加した知識: ${r.newKnowledge} 件${tags ? `（${tags}）` : ""}`);
  }
  if (r.newQuizzes > 0) lines.push(`新しいクイズ: ${r.newQuizzes} 問`);
  if (r.weakTags.length > 0)
    lines.push(`要復習タグ: ${r.weakTags.map((t) => `#${t.name}（${pct(t.accuracy)}）`).join(" ")}`);
  lines.push(
    (r.tree.maxed
      ? `神殿の木: Lv 99 🌳 MAX`
      : `神殿の木: Lv ${r.tree.level}（次まで ${r.tree.toNext.toLocaleString()} pt）`) +
      `　所持 ${r.tree.balance.toLocaleString()} pt`,
  );
  if (r.appUrl) lines.push(plain ? r.appUrl : `<${r.appUrl}|アプリを開く>`);
  return lines.join("\n");
}
