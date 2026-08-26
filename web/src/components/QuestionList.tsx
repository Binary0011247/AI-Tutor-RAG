"use client";

import { useState } from "react";
import { QuestionCard } from "./QuestionCard";
import type { GradingResult, MappedAnswer, Question } from "@/types";

export type MappingSelection =
  | { kind: "question"; id: string }
  | { kind: "unmapped"; id: string };

export function QuestionList({
  questions,
  answers,
  unmatchedAnswerIds,
  grading,
  selected,
  onSelect,
}: {
  questions: Question[];
  answers: MappedAnswer[];
  unmatchedAnswerIds: string[];
  grading?: GradingResult;
  selected: MappingSelection | null;
  onSelect: (selection: MappingSelection) => void;
}) {
  const unmatched = unmatchedAnswerIds
    .map((id) => answers.find((answer) => answer.id === id))
    .filter((answer): answer is MappedAnswer => Boolean(answer));

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const allExpanded =
    questions.length > 0 && questions.every((question) => expanded[question.id]);

  const toggleAll = () => {
    const next = !allExpanded;
    setExpanded(
      Object.fromEntries(questions.map((question) => [question.id, next]))
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">
            Extracted Questions (from question paper)
          </h2>
          {grading ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted">
              {grading.totalScore}/{grading.maxScore}
              {grading.overallFeedback ? ` · ${grading.overallFeedback}` : ""}
            </p>
          ) : null}
        </div>
        {questions.length > 0 ? (
          <button
            type="button"
            className="shrink-0 text-sm font-medium text-accent hover:underline"
            onClick={toggleAll}
          >
            {allExpanded ? "Collapse All" : "Expand All"}
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        {questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            grade={grading?.perQuestion[question.id]}
            selected={
              selected?.kind === "question" && selected.id === question.id
            }
            expanded={Boolean(expanded[question.id])}
            onSelect={() => {
              onSelect({ kind: "question", id: question.id });
              setExpanded((current) => ({ ...current, [question.id]: true }));
            }}
            onToggleExpand={() =>
              setExpanded((current) => ({
                ...current,
                [question.id]: !current[question.id],
              }))
            }
          />
        ))}

        {unmatched.length > 0 ? (
          <div className="pt-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Unmapped answers</h3>
            <div className="space-y-3">
              {unmatched.map((answer) => (
                <UnmappedAnswerCard
                  key={answer.id}
                  answer={answer}
                  selected={
                    selected?.kind === "unmapped" && selected.id === answer.id
                  }
                  onSelect={() =>
                    onSelect({ kind: "unmapped", id: answer.id })
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function UnmappedAnswerCard({
  answer,
  selected,
  onSelect,
}: {
  answer: MappedAnswer;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = answer.detectedLabel?.trim() || "?";

  return (
    <article
      className={`rounded-2xl border-2 bg-card p-3.5 shadow-sm transition-colors ${
        selected ? "border-accent" : "border-transparent ring-1 ring-line"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full cursor-pointer items-start gap-3 text-left"
      >
        <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full bg-ink px-2 text-xs font-semibold text-white">
          {label}
        </span>
        <p className="min-w-0 flex-1 pt-1.5 text-sm leading-5 text-ink line-clamp-2">
          {answer.transcript || "Unlabeled answer on the sheet."}
        </p>
      </button>
    </article>
  );
}
