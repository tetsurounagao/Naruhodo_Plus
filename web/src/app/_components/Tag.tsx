"use client";

import Link from "next/link";
import { useTagColors } from "../../lib/tag-colors";

/** 背景色に対して読みやすい文字色（WCAG 相対輝度）。 */
export function textOn(hex: string): string {
  const v = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const L = 0.2126 * lin(v(1)) + 0.7152 * lin(v(3)) + 0.0722 * lin(v(5));
  return L > 0.5 ? "#1c1c1a" : "#ffffff";
}

/**
 * タグチップ。色が設定されていれば背景に敷き、文字色を自動調整。
 * クリックで `/search?tags=<name>`。
 */
export function Tag({ name, weak = false }: { name: string; weak?: boolean }) {
  const { colorOf } = useTagColors();
  const color = colorOf(name);
  return (
    <Link
      href={`/search?tags=${encodeURIComponent(name)}`}
      className={weak ? "tag weak" : "tag"}
      style={color ? { background: color, color: textOn(color) } : undefined}
    >
      {name}
    </Link>
  );
}
