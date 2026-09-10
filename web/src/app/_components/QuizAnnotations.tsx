"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import type { QuizLink } from "../../lib/types";

/**
 * クイズの自由記入メモ / 参考リンクの編集。
 * star は QuizCard 側で常時編集できるのでここには置かない。
 * 回答結果ビューと /search 結果の展開部で共用する。
 */
export function QuizAnnotations({
  quizId,
  initialNote,
  initialLinks,
  initialHidden = false,
  onHiddenChange,
}: {
  quizId: string;
  initialNote: string | null;
  initialLinks?: QuizLink[];
  initialHidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const [links, setLinks] = useState<QuizLink[]>(initialLinks ?? []);
  const [url, setUrl] = useState("");
  const [hidden, setHidden] = useState(initialHidden);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const savedNote = useRef(initialNote ?? "");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // 内容に合わせて高さを自動調整（上限あり）
  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 400) + "px";
  }, [note]);

  async function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    try {
      await apiPost(`/api/quizzes/${quizId}`, { hidden: next }, "PATCH");
      onHiddenChange?.(next);
    } catch (e) {
      setHidden(!next);
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    if (!initialLinks) {
      apiGet<{ links: QuizLink[] }>(`/api/quizzes/${quizId}/links`)
        .then((r) => setLinks(r.links))
        .catch(() => {});
    }
  }, [quizId, initialLinks]);

  async function saveNoteIfChanged() {
    if (note === savedNote.current) return;
    try {
      await apiPost(`/api/quizzes/${quizId}`, { note }, "PATCH");
      savedNote.current = note;
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function addUrl() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiPost<{ link: QuizLink }>(
        `/api/quizzes/${quizId}/links`,
        { url: u },
      );
      setLinks((prev) => [...prev, r.link]);
      setUrl("");
      // タイトルは応答後に非同期取得されるので、少し待って取り直す
      for (const delay of [2500, 6000]) {
        setTimeout(() => {
          apiGet<{ links: QuizLink[] }>(`/api/quizzes/${quizId}/links`)
            .then((res) => setLinks(res.links))
            .catch(() => {});
        }, delay);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await apiPost(`/api/quizzes/${quizId}/links/${id}`, null, "DELETE");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="annot">
      <h4>メモ</h4>
      <textarea
        ref={noteRef}
        value={note}
        placeholder="調べたことや補足など"
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNoteIfChanged}
      />

      <h4 style={{ marginTop: 12 }}>参考リンク</h4>
      <ul className="links">
        {links.map((l) => (
          <li key={l.id}>
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.title ?? l.url}
            </a>
            {l.title_status === "pending" && (
              <span className="linktitle">（タイトル取得中…）</span>
            )}
            {l.title_status === "failed" && (
              <span className="linktitle">（タイトル取得できず）</span>
            )}
            <button className="del" onClick={() => removeLink(l.id)} aria-label="削除">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="addrow">
        <input
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
        />
        <button onClick={addUrl} disabled={busy || !url.trim()} aria-label="URLを追加">
          ＋
        </button>
      </div>

      <h4 style={{ marginTop: 12 }}>表示</h4>
      <button
        type="button"
        className={hidden ? "unhide-btn" : "hide-btn"}
        onClick={toggleHidden}
      >
        {hidden ? "非表示を解除する" : "この問題を非表示にする"}
      </button>
      {hidden && (
        <p className="hint">
          非表示の問題は一覧・検索・復習・集計から除外されます。
        </p>
      )}

      {err && <p className="error">{err}</p>}
    </div>
  );
}
