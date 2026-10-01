import type { QuizChoice } from "../../lib/types";

/**
 * 選択肢の中身（文字 / コード / 画像）。解答 UI・選択肢ごとの解説など、選択肢を出す場所はすべてこれを使う。
 * compact は解説の見出しなど 1 行ぶんで出す場所用（画像を小さく）。
 */
export function ChoiceContent({ choice, compact = false }: { choice: QuizChoice; compact?: boolean }) {
  if (choice.type === "code") {
    return (
      <code className="choice-code" data-language={choice.language}>
        {choice.content}
      </code>
    );
  }
  if (choice.type === "image") {
    return <img className={compact ? "rationale-img" : "choice-img"} src={choice.content} alt="" />;
  }
  return <span className="choice-text">{choice.content}</span>;
}
