import { randomUUID } from "node:crypto";

/**
 * 保存前プレビュー用の下書きストア（プロセス内メモリ）。
 *
 * add_knowledge が下書きを作ってトークンを返し、confirm_knowledge が
 * そのトークンで確定する。MCP サーバーは単一のローカルプロセスなので
 * メモリ保持で十分。一定時間で自動失効させる。
 */

export interface KnowledgeDraft {
  question: string;
  answer: string;
  context?: string;
  source?: string;
  /** 正規化済みタグ */
  tags: string[];
  createdAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 分

const store = new Map<string, KnowledgeDraft>();

function sweep(): void {
  const now = Date.now();
  for (const [token, draft] of store) {
    if (now - draft.createdAt > TTL_MS) store.delete(token);
  }
}

export function putDraft(draft: Omit<KnowledgeDraft, "createdAt">): string {
  sweep();
  const token = randomUUID();
  store.set(token, { ...draft, createdAt: Date.now() });
  return token;
}

export function takeDraft(token: string): KnowledgeDraft | undefined {
  sweep();
  const draft = store.get(token);
  if (draft) store.delete(token);
  return draft;
}
