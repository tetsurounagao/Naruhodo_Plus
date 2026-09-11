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

const SYSTEM_PROMPT = `あなたは技術用語を日本語で説明するアシスタントです。

まず説明を 1〜3 文で書く（専門外の人にも分かる平易さ。確信が持てない部分は「〜と思われる」と明示）。
「説明:」「1)」などのラベルや番号、前置き・復唱は書かない。説明文からそのまま始める。

説明の後に空行をはさみ、必ず次の2行をこの書式のまま出力する（値だけ差し替える。他の文言や見出しは混ぜない）:
サイト: <その語を正しく確認できる信頼できる情報源のサイト名を1〜2個、カンマ区切り（例: react.dev, MDN）>
検索: <そこで使うとよい検索クエリを1つ（バッククォートや引用符は付けない）>

厳守:
- 具体的な URL・ページのパス・ディープリンクは書かない（推測になり誤りやすい）。サイト名と検索クエリだけ。
- 「サイト:」「検索:」の2行は必ず出力し、この書式を崩さない。`;

// プロンプト仕様の版。変えるとキャッシュの旧エントリを無視する。
const PROMPT_VERSION = "v3";

/** モデル出力を「説明文」「サイト名一覧」「検索クエリ」に分ける。書式が崩れていても text は落とさない。 */
export function parseExplainAnswer(raw: string): {
  text: string;
  sites: string[];
  query: string | null;
} {
  const bodyLines: string[] = [];
  let siteLine: string | null = null;
  let queryLine: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const siteMatch = line.match(/^\s*サイト[:：]\s*(.+)$/);
    const queryMatch = line.match(/^\s*検索[:：]\s*(.+)$/);
    if (siteMatch) {
      siteLine = siteMatch[1];
      continue;
    }
    if (queryMatch) {
      queryLine = queryMatch[1];
      continue;
    }
    bodyLines.push(line);
  }
  const text = bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const strip = (s: string) => s.trim().replace(/^[`"「]+|[`"」]+$/g, "");
  const sites = siteLine
    ? siteLine.split(/[,、]/).map(strip).filter(Boolean)
    : [];
  const query = queryLine ? strip(queryLine) || null : null;
  return { text, sites, query };
}

export function explainAvailable(): boolean {
  return env.groqApiKey.length > 0;
}

function contextKey(context?: string): string {
  const c = (context ?? "").trim();
  if (!c) return PROMPT_VERSION;
  return (
    PROMPT_VERSION +
    ":" +
    createHash("sha256").update(c).digest("hex").slice(0, 16)
  );
}

export async function explainTerm(
  term: string,
  context?: string,
): Promise<{ text: string; sites: string[]; query: string | null; cached: boolean }> {
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
  if (hit?.answer) return { ...parseExplainAnswer(hit.answer as string), cached: true };

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
        max_tokens: 500,
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
  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new HttpError(502, "Groq から空の応答が返りました。");

  await supabase
    .from("term_lookups")
    .upsert(
      { term, context_key: key, answer: raw, model: env.groqModel },
      { onConflict: "term,context_key" },
    );

  return { ...parseExplainAnswer(raw), cached: false };
}
