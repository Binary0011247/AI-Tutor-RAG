export type ScoreTone = "good" | "partial" | "fail";

export function scoreTone(score: number, maxScore: number): ScoreTone {
  if (maxScore <= 0 || score <= 0) return "fail";
  if (score >= maxScore) return "good";
  return "partial";
}

const TONE_CLASS: Record<ScoreTone, string> = {
  good: "bg-score-good text-white",
  partial: "bg-score-partial text-white",
  fail: "bg-score-fail text-white",
};

export function ScorePill({
  score,
  maxScore,
  edited = false,
  onClick,
}: {
  score: number;
  maxScore: number;
  edited?: boolean;
  onClick?: () => void;
}) {
  const tone = scoreTone(score, maxScore);
  const className = `inline-flex min-w-10 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${TONE_CLASS[tone]} ${
    edited ? "ring-2 ring-ink ring-offset-1" : ""
  } ${onClick ? "cursor-pointer" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {score}/{maxScore}
      </button>
    );
  }

  return <span className={className}>{score}/{maxScore}</span>;
}
