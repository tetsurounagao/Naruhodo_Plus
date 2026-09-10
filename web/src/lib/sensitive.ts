import "server-only";

/**
 * 機密情報チェック（差し替え可能な独立ユニット）。
 * mcp-server/src/lib/sensitive.ts と同じ考え方の web 版。
 * 外部 AI（Groq）へ送る前にここを通す。該当したら送らない。
 */

export interface SensitiveHit {
  kind: string;
  match: string;
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

const RULES: Rule[] = [
  { kind: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "aws_access_key_id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "gcp_api_key", pattern: /\bAIza[0-9A-Za-z_\-]{35}\b/g },
  { kind: "slack_token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { kind: "github_token", pattern: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/g },
  { kind: "openai_key", pattern: /\bsk-[A-Za-z0-9_\-]{20,}\b/g },
  { kind: "groq_key", pattern: /\bgsk_[A-Za-z0-9]{20,}\b/g },
  { kind: "supabase_secret", pattern: /\bsb_secret_[A-Za-z0-9_\-]{10,}\b/g },
  { kind: "private_key_block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/gi },
  {
    kind: "internal_host",
    pattern:
      /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|[a-z0-9.-]+\.(?:internal|intra|local|corp|lan))\b/gi,
  },
  { kind: "phone_jp", pattern: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b/g },
];

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
        for (const m of matches) hits.push({ kind: rule.kind, field, match: m });
      }
    }
  }
  return { ok: hits.length === 0, hits };
}
