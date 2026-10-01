"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import type { QuizPublic, TagInfo } from "../../lib/types";
import { updateTagColorLocal } from "../../lib/tag-colors";
import { tagQuizPrompt } from "../../lib/quiz-prompts";
import { textOn } from "../_components/Tag";
import { CopyPromptButton } from "../_components/CopyPromptButton";

const PRESETS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
  "#6b6b66",
];

export default function TagsPage() {
  const [tags, setTags] = useState<TagInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ tags: TagInfo[] }>("/api/tags")
      .then((r) => setTags(r.tags))
      .catch((e: Error) => setError(e.message));
  }, []);

  /** 追加問題の依頼プロンプト。既存の問題文は押下時に取得して同梱する。 */
  async function buildTagPrompt(name: string): Promise<string> {
    const p = new URLSearchParams({ tags: name, status: "all", limit: "500" });
    const r = await apiGet<{ quizzes: QuizPublic[] }>(`/api/quizzes?${p}`);
    return tagQuizPrompt(
      name,
      r.quizzes.map((q) => q.question),
    );
  }

  async function save(t: TagInfo, color: string | null) {
    setTags((prev) =>
      prev ? prev.map((x) => (x.id === t.id ? { ...x, color } : x)) : prev,
    );
    updateTagColorLocal(t.name, color);
    try {
      await apiPost(`/api/tags/${t.id}`, { color }, "PATCH");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h1>タグ</h1>
      <p className="muted">
        色を設定すると、クイズカード・ホームの一覧・円グラフなど全ての表示に反映されます。
        タグ名クリックでそのタグの検索に飛べます。
        「追加問題を依頼」は、既存の問題と重ならない別角度の問題を AI に作ってもらうプロンプトをコピーします。
      </p>
      {error && <p className="error">{error}</p>}

      {tags === null ? (
        <p className="muted">読み込み中…</p>
      ) : tags.length === 0 ? (
        <p className="muted">タグがありません。</p>
      ) : (
        <div className="card">
          <ul className="taglist">
            {tags.map((t) => (
              <li key={t.id}>
                <span
                  className="tag"
                  style={
                    t.color
                      ? { background: t.color, color: textOn(t.color) }
                      : undefined
                  }
                >
                  {t.name}
                </span>
                <span className="muted count">{t.quiz_count}問</span>
                <span className="swatches">
                  {PRESETS.map((c) => (
                    <button
                      key={c}
                      className="sw-btn"
                      style={{ background: c }}
                      aria-label={c}
                      onClick={() => save(t, c)}
                    />
                  ))}
                </span>
                <input
                  type="color"
                  value={t.color ?? "#888888"}
                  onChange={(e) => save(t, e.target.value)}
                  aria-label={`${t.name} の色`}
                />
                {t.color && (
                  <button className="clear" onClick={() => save(t, null)}>
                    クリア
                  </button>
                )}
                <span className="tag-prompt">
                  <CopyPromptButton
                    text={() => buildTagPrompt(t.name)}
                    label="追加問題を依頼（プロンプトをコピー）"
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
