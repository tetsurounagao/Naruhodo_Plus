"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import { normalizeTag } from "../../lib/normalize-tags";
import { textOn } from "./Tag";
import { useTagColors } from "../../lib/tag-colors";

/**
 * クイズのタグを手動で追加・削除する。
 * - 現在のタグをチップ表示（× で削除）
 * - 既存タグの検索補完 + 新規作成
 * - 直近5日に生成されたクイズで使用が多いタグを提案
 * サーバー側（PUT /api/quizzes/:id/tags）が正規化と CRUD を担当する。
 */
export function TagEditor({
  quizId,
  initialTags,
  onChange,
}: {
  quizId: string;
  initialTags: string[];
  onChange?: (tags: string[]) => void;
}) {
  const { colorOf } = useTagColors();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saved = useRef<string[]>(initialTags);

  useEffect(() => {
    apiGet<{ tags: { name: string }[] }>("/api/tags")
      .then((r) => setAllTags(r.tags.map((t) => t.name)))
      .catch(() => {});
    apiGet<{ tags: { name: string }[] }>("/api/tags/recent")
      .then((r) => setRecent(r.tags.map((t) => t.name)))
      .catch(() => {});
  }, []);

  async function commit(next: string[]) {
    const prev = saved.current;
    setTags(next);
    setBusy(true);
    setErr(null);
    try {
      const r = await apiPost<{ tags: string[] }>(
        `/api/quizzes/${quizId}/tags`,
        { tags: next },
        "PUT",
      );
      saved.current = r.tags;
      setTags(r.tags);
      onChange?.(r.tags);
    } catch (e) {
      setTags(prev);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addTag(raw: string) {
    const n = normalizeTag(raw);
    if (!n || tags.includes(n)) {
      setInput("");
      return;
    }
    commit([...tags, n]);
    setInput("");
  }

  function removeTag(name: string) {
    commit(tags.filter((t) => t !== name));
  }

  const normInput = normalizeTag(input);
  const suggestions = useMemo(() => {
    if (!normInput) return [];
    return allTags
      .filter((t) => t.includes(normInput) && !tags.includes(t))
      .slice(0, 8);
  }, [allTags, tags, normInput]);
  const isNew = normInput.length > 0 && !allTags.includes(normInput);

  const recentSuggestions = recent.filter((t) => !tags.includes(t)).slice(0, 8);

  const chipStyle = (name: string) => {
    const c = colorOf(name);
    return c ? { background: c, color: textOn(c) } : undefined;
  };

  return (
    <div className="tageditor">
      <div className="chips">
        {tags.length === 0 && <span className="muted">タグなし</span>}
        {tags.map((t) => (
          <span key={t} className="tag" style={chipStyle(t)}>
            {t}
            <button
              type="button"
              className="x"
              onClick={() => removeTag(t)}
              disabled={busy}
              aria-label={`${t} を外す`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="addrow">
        <input
          type="text"
          value={input}
          placeholder="タグを検索 / 新規追加"
          list="tageditor-all"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(input);
            }
          }}
        />
        <button
          type="button"
          onClick={() => addTag(input)}
          disabled={busy || !normInput || tags.includes(normInput)}
        >
          {isNew ? "＋新規作成" : "追加"}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="picks">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              className="pick"
              onClick={() => addTag(t)}
              disabled={busy}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {recentSuggestions.length > 0 && (
        <div className="recent">
          <span className="muted">最近よく使うタグ:</span>
          {recentSuggestions.map((t) => (
            <button
              key={t}
              type="button"
              className="pick"
              onClick={() => addTag(t)}
              disabled={busy}
            >
              ＋{t}
            </button>
          ))}
        </div>
      )}

      {err && <p className="error">{err}</p>}

      <datalist id="tageditor-all">
        {allTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
