"use client";

import { useMemo } from "react";
import { AnswerSheetViewer } from "./AnswerSheetViewer";
import {
  QuestionList,
  type MappingSelection,
} from "./QuestionList";
import type { PipelineResult } from "@/types";

export type MobilePane = "questions" | "sheet";

export function defaultMappingSelection(
  result: PipelineResult
): MappingSelection | null {
  if (result.questions[0]) {
    return { kind: "question", id: result.questions[0].id };
  }
  const unmatchedId = result.unmatchedAnswerIds[0];
  if (unmatchedId) return { kind: "unmapped", id: unmatchedId };
  return null;
}

export function MappingScreen({
  jobId,
  result,
  selected,
  mobilePane,
  onSelect,
  onMobilePaneChange,
}: {
  jobId: string;
  result: PipelineResult;
  selected: MappingSelection | null;
  mobilePane: MobilePane;
  onSelect: (selection: MappingSelection) => void;
  onMobilePaneChange: (pane: MobilePane) => void;
}) {
  const answersByQuestion = useMemo(() => {
    const map = new Map<string, (typeof result.answers)[number]>();
    for (const answer of result.answers) {
      if (answer.questionId) map.set(answer.questionId, answer);
    }
    return map;
  }, [result.answers]);

  const unansweredIds = result.unansweredQuestionIds;

  const viewer = useMemo(() => {
    if (!selected) {
      return {
        regions: [],
        unanswered: false,
        questionNumber: undefined as string | undefined,
        questionSubpart: undefined as string | undefined,
      };
    }

    if (selected.kind === "question") {
      const question = result.questions.find((q) => q.id === selected.id);
      const isUnanswered = unansweredIds.includes(selected.id);
      const answer = answersByQuestion.get(selected.id);
      return {
        regions: isUnanswered ? [] : answer?.regions ?? [],
        unanswered: isUnanswered,
        questionNumber: question?.number,
        questionSubpart: question?.subpart,
      };
    }

    const answer = result.answers.find((item) => item.id === selected.id);
    return {
      regions: answer?.regions ?? [],
      unanswered: false,
      questionNumber: answer?.detectedLabel ?? "?",
      questionSubpart: undefined as string | undefined,
    };
  }, [
    answersByQuestion,
    result.answers,
    result.questions,
    selected,
    unansweredIds,
  ]);

  const pageCount = Math.max(result.answerSheetPages.length, 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-page">
      <div className="flex justify-center px-4 py-3 md:hidden">
        <div className="flex rounded-full bg-line p-1">
          <button
            type="button"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mobilePane === "questions" ? "bg-ink text-white" : "text-muted"
            }`}
            onClick={() => onMobilePaneChange("questions")}
          >
            Questions
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mobilePane === "sheet" ? "bg-ink text-white" : "text-muted"
            }`}
            onClick={() => onMobilePaneChange("sheet")}
          >
            Answer Sheet
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 p-4 pt-0 md:pt-4">
        <div
          className={`min-h-0 w-full flex-col md:w-[min(440px,42%)] ${
            mobilePane === "questions" ? "flex" : "hidden"
          } md:flex`}
        >
          <QuestionList
            questions={result.questions}
            answers={result.answers}
            unmatchedAnswerIds={result.unmatchedAnswerIds}
            grading={result.grading}
            selected={selected}
            onSelect={onSelect}
          />
        </div>

        <div
          className={`min-h-0 w-full flex-1 flex-col ${
            mobilePane === "sheet" ? "flex" : "hidden"
          } md:flex`}
        >
          <AnswerSheetViewer
            jobId={jobId}
            pageCount={pageCount}
            selectedRegions={viewer.regions}
            questionNumber={viewer.questionNumber}
            questionSubpart={viewer.questionSubpart}
            unanswered={viewer.unanswered}
          />
        </div>
      </div>
    </div>
  );
}
