"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/client";
import type { KnowledgeItem } from "../../lib/types";
import { Markdown } from "../_components/Markdown";
import { Tag } from "../_components/Tag";

function buildPrompt(k: KnowledgeItem): string {
  return [
    "次の「学び」から選択式クイズ（選択肢3〜5個・正解1つ）を1問作り、save_quiz で保存してください。",
    "固有名詞や社内文脈は持ち込まないこと。tags は元の学びのものを引き継ぐこと。",
    `source_knowledge_id: ${k.id}`,
    "",
    `Q: ${k.question}`,
    `A: ${k.answer}`,
    k.context ? `context: ${k.context}` : "",
    `tags: ${k.tags.join(", ") || "(なし)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ knowledge: KnowledgeItem[] }>("/api/knowledge?unquizzed=1")
      .then((r) => setItems(r.knowledge))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function copy(k: KnowledgeItem) {
    try {
      await navigator.clipboard.writeText(buildPrompt(k));
      setCopiedId(k.id);
      setTimeout(() => setCopiedId((id) => (id === k.id ? null : id)), 2000);
    } catch {
      setError("クリップボードにコピーできませんでした");
    }
  }

  async function remove(k: KnowledgeItem) {
    try {
      await apiPost(`/api/knowledge/${k.id}`, null, "DELETE");
      setItems((cur) => cur?.filter((x) => x.id !== k.id) ?? cur);
      setConfirmId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  }

  return (
    <>
      <h1>未出題の学び</h1>
      <p className="muted">
        「クイズ化を依頼」でプロンプトをコピーし、普段使っている AI チャットに貼り付けてください。
        AI が MCP 経由でクイズを生成・保存します。
        出題に向かない学びは「削除」で取り除けます（元に戻せません）。
      </p>
      {error && <p className="error">{error}</p>}

      {items === null ? (
        <p className="muted">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="muted">未出題の学びはありません。</p>
      ) : (
        items.map((k) => (
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
            <button onClick={() => copy(k)}>
              {copiedId === k.id ? "コピーしました" : "クイズ化を依頼（プロンプトをコピー）"}
            </button>{" "}
            {confirmId === k.id ? (
              <>
                <span className="muted">削除すると元に戻せません。</span>{" "}
                <button onClick={() => remove(k)}>削除する</button>{" "}
                <button onClick={() => setConfirmId(null)}>キャンセル</button>
              </>
            ) : (
              <button onClick={() => setConfirmId(k.id)}>削除</button>
            )}
          </div>
        ))
      )}
    </>
  );
}
