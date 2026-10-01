"use client";

import type { SourceKnowledge } from "../../lib/types";
import { Markdown } from "./Markdown";

/** 回答後に出す「元の学び」。どんな疑問から生まれた問題かを文脈ごと思い出せるようにする。 */
export function SourceKnowledgeView({ knowledge }: { knowledge: SourceKnowledge | null }) {
  if (!knowledge) return null;
  return (
    <details className="source-knowledge">
      <summary>元の学び</summary>
      <p style={{ fontWeight: 600 }}>{knowledge.question}</p>
      <Markdown>{knowledge.answer}</Markdown>
      {knowledge.context && (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          context: {knowledge.context}
        </p>
      )}
    </details>
  );
}
