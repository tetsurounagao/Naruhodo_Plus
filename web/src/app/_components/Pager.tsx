"use client";

/**
 * クライアント側ページネーション。取得済みリストの表示範囲だけを切り替える。
 * ページ番号は 1 始まり。
 */
export const PAGE_SIZE = 10;

/** 省略記号を含むページ番号列を作る（例: 1 … 4 5 6 … 20）。 */
function pageList(current: number, last: number): (number | "…")[] {
  if (last <= 7) {
    return Array.from({ length: last }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(last - 1, current + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < last - 1) out.push("…");
  out.push(last);
  return out;
}

export function Pager({
  page,
  total,
  pageSize = PAGE_SIZE,
  onPage,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPage: (next: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const go = (n: number) => onPage(Math.min(Math.max(1, n), last));

  return (
    <nav className="pager" aria-label="ページ送り">
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1}>
        前へ
      </button>
      {pageList(page, last).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="gap">
            …
          </span>
        ) : (
          <button
            type="button"
            key={p}
            className={p === page ? "on" : undefined}
            aria-current={p === page ? "page" : undefined}
            onClick={() => go(p)}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" onClick={() => go(page + 1)} disabled={page >= last}>
        次へ
      </button>
    </nav>
  );
}
