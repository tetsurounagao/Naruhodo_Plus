"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="site">
      <nav>
        <Link href="/">ホーム</Link>
        <Link href="/quizzes">クイズ</Link>
        <Link href="/knowledge">未出題の学び</Link>
      </nav>
      <button onClick={logout}>ログアウト</button>
    </header>
  );
}
