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
}: {
  score: number;
  maxScore: number;
}) {
  const tone = scoreTone(score, maxScore);
  return (
    <span
      className={`inline-flex min-w-10 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${TONE_CLASS[tone]}`}
    >
      {score}/{maxScore}
    </span>
  );
}
