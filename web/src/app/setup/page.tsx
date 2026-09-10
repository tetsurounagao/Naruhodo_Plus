"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/client";

interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  optional?: boolean;
}
interface StatusResp {
  checks: Check[];
  cwdHint: string;
}

function guessRepoPath(cwd: string): string {
  // ローカル dev では cwd が .../naruhodo-plus/web になる
  return cwd.replace(/\/web\/?$/, "");
}

export default function SetupPage() {
  const [data, setData] = useState<StatusResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  function load() {
    setData(null);
    apiGet<StatusResp>("/api/setup/status")
      .then((d) => {
        setData(d);
        setRepoPath((p) => p || guessRepoPath(d.cwdHint));
      })
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, []);

  const mcpCmd = useMemo(
    () =>
      `claude mcp add naruhodo-plus -- node ${repoPath || "/ABS/PATH/naruhodo-plus"}/mcp-server/dist/index.js`,
    [repoPath],
  );

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
      <h1>セットアップ</h1>
      <p className="muted">
        接続状況の確認と、MCP 登録コマンドの生成。手順の詳細は{" "}
        <a href="https://github.com/tetsurounagao/Naruhodo_Plus/blob/main/docs/setup.md" target="_blank" rel="noreferrer">
          docs/setup.md
        </a>
        。
      </p>
      {error && <p className="error">{error}</p>}

      <div className="card">
        {data === null ? (
          <p className="muted">確認中…</p>
        ) : (
          <ul className="setupchecks">
            {data.checks.map((c) => (
              <li key={c.id} className={c.ok ? "ok" : c.optional ? "warn" : "ng"}>
                <span className="mark">{c.ok ? "✓" : c.optional ? "–" : "✗"}</span>
                <span>
                  {c.label}
                  {!c.ok && c.detail && (
                    <span className="muted"> — {c.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button onClick={load} style={{ marginTop: 8 }}>
          再チェック
        </button>
      </div>

      <h2>MCP サーバーの登録</h2>
      <p className="muted">
        「メモして」等を使うには、ローカルで <code>npm run build</code> のあと、
        使う AI クライアントに MCP サーバーを登録します。
      </p>
      <div className="card">
        <label htmlFor="repo">リポジトリの絶対パス</label>
        <input
          id="repo"
          type="text"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          placeholder="/Users/you/naruhodo-plus"
        />
        <p style={{ fontWeight: 600, margin: "12px 0 4px" }}>Claude Code</p>
        <pre className="cmd">{mcpCmd}</pre>
        <button onClick={() => copy(mcpCmd, "claude")}>
          {copied === "claude" ? "コピーしました" : "コピー"}
        </button>

        <p style={{ fontWeight: 600, margin: "16px 0 4px" }}>
          Codex CLI（~/.codex/config.toml）
        </p>
        <pre className="cmd">{`[mcp_servers.naruhodo-plus]
command = "node"
args = ["${repoPath || "/ABS/PATH/naruhodo-plus"}/mcp-server/dist/index.js"]
env = { MCP_CLIENT_NAME = "codex" }`}</pre>
        <button
          onClick={() =>
            copy(
              `[mcp_servers.naruhodo-plus]\ncommand = "node"\nargs = ["${repoPath || "/ABS/PATH/naruhodo-plus"}/mcp-server/dist/index.js"]\nenv = { MCP_CLIENT_NAME = "codex" }`,
              "codex",
            )
          }
        >
          {copied === "codex" ? "コピーしました" : "コピー"}
        </button>
      </div>
    </>
  );
}
