"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { ScorePill } from "./ScorePill";
import type { Question, QuestionGrade } from "@/types";

function badgeLabel(value: string): string {
  return value.replace(/^[Qq]\s*/, "").replace(/[.)\s]+$/g, "").trim() || value;
}

function clampScore(value: number, maxScore: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maxScore, Math.max(0, Math.round(value)));
}

export function QuestionCard({
  question,
  grade,
  selected,
  expanded,
  edited = false,
  feedbackEdited = false,
  onSelect,
  onToggleExpand,
  onScoreChange,
  onFeedbackChange,
}: {
  question: Question;
  grade?: QuestionGrade;
  selected: boolean;
  expanded: boolean;
  edited?: boolean;
  feedbackEdited?: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  onScoreChange?: (score: number) => void;
  onFeedbackChange?: (feedback: string) => void;
}) {
  const number = badgeLabel(question.number);
  const subpart = question.subpart
    ? badgeLabel(question.subpart).replace(/[()]/g, "")
    : undefined;

  const [editingScore, setEditingScore] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState(false);
  const [scoreDraft, setScoreDraft] = useState("");

  useEffect(() => {
    if (!expanded) {
      setEditingScore(false);
      setEditingFeedback(false);
    }
  }, [expanded]);

  useEffect(() => {
    if (grade) setScoreDraft(String(grade.score));
  }, [grade?.score]);

  const canEditScore = Boolean(expanded && grade && onScoreChange);
  const maxScore = grade?.maxScore ?? 0;

  const commitScore = (raw: string) => {
    if (!grade || !onScoreChange) return;
    const next = clampScore(Number(raw), grade.maxScore);
    onScoreChange(next);
    setScoreDraft(String(next));
    setEditingScore(false);
  };

  const nudgeScore = (delta: number) => {
    if (!grade || !onScoreChange) return;
    const typed = Number(scoreDraft);
    const base = Number.isFinite(typed) ? typed : grade.score;
    const next = clampScore(base + delta, grade.maxScore);
    setScoreDraft(String(next));
    onScoreChange(next);
  };

  return (
    <article
      className={`rounded-2xl border-2 bg-card p-3.5 shadow-sm transition-colors ${
        selected ? "border-accent" : "border-transparent ring-1 ring-line"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
        >
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
              {number}
            </span>
            {subpart ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                {subpart}
              </span>
            ) : null}
          </div>
          <p className="min-w-0 flex-1 pt-1.5 text-sm leading-5 text-ink line-clamp-2">
            {question.text}
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-1.5 pt-1">
          {grade ? (
            editingScore && canEditScore ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Decrease score"
                  className="rounded-md p-0.5 text-muted hover:bg-page disabled:opacity-40"
                  disabled={grade.score <= 0}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => nudgeScore(-1)}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  aria-label="Question score"
                  autoFocus
                  className="h-7 w-11 rounded-full border border-ink bg-card text-center text-xs font-semibold tabular-nums"
                  inputMode="numeric"
                  value={scoreDraft}
                  onChange={(event) => setScoreDraft(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={() => commitScore(scoreDraft)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitScore(scoreDraft);
                    if (event.key === "Escape") {
                      setScoreDraft(String(grade.score));
                      setEditingScore(false);
                    }
                  }}
                />
                <span className="text-xs font-semibold text-muted">/{maxScore}</span>
                <button
                  type="button"
                  aria-label="Increase score"
                  className="rounded-md p-0.5 text-muted hover:bg-page disabled:opacity-40"
                  disabled={grade.score >= maxScore}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => nudgeScore(1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-0.5">
                <ScorePill
                  score={grade.score}
                  maxScore={grade.maxScore}
                  edited={edited}
                  onClick={
                    canEditScore ? () => setEditingScore(true) : undefined
                  }
                />
                {edited ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-accent">
                    Edited
                  </span>
                ) : null}
              </div>
            )
          ) : null}
          <button
            type="button"
            aria-label={expanded ? "Collapse feedback" : "Expand feedback"}
            aria-expanded={expanded}
            onClick={onToggleExpand}
            className="rounded-md p-1 text-muted hover:bg-page"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {expanded && grade ? (
        <div className="mt-3 rounded-xl bg-page px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">
              AI Feedback
              {feedbackEdited ? (
                <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-accent">
                  Edited
                </span>
              ) : null}
            </p>
            {onFeedbackChange ? (
              <button
                type="button"
                className="text-xs font-medium text-accent hover:underline"
                onClick={() => setEditingFeedback((current) => !current)}
              >
                {editingFeedback ? "Done" : "Edit"}
              </button>
            ) : null}
          </div>
          {editingFeedback && onFeedbackChange ? (
            <textarea
              aria-label="AI Feedback"
              className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-line bg-card px-2.5 py-2 text-sm leading-5 text-ink"
              value={grade.feedback}
              onChange={(event) => onFeedbackChange(event.target.value)}
            />
          ) : (
            <p className="mt-1.5 text-sm leading-5 text-muted">{grade.feedback}</p>
          )}
        </div>
      ) : null}
    </article>
  );
}
