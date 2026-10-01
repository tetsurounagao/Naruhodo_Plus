import { MASTERY_LABELS, masteryOf, nextStreak, type Mastery } from "../../lib/mastery";
import { recommendedIntervalDays } from "../../lib/review-schedule";
import type { Confidence } from "../../lib/types";
import { Bulb } from "./Bulb";

export interface BulbChangeInfo {
  /** 解答前の段階 */
  from: Mastery;
  /** 解答後の段階 */
  to: Mastery;
  /** 解答後の連続正解回数 */
  streak: number;
  /** 次の復習までの日数 */
  days: number;
}

/** 1 回の解答で なるほど電球 がどう変わるか（純関数。DB は見ない）。 */
export function bulbChangeOf(
  prevStreak: number,
  isCorrect: boolean,
  confidence: Confidence,
): BulbChangeInfo {
  const streak = nextStreak(prevStreak, isCorrect, confidence);
  return {
    from: masteryOf(prevStreak),
    to: masteryOf(streak),
    streak,
    days: recommendedIntervalDays(streak),
  };
}

/**
 * 解答後の「電球の変化」と次の復習日数。
 * 明るくなった: 前 → 新（ピカッ）「電球が明るくなった（次は 7 日後）」
 * 暗くなった:   前 → 新「電球が暗くなった（次は 1 日後）」
 * 変化なし:     新「ほんのり（次は 3 日後）」
 */
export function BulbChange({
  prevStreak,
  isCorrect,
  confidence,
  size = 20,
}: {
  prevStreak: number;
  isCorrect: boolean;
  confidence: Confidence;
  size?: number;
}) {
  const c = bulbChangeOf(prevStreak, isCorrect, confidence);
  const dir = c.to > c.from ? "up" : c.to < c.from ? "down" : "same";
  const text =
    dir === "up" ? "電球が明るくなった" : dir === "down" ? "電球が暗くなった" : MASTERY_LABELS[c.to];
  return (
    <span className={`bulb-change ${dir}`}>
      {dir !== "same" && (
        <>
          <Bulb level={c.from} size={size} title={`前のなるほど度: ${MASTERY_LABELS[c.from]}`} />
          <span className="bulb-change-arrow" aria-hidden="true">
            →
          </span>
        </>
      )}
      <Bulb
        level={c.to}
        size={size}
        brightened={dir === "up"}
        title={`なるほど度: ${MASTERY_LABELS[c.to]}`}
      />
      <span className="bulb-change-text">
        {text}
        <span className="bulb-change-days">（次は {c.days} 日後）</span>
      </span>
    </span>
  );
}
