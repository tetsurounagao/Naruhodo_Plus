"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "../../lib/client";
import { Markdown } from "./Markdown";

// 「用語解説が使えるか」はセッション内で 1 回だけ問い合わせる
let availableCache: boolean | null = null;

interface Result {
  term: string;
  text: string;
  cached: boolean;
}

/**
 * 子要素内のテキスト選択に「調べる」ボタンを出し、Groq の用語解説を表示する。
 * showInput=true でモバイル向けの手入力欄も併設。
 * GROQ_API_KEY 未設定なら何も出さない。
 */
export function ExplainPopover({
  children,
  onAddToNote,
  showInput = false,
}: {
  children: ReactNode;
  onAddToNote?: (snippet: string) => void | Promise<void>;
  showInput?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(availableCache ?? false);
  const [fab, setFab] = useState<{ x: number; y: number; term: string; context: string } | null>(
    null,
  );
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (availableCache !== null) return;
    apiGet<{ available: boolean }>("/api/explain")
      .then((d) => {
        availableCache = d.available;
        setAvailable(d.available);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!available) return;
    function onSelect() {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || sel.rangeCount === 0 || !text || text.length > 120) {
        setFab(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      if (!boxRef.current?.contains(node)) {
        setFab(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const el = (node.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
      const context = (el?.textContent ?? "").trim().slice(0, 400);
      setFab({ x: rect.left + rect.width / 2, y: rect.top, term: text, context });
    }
    document.addEventListener("mouseup", onSelect);
    document.addEventListener("touchend", onSelect);
    return () => {
      document.removeEventListener("mouseup", onSelect);
      document.removeEventListener("touchend", onSelect);
    };
  }, [available]);

  async function run(term: string, context?: string) {
    setBusy(true);
    setErr(null);
    setResult(null);
    setAdded(false);
    setFab(null);
    try {
      const r = await apiPost<{ text: string; cached: boolean }>("/api/explain", {
        term,
        context,
      });
      setResult({ term, text: r.text, cached: r.cached });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!available) return <>{children}</>;

  return (
    <div ref={boxRef} className="explainable">
      {children}

      {fab && (
        <button
          className="explain-fab"
          style={{ left: fab.x, top: fab.y - 8 }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(fab.term, fab.context)}
        >
          調べる
        </button>
      )}

      {showInput && (
        <form
          className="explain-inputrow"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) run(manual.trim());
          }}
        >
          <input
            type="text"
            placeholder="気になった語句を調べる"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button type="submit" disabled={busy || !manual.trim()}>
            {busy ? "…" : "調べる"}
          </button>
        </form>
      )}

      {busy && !result && <p className="muted">調べています…</p>}

      {(result || err) && (
        <div className="explain-card">
          {err ? (
            <p className="error" style={{ margin: 0 }}>
              {err}
            </p>
          ) : (
            <>
              <p style={{ fontWeight: 600, margin: 0 }}>{result!.term}</p>
              <div style={{ margin: "6px 0" }}>
                <Markdown>{result!.text}</Markdown>
              </div>
              <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 8px" }}>
                AI の下書きです。必ず一次情報で確認してください。
                {result!.cached ? "（キャッシュ）" : ""}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {onAddToNote && (
                  <button
                    onClick={async () => {
                      await onAddToNote(`**${result!.term}**: ${result!.text}`);
                      setAdded(true);
                    }}
                    disabled={added}
                  >
                    {added ? "追記しました" : "メモに追記"}
                  </button>
                )}
                <button onClick={() => setResult(null)}>閉じる</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
