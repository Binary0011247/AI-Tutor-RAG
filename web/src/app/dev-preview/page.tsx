"use client";

import { useMemo, useState } from "react";
import { AnswerSheetViewer } from "@/components/AnswerSheetViewer";
import { QuestionCard } from "@/components/QuestionCard";
import { ScorePill } from "@/components/ScorePill";
import type { MappedAnswer, Question, QuestionGrade } from "@/types";

type GradeOverride = { score?: number; feedback?: string };

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

const QUESTIONS: Question[] = [
  {
    id: "q1",
    number: "1",
    text: "Define photosynthesis and state its chemical equation.",
    page: 0,
  },
  {
    id: "q2",
    number: "2",
    text: "What is osmosis? Give one everyday example.",
    page: 0,
  },
  {
    id: "q11-a",
    number: "11",
    subpart: "a",
    text: "Calculate the kinetic energy of the particle when its speed is 4.0 m/s.",
    page: 0,
  },
  {
    id: "q11-b",
    number: "11",
    subpart: "b",
    text: "Show that the work done by the force equals the change in kinetic energy, and determine the final speed.",
    page: 0,
  },
];

const GRADES: Record<string, QuestionGrade> = {
  q1: {
    score: 0,
    maxScore: 2,
    correct: false,
    feedback: "Not answered.",
  },
  q2: {
    score: 2,
    maxScore: 2,
    correct: true,
    feedback:
      "Accurate definition of osmosis with a clear everyday example. Full marks.",
  },
  "q11-a": {
    score: 2,
    maxScore: 2,
    correct: true,
    feedback: "Correct substitution into ½mv² with the right units.",
  },
  "q11-b": {
    score: 3,
    maxScore: 5,
    correct: "partial",
    feedback:
      "Working across both pages reaches the right final speed, but the work–energy principle is not stated in words.",
  },
};

const ANSWERS: MappedAnswer[] = [
  {
    id: "a-q2",
    detectedLabel: "Q2",
    questionId: "q2",
    transcript: "Osmosis is the movement of water… raisins swelling in water.",
    regions: [{ page: 0, bbox: [70, 100, 920, 230] }],
    confidence: 0.95,
    matchMethod: "exact",
  },
  {
    id: "a-q11-a",
    detectedLabel: "Q11 (a)",
    questionId: "q11-a",
    transcript: "KE = 1/2 m v^2 = 16 J",
    regions: [{ page: 0, bbox: [70, 290, 780, 370] }],
    confidence: 0.94,
    matchMethod: "exact",
  },
  {
    id: "a-q11-b",
    detectedLabel: "Q11 (b)",
    questionId: "q11-b",
    transcript: "F = 6.0 N… Final speed = 13 m/s.",
    regions: [
      { page: 0, bbox: [70, 460, 920, 600] },
      { page: 1, bbox: [70, 95, 920, 210] },
    ],
    confidence: 0.9,
    matchMethod: "exact",
  },
];

const PAGE_SRCS = ["/mock-answer-p1.svg", "/mock-answer-p2.svg"];

export default function DevPreviewPage() {
  const [selectedId, setSelectedId] = useState("q2");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    q2: true,
  });
  const [overrides, setOverrides] = useState<Record<string, GradeOverride>>({});

  const selected = QUESTIONS.find((question) => question.id === selectedId);
  const selectedAnswer = ANSWERS.find((answer) => answer.questionId === selectedId);
  const unanswered = selectedId === "q1";

  const selectedRegions = useMemo(
    () => (unanswered ? [] : selectedAnswer?.regions ?? []),
    [selectedAnswer, unanswered]
  );

  const totals = useMemo(() => {
    let totalScore = 0;
    let maxScore = 0;
    for (const question of QUESTIONS) {
      const grade = applyOverride(GRADES[question.id], overrides[question.id]);
      if (!grade) continue;
      totalScore += grade.score;
      maxScore += grade.maxScore;
    }
    return { totalScore, maxScore };
  }, [overrides]);

  const patchOverride = (questionId: string, patch: GradeOverride) => {
    setOverrides((current) => ({
      ...current,
      [questionId]: { ...current[questionId], ...patch },
    }));
  };

  return (
    <main className="min-h-screen bg-page px-4 py-6 text-ink sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Dev preview · mock data
        </p>
        <h1 className="mt-1 text-2xl font-bold">Mapping components</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Score pills (green / amber / red), question cards with sub-part badges,
          AI Feedback, orange selection, and a green highlight overlay with page
          nav for multi-page answers.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <ScorePill score={2} maxScore={2} />
          <ScorePill score={3} maxScore={5} />
          <ScorePill score={0} maxScore={2} />
          <ScorePill score={1} maxScore={2} edited />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(320px,2fr)_minmax(360px,3fr)] lg:items-start">
          <div className="space-y-3">
            <h2 className="text-base font-bold">
              Extracted Questions (from question paper)
            </h2>
            <p className="text-sm text-muted">
              {totals.totalScore}/{totals.maxScore} · Scored {totals.totalScore}/
              {totals.maxScore}
            </p>
            {QUESTIONS.map((question) => {
              const original = GRADES[question.id];
              const override = overrides[question.id];
              const grade = applyOverride(original, override);
              return (
                <QuestionCard
                  key={question.id}
                  question={question}
                  grade={grade}
                  edited={
                    override?.score != null && original?.score !== override.score
                  }
                  feedbackEdited={
                    override?.feedback != null &&
                    original?.feedback !== override.feedback
                  }
                  selected={question.id === selectedId}
                  expanded={Boolean(expanded[question.id])}
                  onSelect={() => {
                    setSelectedId(question.id);
                    setExpanded((current) => ({
                      ...current,
                      [question.id]: true,
                    }));
                  }}
                  onToggleExpand={() =>
                    setExpanded((current) => ({
                      ...current,
                      [question.id]: !current[question.id],
                    }))
                  }
                  onScoreChange={(score) => patchOverride(question.id, { score })}
                  onFeedbackChange={(feedback) =>
                    patchOverride(question.id, { feedback })
                  }
                />
              );
            })}
          </div>

          <div className="h-[min(80vh,840px)]">
            <AnswerSheetViewer
              jobId="preview"
              pageCount={2}
              pageSrcs={PAGE_SRCS}
              selectedRegions={selectedRegions}
              questionNumber={selected?.number}
              questionSubpart={selected?.subpart}
              unanswered={unanswered}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
