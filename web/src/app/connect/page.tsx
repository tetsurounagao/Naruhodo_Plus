"use client";

import { useState } from "react";

interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}
interface ValidateResp {
  ok: boolean;
  checks: Check[];
  projectRef: string | null;
  usersExist: boolean;
  canWrite: boolean;
  envFiles: Record<string, string> | null;
  vercelBlock: string | null;
}

const FIELDS = [
  { key: "apiUrl", label: "Supabase API URL", ph: "https://xxxx.supabase.co（または ref だけ）", required: true },
  { key: "anonKey", label: "Publishable key（anon）", ph: "sb_publishable_… / eyJ…", required: true },
  { key: "serviceKey", label: "Secret key（service_role）", ph: "sb_secret_… / eyJ…", required: true },
  { key: "dbUrl", label: "DB 接続文字列（Session pooler）", ph: "postgresql://postgres.<ref>:…@aws-0-….pooler.supabase.com:5432/postgres", required: true },
  { key: "dbPassword", label: "DB パスワード（任意・URI に含めない場合）", ph: "記号入りはここに生で", required: false },
  { key: "groqKey", label: "Groq API key（任意・用語調べ）", ph: "gsk_…", required: false },
] as const;

type Key = (typeof FIELDS)[number]["key"] | "clientName";

export default function ConnectPage() {
  const [v, setV] = useState<Record<Key, string>>({
    apiUrl: "",
    anonKey: "",
    serviceKey: "",
    dbUrl: "",
    dbPassword: "",
    groqKey: "",
    clientName: "claude",
  });
  const [res, setRes] = useState<ValidateResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [writeMsg, setWriteMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const set = (k: Key, val: string) => setV((p) => ({ ...p, [k]: val }));

  async function validate() {
    setBusy(true);
    setErr(null);
    setWriteMsg(null);
    try {
      const r = await fetch("/api/connect/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setRes(body as ValidateResp);
    } catch (e) {
      setErr((e as Error).message);
      setRes(null);
    } finally {
      setBusy(false);
    }
  }

  async function writeFiles(force: boolean) {
    setBusy(true);
    setWriteMsg(null);
    try {
      const r = await fetch("/api/connect/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...v, force }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      const parts: string[] = [];
      if (body.written?.length) parts.push(`書き出し: ${body.written.join(", ")}`);
      if (body.skipped?.length) parts.push(`スキップ（既存）: ${body.skipped.join(", ")}`);
      setWriteMsg(`${parts.join(" / ")}\n${body.hint ?? ""}`);
    } catch (e) {
      setWriteMsg(`失敗: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <h1>接続セットアップ</h1>
      <p className="muted">
        Supabase の値を貼って「接続テスト」を押すと、その場で疎通を確認して
        <code>.env</code> を生成します。CLI の <code>npm run setup</code> の代わりに使えます。
        値はこのサーバー（自分の環境）内でのみ使われ、外部には送信しません。
      </p>

      <div className="card">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key}>
              {f.label}
              {f.required && <span style={{ color: "var(--danger)" }}> *</span>}
            </label>
            <input
              id={f.key}
              type={f.key.toLowerCase().includes("key") || f.key.includes("Password") ? "password" : "text"}
              value={v[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.ph}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ))}
        <label htmlFor="clientName">MCP 呼び出し元 AI 名</label>
        <input
          id="clientName"
          type="text"
          value={v.clientName}
          onChange={(e) => set("clientName", e.target.value)}
          placeholder="claude / codex"
        />
        <p style={{ marginTop: 12 }}>
          <button className="primary" onClick={validate} disabled={busy}>
            {busy ? "確認中…" : "接続テスト"}
          </button>
        </p>
        {err && <p className="error">{err}</p>}
      </div>

      {res && (
        <>
          <div className="card">
            <ul className="setupchecks">
              {res.checks.map((c) => (
                <li key={c.id} className={c.ok ? "ok" : "ng"}>
                  <span className="mark">{c.ok ? "✓" : "✗"}</span>
                  <span>
                    {c.label}
                    {c.detail && <span className="muted"> — {c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {res.ok ? (
              <p className="muted" style={{ marginTop: 8 }}>
                必須チェックはすべて OK。
                {res.usersExist
                  ? " ログインユーザーは作成済みです。"
                  : " このあと /login で最初のユーザーを作成できます。"}
              </p>
            ) : (
              <p className="error" style={{ marginTop: 8 }}>
                未達の項目があります。値を直して再テストしてください。
              </p>
            )}
          </div>

          {res.ok && res.envFiles && (
            <>
              <h2>環境変数</h2>

              <div className="card">
                <p style={{ fontWeight: 600, margin: "0 0 4px" }}>
                  A. Vercel にデプロイする場合
                </p>
                <p className="muted" style={{ marginTop: 0 }}>
                  Vercel → Project → Settings → Environment Variables に貼り付け（Bulk 入力可）。
                  貼った後 <strong>Redeploy</strong> が必要です。
                </p>
                <pre className="cmd">{res.vercelBlock}</pre>
                <button onClick={() => copy(res.vercelBlock ?? "", "vercel")}>
                  {copied === "vercel" ? "コピーしました" : "コピー"}
                </button>
              </div>

              <div className="card">
                <p style={{ fontWeight: 600, margin: "0 0 4px" }}>
                  B. ローカルで動かす場合
                </p>
                {res.canWrite ? (
                  <>
                    <p className="muted" style={{ marginTop: 0 }}>
                      この 3 ファイルを書き出します（既存は上書きしません）。
                    </p>
                    <p>
                      <button onClick={() => writeFiles(false)} disabled={busy}>
                        .env.local 群を書き出す
                      </button>{" "}
                      <button onClick={() => writeFiles(true)} disabled={busy}>
                        上書きして書き出す
                      </button>
                    </p>
                    {writeMsg && (
                      <pre className="cmd" style={{ whiteSpace: "pre-wrap" }}>
                        {writeMsg}
                      </pre>
                    )}
                  </>
                ) : (
                  <p className="muted" style={{ marginTop: 0 }}>
                    現在の環境では書き出し不可（Vercel 等）。上の内容を各ファイルに貼ってください。
                  </p>
                )}
                {Object.entries(res.envFiles).map(([name, content]) => (
                  <div key={name} style={{ marginTop: 10 }}>
                    <p style={{ fontWeight: 600, margin: "0 0 4px" }}>{name}</p>
                    <pre className="cmd">{content}</pre>
                    <button onClick={() => copy(content, name)}>
                      {copied === name ? "コピーしました" : "コピー"}
                    </button>
                  </div>
                ))}
              </div>

              <div className="card">
                <p style={{ fontWeight: 600, margin: 0 }}>次のステップ</p>
                <ol className="muted" style={{ marginBottom: 0 }}>
                  <li>
                    <code>npm run db:migrate</code>（スキーマ適用。上のチェックで「スキーマ適用済み」が ✗ の場合）
                  </li>
                  <li>Vercel は Redeploy / ローカルは dev サーバー再起動</li>
                  <li>
                    <a href="/login">/login</a> で最初のユーザーを作成
                  </li>
                </ol>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
