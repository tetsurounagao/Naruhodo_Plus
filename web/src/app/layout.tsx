import type { ReactNode } from "react";
import "./globals.css";
import { SiteHeader } from "./_components/SiteHeader";

export const metadata = {
  title: "Naruhodo+",
  description: "学習蓄積・クイズ生成アプリ",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <SiteHeader />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
