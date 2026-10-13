"use client";

import { SITE_STYLES, setSiteStyle, useSiteStyle } from "../../lib/site-style";

/** ヘッダーのスタイル切り替え（#91）。いつもの / プレステ の 2 択。 */
export function StyleToggle() {
  const current = useSiteStyle();
  return (
    <div className="style-toggle" role="group" aria-label="スタイル">
      {SITE_STYLES.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-pressed={current === s.id}
          onClick={() => setSiteStyle(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
