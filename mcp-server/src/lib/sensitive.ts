/**
 * 機密情報チェック（2 段目のガード）— 差し替え可能な独立ユニット。
 *
 * 要件（docs/requirements.md 8「機密情報対策」2 / 14「将来のローカルAI拡張」）:
 * - 保存直前にサーバー側で API キー・社内ドメイン・メールアドレス等を
 *   正規表現でチェックし、該当したら保存を止める。AI 呼び出しは行わない。
 * - 将来ここを「ローカル AI による二次チェック版」に差し替えられるよう、
 *   呼び出し側は必ず scanSensitive() だけを使う。
 *
 * 1 段目（固有名詞・社内文脈の抽象化）は add_knowledge のツール説明文で
 * AI に指示する。3 段目（保存前プレビュー）は下書き→確定の 2 段階呼び出し。
 */

export interface SensitiveHit {
  /** 検出ルールの種類 */
  kind: string;
  /** マッチした文字列（そのままログ・警告に出すので長すぎる場合は呼び出し側で丸める） */
  match: string;
  /** どのフィールドで見つかったか */
  field: string;
}

export interface SensitiveScanResult {
  ok: boolean;
  hits: SensitiveHit[];
}

interface Rule {
  kind: string;
  pattern: RegExp;
}

// 誤検知より取りこぼし防止を優先する。ここに載せた形は保存をブロックする。
const RULES: Rule[] = [
  { kind: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // よくあるクラウド系のアクセスキー形式
  { kind: "aws_access_key_id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "gcp_api_key", pattern: /\bAIza[0-9A-Za-z_\-]{35}\b/g },
  { kind: "slack_token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { kind: "github_token", pattern: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/g },
  { kind: "openai_key", pattern: /\bsk-[A-Za-z0-9_\-]{20,}\b/g },
  { kind: "supabase_secret", pattern: /\bsb_secret_[A-Za-z0-9_\-]{10,}\b/g },
  { kind: "private_key_block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/gi },
  // 社内ネットワークを示唆する URL / ホスト
  { kind: "internal_host", pattern: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|[a-z0-9.-]+\.(?:internal|intra|local|corp|lan))\b/gi },
  // 電話番号（日本の形式をゆるく）
  { kind: "phone_jp", pattern: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b/g },
];

/**
 * 追加でブロックしたい社内ドメイン等を環境変数で指定できる。
 * 例: NARUHODO_SENSITIVE_DOMAINS="example.co.jp,acme-internal.com"
 */
function extraDomainRules(): Rule[] {
  const raw = process.env.NARUHODO_SENSITIVE_DOMAINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((domain) => ({
      kind: `configured_domain:${domain}`,
      pattern: new RegExp(domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
    }));
}

/**
 * 複数フィールドをまとめて走査する。
 * @param fields { フィールド名: 値 } の辞書。undefined は無視する。
 */
export function scanSensitive(
  fields: Record<string, string | undefined | null>,
): SensitiveScanResult {
  const rules = [...RULES, ...extraDomainRules()];
  const hits: SensitiveHit[] = [];

  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue;
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      const matches = value.match(rule.pattern);
      if (matches) {
        for (const m of matches) {
          hits.push({ kind: rule.kind, field, match: m });
        }
      }
    }
  }

  return { ok: hits.length === 0, hits };
}
