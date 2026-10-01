import { MASTERY_LABELS, type Mastery } from "../../lib/mastery";

/**
 * なるほど電球。level が上がるほど明るくなり、3（身についた）で光る。
 * brightened を付けると「明るくなった」瞬間の演出（ピカッ）を一度だけ再生する。
 */
export function Bulb({
  level,
  size = 20,
  brightened = false,
  title,
}: {
  level: Mastery;
  size?: number;
  brightened?: boolean;
  title?: string;
}) {
  const label = title ?? `なるほど度: ${MASTERY_LABELS[level]}`;
  return (
    <span
      className={`bulb bulb-${level}${brightened ? " bulb-brightened" : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path className="bulb-base" d="M9.5 18.5h5M10.5 21h3" />
        <path
          className="bulb-glass"
          d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2v.5h5V16c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"
        />
      </svg>
    </span>
  );
}
