"use client";

import { useSyncExternalStore } from "react";
import type { AttemptResult, Confidence } from "./types";

/**
 * 解答の記録を裏で送るキュー（#97）。/play はボタンを押した瞬間にブラウザで正誤を出し、記録はここに任せる。
 * - 解答 id はブラウザで作るので、送り直しても二重に記録されない（DB 関数 record_attempt）
 * - 通信の失敗は少し待って自動で送り直す。それでもダメなら「記録できなかった解答」に残し、画面から送り直せる
 * - ページを離れても送信が続くよう keepalive を付ける
 */

export interface AttemptPayload {
  id: string;
  quiz_id: string;
  user_answer: string;
  confidence: Confidence;
  /** /play の得点（コンボ・大当たり込み） */
  points: number;
}

/** 自動で送り直すまでの待ち時間（ミリ秒）。この回数だけ送り直す */
const RETRY_DELAYS = [500, 1500, 4000];

/** 送り直しても結果が変わらない失敗（400 番台） */
class PermanentError extends Error {}

const pending = new Map<string, Promise<AttemptResult>>();
let failed: AttemptPayload[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function send(p: AttemptPayload): Promise<AttemptResult> {
  const res = await fetch("/api/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(p),
    keepalive: true,
  });
  if (res.ok) return res.json() as Promise<AttemptResult>;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const message = res.status === 401 ? "ログインが切れています" : (body.error ?? `記録に失敗 (${res.status})`);
  // 429・5xx は送り直せば通るかもしれない
  if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new PermanentError(message);
  throw new Error(message);
}

async function sendWithRetry(p: AttemptPayload): Promise<AttemptResult> {
  for (let i = 0; ; i++) {
    try {
      return await send(p);
    } catch (e) {
      if (e instanceof PermanentError || i >= RETRY_DELAYS.length) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
    }
  }
}

let unloadGuard = false;
function guardUnload() {
  if (unloadGuard) return;
  unloadGuard = true;
  // 記録しきれていない解答があるうちにタブを閉じようとしたら確認する
  window.addEventListener("beforeunload", (e) => {
    if (pending.size > 0 || failed.length > 0) e.preventDefault();
  });
}

/** 解答を記録する（裏で送る）。返り値は記録できたときの採点結果。失敗したら reject。 */
export function recordAttempt(p: AttemptPayload): Promise<AttemptResult> {
  guardUnload();
  const job = sendWithRetry(p)
    .catch((e: Error) => {
      failed = [...failed, p];
      throw e;
    })
    .finally(() => {
      pending.delete(p.id);
      emit();
    });
  pending.set(p.id, job);
  emit();
  return job;
}

/** その解答が記録されるのを待つ。このキューで送っていない解答ならすぐ終わる。記録できなかったら reject。 */
export async function whenRecorded(id: string): Promise<void> {
  const job = pending.get(id);
  if (job) {
    await job;
    return;
  }
  if (failed.some((p) => p.id === id)) throw new Error("この解答はまだ記録できていません");
}

/**
 * 解いた後に取り下げた問題のポイントを外す。
 * 記録待ちなら記録を待ってから消し、記録できていない解答なら送り直すときのポイントを 0 にする。
 */
export async function dropPoints(id: string, remove: () => Promise<unknown>): Promise<void> {
  if (failed.some((p) => p.id === id)) {
    failed = failed.map((p) => (p.id === id ? { ...p, points: 0 } : p));
    return;
  }
  await whenRecorded(id);
  await remove();
}

/** 記録できなかった解答を送り直す。 */
export function retryFailed(): void {
  const items = failed;
  failed = [];
  emit();
  for (const p of items) recordAttempt(p).catch((e: Error) => console.warn("[attempts] 記録に失敗:", e.message));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// useSyncExternalStore は同じ値なら同じ参照を返す必要があるので、文字列にまとめる
const snapshot = () => `${pending.size}:${failed.length}`;
const serverSnapshot = () => "0:0";

/** 記録待ちと、記録できなかった解答の数。 */
export function useAttemptQueue(): { pending: number; failed: number } {
  const [p, f] = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split(":").map(Number);
  return { pending: p, failed: f };
}
