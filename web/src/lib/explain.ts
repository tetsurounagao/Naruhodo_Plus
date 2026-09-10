import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase/admin";
import { env } from "./env";
import { scanSensitive } from "./sensitive";
import { HttpError } from "./auth";

/**
 * 用語の即時解説（Groq）。差し替え可能な独立ユニット。
 * - コア機能には依存しない。GROQ_API_KEY 未設定なら explainAvailable() が false。
 * - 送るのは term ＋ 出てきた 1 文まで。knowledge 本体や解説全文は送らない。
 * - 送信前に scanSensitive を通す。同じ語・文脈はキャッシュから返す。
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `あなたは技術用語の意味を日本語で簡潔に説明するアシスタントです。
- 1〜3文。専門外の人にも分かる平易さで。
- 確信が持てない部分は「〜と思われる」等と明示する。
- これは学習の出発点であり、正確さは利用者が一次情報で確認する前提。
- 前置き・復唱・箇条書きは不要。説明本文のみを返す。`;

export function explainAvailable(): boolean {
  return env.groqApiKey.length > 0;
}

function contextKey(context?: string): string {
  const c = (context ?? "").trim();
  if (!c) return "";
  return createHash("sha256").update(c).digest("hex").slice(0, 16);
}

export async function explainTerm(
  term: string,
  context?: string,
): Promise<{ text: string; cached: boolean }> {
  if (!explainAvailable()) {
    throw new HttpError(503, "用語解説は無効です（GROQ_API_KEY 未設定）");
  }

  const scan = scanSensitive({ term, context });
  if (!scan.ok) {
    throw new HttpError(
      422,
      "機密情報の可能性がある文字列が含まれているため、外部への送信を中止しました。",
    );
  }

  const supabase = getSupabaseAdmin();
  const key = contextKey(context);

  const { data: hit } = await supabase
    .from("term_lookups")
    .select("answer")
    .eq("term", term)
    .eq("context_key", key)
    .maybeSingle();
  if (hit?.answer) return { text: hit.answer as string, cached: true };

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.groqApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.groqModel,
        temperature: 0.3,
        max_tokens: 320,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: context
              ? `語: ${term}\n出てきた文: ${context}`
              : `語: ${term}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(504, "Groq への接続がタイムアウトしました。");
  }

  if (res.status === 429) {
    throw new HttpError(429, "Groq の無料枠の上限に達しました。少し待って再試行してください。");
  }
  if (!res.ok) {
    const detail = await res
      .json()
      .then((j) => j?.error?.message as string | undefined)
      .catch(() => undefined);
    if (res.status === 404) {
      throw new HttpError(
        502,
        `Groq: モデル「${env.groqModel}」が使えません。GROQ_MODEL を変更してください` +
          (detail ? `（${detail}）` : ""),
      );
    }
    throw new HttpError(
      502,
      `Groq エラー（${res.status}）` + (detail ? `: ${detail}` : ""),
    );
  }

  const data = (await res.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new HttpError(502, "Groq から空の応答が返りました。");

  await supabase
    .from("term_lookups")
    .upsert(
      { term, context_key: key, answer: text, model: env.groqModel },
      { onConflict: "term,context_key" },
    );

  return { text, cached: false };
}
