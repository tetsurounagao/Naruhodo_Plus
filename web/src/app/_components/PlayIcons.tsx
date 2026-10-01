/**
 * 解答 UI で使う小さなアイコン（線画の SVG）。色は CSS（currentColor / play.css のクラス）で決める。
 * どれも飾りなので aria-hidden。意味はボタンの aria-label や隣の文字で伝える。
 */

/** やめる（×） */
export function CloseIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** 設定（つまみ 2 本） */
export function SlidersIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

/** 炎（コンボ・連続日数）。塗りと線の色は .flame-icon（play.css）で指定する。 */
export function FlameIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="flame-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.4 2.2-4.3.2 1.8 1.1 2.8 2.3 3.1C11 9 10.6 6 12 3z" />
    </svg>
  );
}
