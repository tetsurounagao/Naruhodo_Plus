"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import type { KnowledgeItem } from "../../lib/types";
import { Markdown } from "../_components/Markdown";
import { Tag } from "../_components/Tag";
import { Pager, PAGE_SIZE } from "../_components/Pager";
import { CopyPromptButton } from "../_components/CopyPromptButton";
import { batchQuizPrompt, singleQuizPrompt } from "../../lib/quiz-prompts";

type Mode = "unquizzed" | "all";

/** 空白区切りの全語を含むものだけ残す（質問・回答・context・タグが対象）。 */
function matches(k: KnowledgeItem, query: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [k.question, k.answer, k.context ?? "", ...k.tags].join("\n").toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export default function KnowledgePage() {
  const [mode, setMode] = useState<Mode>("unquizzed");
  const [items, setItems] = useState<KnowledgeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    setPage(1);
    apiGet<{ knowledge: KnowledgeItem[] }>(
      `/api/knowledge?unquizzed=${mode === "unquizzed" ? 1 : 0}`,
    )
      .then((r) => setItems(r.knowledge))
      .catch((e: Error) => setError(e.message));
  }, [mode]);

  const unquizzedCount = (items ?? []).filter((k) => k.quiz_count === 0).length;

  const filtered = useMemo(
    () => (items ?? []).filter((k) => matches(k, query)),
    [items, query],
  );

  async function remove(k: KnowledgeItem) {
    try {
      await apiPost(`/api/knowledge/${k.id}`, null, "DELETE");
      setItems((cur) => cur?.filter((x) => x.id !== k.id) ?? cur);
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  }

  function goPage(n: number) {
    setPage(n);
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      <h1>学び</h1>
      <p className="muted">
        AI に保存してもらった学びの一覧です。未出題の学びは「クイズ化を依頼」でプロンプトをコピーし、
        普段使っている AI チャットに貼り付けてください。AI が MCP 経由でクイズを生成・保存します。
        出題に向かない未出題の学びは「削除」で取り除けます（元に戻せません）。
      </p>
      {error && <p className="error">{error}</p>}

      {unquizzedCount > 1 && (
        <div className="card">
          <p>
            未出題の学びが <strong>{unquizzedCount}</strong> 件あります。1 件ずつではなく、AI
            にまとめて取得・クイズ化してもらうこともできます。
          </p>
          <CopyPromptButton
            text={batchQuizPrompt}
            label="まとめてクイズ化を依頼（プロンプトをコピー）"
            primary
          />
        </div>
      )}

      <div className="filters">
        <label>
          表示
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="unquizzed">未出題のみ</option>
            <option value="all">すべて</option>
          </select>
        </label>
        <label style={{ flex: 1 }}>
          絞り込み
          <input
            type="search"
            value={query}
            placeholder="キーワード（空白区切りで AND）"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      {items === null ? (
        !error && <p className="muted">読み込み中…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">
          {items.length === 0
            ? mode === "unquizzed"
              ? "未出題の学びはありません。"
              : "学びはまだありません。"
            : "条件に合う学びがありません。"}
        </p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            {filtered.length} 件
          </p>
          {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((k) => (
            <div className="card" key={k.id}>
              <p style={{ fontWeight: 600 }}>{k.question}</p>
              <Markdown>{k.answer}</Markdown>
              {k.context && (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  context: {k.context}
                </p>
              )}
              <div>
                {k.tags.map((t) => (
                  <Tag name={t} key={t} />
                ))}
              </div>
              <div className="quizmeta">
                <span>{k.created_at.slice(0, 10)}</span>
                <span>{k.quiz_count > 0 ? `クイズ ${k.quiz_count} 問` : "未出題"}</span>
              </div>
              <CopyPromptButton
                text={() => singleQuizPrompt(k)}
                label="クイズ化を依頼（プロンプトをコピー）"
              />{" "}
              {k.quiz_count === 0 &&
                (confirmId === k.id ? (
                  <>
                    <span className="muted">削除すると元に戻せません。</span>{" "}
                    <button onClick={() => remove(k)}>削除する</button>{" "}
                    <button onClick={() => setConfirmId(null)}>キャンセル</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmId(k.id)}>削除</button>
                ))}
            </div>
          ))}
          <Pager page={page} total={filtered.length} onPage={goPage} />
        </>
      )}
    </>
  );
}
