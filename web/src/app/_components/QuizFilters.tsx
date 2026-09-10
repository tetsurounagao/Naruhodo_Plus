"use client";

import type { QuizSortKey, QuizStatusFilter } from "../../lib/types";

export interface FilterState {
  status: QuizStatusFilter;
  sort: QuizSortKey;
  minStar: number;
  /** true で非表示のクイズのみ表示（解除用） */
  hiddenOnly: boolean;
}

const STATUS_LABELS: [QuizStatusFilter, string][] = [
  ["all", "すべて"],
  ["unanswered", "未回答のみ"],
  ["answered", "回答済みのみ"],
];

const SORT_LABELS: [QuizSortKey, string][] = [
  ["created_desc", "生成が新しい順"],
  ["created_asc", "生成が古い順"],
  ["answered_desc", "最終回答が新しい順"],
  ["answered_asc", "最終回答が古い順"],
];

export function QuizFilters({
  value,
  onChange,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  return (
    <div className="filters">
      <label>
        状態
        <select
          value={value.status}
          onChange={(e) =>
            onChange({ ...value, status: e.target.value as QuizStatusFilter })
          }
        >
          {STATUS_LABELS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        並べ替え
        <select
          value={value.sort}
          onChange={(e) =>
            onChange({ ...value, sort: e.target.value as QuizSortKey })
          }
        >
          {SORT_LABELS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        重要度
        <select
          value={value.minStar}
          onChange={(e) =>
            onChange({ ...value, minStar: Number(e.target.value) })
          }
        >
          <option value={0}>指定なし</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              ★{n} 以上
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.hiddenOnly}
          onChange={(e) =>
            onChange({ ...value, hiddenOnly: e.target.checked })
          }
        />
        非表示のみ
      </label>
    </div>
  );
}
