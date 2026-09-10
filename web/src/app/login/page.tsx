"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  // まだユーザーが 0 人なら「アカウント作成」モード
  const [mode, setMode] = useState<"login" | "signup" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/signup")
      .then((r) => r.json())
      .then((d) => setMode(d.available ? "signup" : "login"))
      .catch(() => setMode("login"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "失敗しました");
      return;
    }
    if (body.needsLogin) {
      setMode("login");
      setError("アカウントを作成しました。ログインしてください。");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (mode === null) return <p className="muted">読み込み中…</p>;

  const isSignup = mode === "signup";

  return (
    <>
      <h1>{isSignup ? "アカウント作成" : "ログイン"}</h1>
      <p className="muted">
        {isSignup
          ? "最初のユーザーを作成します。以降のユーザー追加は Supabase ダッシュボードで行います。"
          : "追加ユーザーは Supabase ダッシュボードの Authentication → Add user で作成します。"}
      </p>
      <form onSubmit={onSubmit} className="card">
        <label htmlFor="email">メールアドレス</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">パスワード{isSignup && "（8文字以上）"}</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={isSignup ? 8 : undefined}
          required
        />
        {error && <p className="error">{error}</p>}
        <p style={{ marginTop: 16 }}>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "..." : isSignup ? "作成してログイン" : "ログイン"}
          </button>
        </p>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
