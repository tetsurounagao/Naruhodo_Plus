"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "../../lib/client";
import { Markdown } from "./Markdown";

// 「用語解説が使えるか」はセッション内で 1 回だけ問い合わせる
let availableCache: boolean | null = null;

interface Result {
  term: string;
  text: string;
  sites: string[];
  query: string | null;
  cached: boolean;
  added: boolean;
}

function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
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
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    setFab(null);
    try {
      const r = await apiPost<{
        text: string;
        sites: string[];
        query: string | null;
        cached: boolean;
      }>("/api/explain", { term, context });
      setResults((prev) => [
        ...prev,
        { term, text: r.text, sites: r.sites, query: r.query, cached: r.cached, added: false },
      ]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function closeResult(i: number) {
    setResults((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function addToNote(i: number) {
    const r = results[i];
    if (!onAddToNote) return;
    await onAddToNote(`**${r.term}**: ${r.text}`);
    setResults((prev) => prev.map((x, idx) => (idx === i ? { ...x, added: true } : x)));
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

      {busy && <p className="muted">調べています…</p>}

      {err && (
        <div className="explain-card">
          <p className="error" style={{ margin: 0 }}>
            {err}
          </p>
        </div>
      )}

      {results.map((r, i) => (
        <div className="explain-card" key={i}>
          <p style={{ fontWeight: 600, margin: 0 }}>{r.term}</p>
          <div style={{ margin: "6px 0" }}>
            <Markdown>{r.text}</Markdown>
          </div>
          {(r.sites.length > 0 || r.query) && (
            <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 8px" }}>
              確認の手がかり:
              {r.sites.length > 0 && ` ${r.sites.join(" / ")}`}
              {r.query && (
                <>
                  {" "}
                  <a href={googleSearchUrl(r.query)} target="_blank" rel="noreferrer">
                    「{r.query}」で検索
                  </a>
                </>
              )}
            </p>
          )}
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 8px" }}>
            AI の下書きです。必ず一次情報で確認してください。
            {r.cached ? "（キャッシュ）" : ""}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {onAddToNote && (
              <button onClick={() => addToNote(i)} disabled={r.added}>
                {r.added ? "追記しました" : "メモに追記"}
              </button>
            )}
            <button onClick={() => closeResult(i)}>閉じる</button>
          </div>
        </div>
      ))}
    </div>
  );
}
