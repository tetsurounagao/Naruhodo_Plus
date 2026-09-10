"use client";

/** 0〜5 の star。onChange を渡すと編集可能（同じ数字を再クリックで 0 に戻す）。 */
export function Stars({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const editable = typeof onChange === "function";
  return (
    <span className="stars" aria-label={`重要度 ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={"star" + (n <= value ? " on" : "")}
          style={{ fontSize: size }}
          disabled={!editable}
          onClick={() => onChange?.(n === value ? 0 : n)}
          aria-label={`${n}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
