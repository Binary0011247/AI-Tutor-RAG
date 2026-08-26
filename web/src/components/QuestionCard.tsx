"use client";

import { ChevronDown } from "lucide-react";
import { ScorePill } from "./ScorePill";
import type { Question, QuestionGrade } from "@/types";

function badgeLabel(value: string): string {
  return value.replace(/^[Qq]\s*/, "").replace(/[.)\s]+$/g, "").trim() || value;
}

export function QuestionCard({
  question,
  grade,
  selected,
  expanded,
  onSelect,
  onToggleExpand,
}: {
  question: Question;
  grade?: QuestionGrade;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  const number = badgeLabel(question.number);
  const subpart = question.subpart
    ? badgeLabel(question.subpart).replace(/[()]/g, "")
    : undefined;

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
          {grade ? <ScorePill score={grade.score} maxScore={grade.maxScore} /> : null}
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
          <p className="text-sm font-semibold text-ink">AI Feedback</p>
          <p className="mt-1.5 text-sm leading-5 text-muted">{grade.feedback}</p>
        </div>
      ) : null}
    </article>
  );
}
