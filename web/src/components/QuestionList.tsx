"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QuestionCard } from "./QuestionCard";
import type {
  GradeOverride,
  GradingResult,
  MappedAnswer,
  Question,
  QuestionGrade,
} from "@/types";

export type MappingSelection =
  | { kind: "question"; id: string }
  | { kind: "unmapped"; id: string };

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
}

async function persistOverride(
  jobId: string,
  questionId: string,
  patch: GradeOverride
): Promise<void> {
  try {
    await fetch(`${apiBase()}/api/jobs/${jobId}/grade-overrides`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, ...patch }),
      keepalive: true,
    });
  } catch {
    // Job may have expired; the UI still shows the in-session edit.
  }
}

function applyOverride(
  grade: QuestionGrade | undefined,
  override: GradeOverride | undefined
): QuestionGrade | undefined {
  if (!grade) return undefined;
  if (!override) return grade;
  const score = override.score ?? grade.score;
  const feedback = override.feedback ?? grade.feedback;
  let correct = grade.correct;
  if (override.score != null) {
    if (score <= 0) correct = false;
    else if (score >= grade.maxScore) correct = true;
    else correct = "partial";
  }
  return { ...grade, score, feedback, correct };
}

function headerSummary(
  totalScore: number,
  maxScore: number,
  overallFeedback?: string
): string {
  const line = `${totalScore}/${maxScore} · Scored ${totalScore}/${maxScore}`;
  const extra = overallFeedback
    ?.replace(/^Scored\s+\d+\s*\/\s*\d+\.?\s*/i, "")
    .trim();
  return extra ? `${line}. ${extra}` : line;
}

export function QuestionList({
  jobId,
  questions,
  answers,
  unmatchedAnswerIds,
  grading,
  initialOverrides,
  selected,
  onSelect,
}: {
  jobId?: string;
  questions: Question[];
  answers: MappedAnswer[];
  unmatchedAnswerIds: string[];
  grading?: GradingResult;
  initialOverrides?: Record<string, GradeOverride>;
  selected: MappingSelection | null;
  onSelect: (selection: MappingSelection) => void;
}) {
  const unmatched = unmatchedAnswerIds
    .map((id) => answers.find((answer) => answer.id === id))
    .filter((answer): answer is MappedAnswer => Boolean(answer));

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, GradeOverride>>(
    () => initialOverrides ?? {}
  );
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  useEffect(() => {
    return () => {
      for (const [questionId, timer] of Object.entries(saveTimers.current)) {
        clearTimeout(timer);
        const merged = overridesRef.current[questionId];
        if (jobId && merged) {
          void persistOverride(jobId, questionId, merged);
        }
      }
    };
  }, [jobId]);

  const queuePersist = (questionId: string, delayMs: number) => {
    if (!jobId) return;
    const existing = saveTimers.current[questionId];
    if (existing) clearTimeout(existing);
    saveTimers.current[questionId] = setTimeout(() => {
      const merged = overridesRef.current[questionId];
      if (!merged) return;
      void persistOverride(jobId, questionId, merged);
    }, delayMs);
  };

  const allExpanded =
    questions.length > 0 && questions.every((question) => expanded[question.id]);

  const toggleAll = () => {
    const next = !allExpanded;
    setExpanded(
      Object.fromEntries(questions.map((question) => [question.id, next]))
    );
  };

  const patchOverride = (questionId: string, patch: GradeOverride) => {
    setOverrides((current) => {
      const next = {
        ...current,
        [questionId]: { ...current[questionId], ...patch },
      };
      overridesRef.current = next;
      return next;
    });
    queuePersist(questionId, patch.score != null ? 0 : 400);
  };

  const totals = useMemo(() => {
    if (!grading) return null;
    let totalScore = 0;
    for (const question of questions) {
      const grade = applyOverride(
        grading.perQuestion[question.id],
        overrides[question.id]
      );
      if (grade) totalScore += grade.score;
    }
    return { totalScore, maxScore: grading.maxScore };
  }, [grading, questions, overrides]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">
            Extracted Questions (from question paper)
          </h2>
          {totals ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted">
              {headerSummary(
                totals.totalScore,
                totals.maxScore,
                grading?.overallFeedback
              )}
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
        {questions.map((question) => {
          const original = grading?.perQuestion[question.id];
          const override = overrides[question.id];
          const grade = applyOverride(original, override);
          return (
            <QuestionCard
              key={question.id}
              question={question}
              grade={grade}
              edited={override?.score != null && original?.score !== override.score}
              feedbackEdited={
                override?.feedback != null &&
                original?.feedback !== override.feedback
              }
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
              onScoreChange={
                original
                  ? (score) => patchOverride(question.id, { score })
                  : undefined
              }
              onFeedbackChange={
                original
                  ? (feedback) => patchOverride(question.id, { feedback })
                  : undefined
              }
            />
          );
        })}

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
