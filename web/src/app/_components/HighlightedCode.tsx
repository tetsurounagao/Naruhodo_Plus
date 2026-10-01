"use client";

import { useEffect, useState } from "react";

/**
 * コード片を highlight.js で色付けして出す（コードの選択肢用）。
 * highlight.js はコードの選択肢が出たときだけ読み込む。読み込むまでは色なしで出す。
 * highlight.js は入力を HTML エスケープしてから <span class="hljs-…"> で包むので、出力をそのまま埋め込んでよい。
 */
export function HighlightedCode({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import("highlight.js/lib/common")
      .then(({ default: hljs }) => {
        const result =
          language && hljs.getLanguage(language)
            ? hljs.highlight(code, { language, ignoreIllegals: true })
            : hljs.highlightAuto(code);
        if (alive) setHtml(result.value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code, language]);

  const cls = `hljs ${className ?? ""}`.trim();
  if (html === null) return <code className={cls}>{code}</code>;
  return <code className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}
