import type { ReactNode } from "react";

export const metadata = {
  title: "Naruhodo+",
  description: "学習蓄積・クイズ生成アプリ",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
