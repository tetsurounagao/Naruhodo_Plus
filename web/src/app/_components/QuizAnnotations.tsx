"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import type { QuizFixSource, QuizLink } from "../../lib/types";
import { fixQuizPrompt } from "../../lib/quiz-prompts";
import { TagEditor } from "./TagEditor";
import { CopyPromptButton } from "./CopyPromptButton";

/**
 * クイズの自由記入メモ / タグ / 参考リンク / 「問題がおかしい」フラグの編集。
 * star は QuizCard 側で常時編集できるのでここには置かない。
 * 回答結果ビューと /search 結果の展開部で共用する。
 */
export function QuizAnnotations({
  quizId,
  initialNote,
  initialLinks,
  initialTags,
  onTagsChange,
  initialHidden = false,
  onHiddenChange,
  initialFixNote = null,
  onFixNoteChange,
}: {
  quizId: string;
  initialNote: string | null;
  initialLinks?: QuizLink[];
  initialTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  initialHidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
  initialFixNote?: string | null;
  onFixNoteChange?: (fixNote: string | null) => void;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const [links, setLinks] = useState<QuizLink[]>(initialLinks ?? []);
  const [url, setUrl] = useState("");
  const [hidden, setHidden] = useState(initialHidden);
  const [fixNote, setFixNote] = useState<string | null>(initialFixNote);
  // null = 入力欄を閉じている。文字列 = 「問題がおかしい」の理由を入力中
  const [fixDraft, setFixDraft] = useState<string | null>(null);
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

  /** fix_note を保存（文字列）または解除（null）する。 */
  async function saveFixNote(next: string | null) {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiPost<{ fix_note: string | null }>(
        `/api/quizzes/${quizId}`,
        { fix_note: next },
        "PATCH",
      );
      setFixNote(r.fix_note);
      setFixDraft(null);
      onFixNoteChange?.(r.fix_note);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** 修正依頼プロンプト。正解・解説を含むので押下時にだけ専用 API から取る。 */
  async function buildFixPrompt(): Promise<string> {
    const r = await apiGet<{ quiz: QuizFixSource }>(
      `/api/quizzes/${quizId}/fix-request`,
    );
    return fixQuizPrompt(r.quiz);
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

      <h4 style={{ marginTop: 12 }}>タグ</h4>
      <TagEditor
        quizId={quizId}
        initialTags={initialTags ?? []}
        onChange={onTagsChange}
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

      <h4 style={{ marginTop: 12 }}>問題の不備</h4>
      {fixNote !== null ? (
        <div className="fixnote">
          <p className="fixnote-body">
            <span className="fix-badge">要修正</span> {fixNote}
          </p>
          <div className="fixnote-actions">
            <CopyPromptButton text={buildFixPrompt} label="修正を依頼（プロンプトをコピー）" />
            <button type="button" onClick={() => saveFixNote(null)} disabled={busy}>
              解除
            </button>
          </div>
          <p className="hint">
            AI に貼り付けると、直した問題が新しく保存され、この問題は自動で非表示になります。
          </p>
        </div>
      ) : fixDraft !== null ? (
        <div className="fixnote">
          <textarea
            value={fixDraft}
            placeholder="どこがおかしいか（正解が違う・選択肢が曖昧 など）"
            onChange={(e) => setFixDraft(e.target.value)}
            autoFocus
          />
          <div className="fixnote-actions">
            <button
              type="button"
              className="primary"
              onClick={() => saveFixNote(fixDraft)}
              disabled={busy}
            >
              保存
            </button>
            <button type="button" onClick={() => setFixDraft(null)} disabled={busy}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="flag-btn" onClick={() => setFixDraft("")}>
          問題がおかしい
        </button>
      )}

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
