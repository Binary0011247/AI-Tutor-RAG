import { callGeminiJSON } from "./gemini";
import type { GradingResult, MappedAnswer, Question } from "../types";

type GradeEntry = GradingResult["perQuestion"][string];

const SCHEMA = `[
  {
    "questionId": "string — must match the input questionId",
    "score": 0,
    "maxScore": 0,
    "correct": "true | false | \\"partial\\"",
    "feedback": "string — 1-2 sentences, specific and constructive"
  }
]`;

export function inferMaxScore(question: Question): number {
  const text = question.text.toLowerCase();
  const complex =
    /(diagram|draw|explain|show that|calculate|hence|derive|compare|discuss|justify)/.test(
      text
    ) || text.length > 180;
  if (complex) return 5;
  const shortRecall =
    /^(define|state|what is|name|list|give one)\b/.test(text.trim()) ||
    text.length < 80;
  if (shortRecall) return 2;
  return 3;
}

function unansweredEntry(question: Question): GradeEntry {
  return {
    score: 0,
    maxScore: inferMaxScore(question),
    correct: false,
    feedback: "Not answered.",
  };
}

function asArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.grades)) return obj.grades;
    if (Array.isArray(obj.results)) return obj.results;
  }
  throw new Error("Grading did not return a JSON array");
}

function parseCorrect(value: unknown): boolean | "partial" {
  if (value === "partial") return "partial";
  if (typeof value === "string" && value.toLowerCase() === "partial") {
    return "partial";
  }
  if (value === true || value === "true") return true;
  return false;
}

function parseEntry(
  raw: unknown,
  fallbackId: string,
  fallbackMax: number
): { questionId: string; entry: GradeEntry } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const questionId =
    obj.questionId === null || obj.questionId === undefined
      ? fallbackId
      : String(obj.questionId).trim() || fallbackId;

  const maxScoreRaw = Number(obj.maxScore);
  const maxScore =
    Number.isFinite(maxScoreRaw) && maxScoreRaw > 0
      ? maxScoreRaw
      : fallbackMax;

  const scoreRaw = Number(obj.score);
  const score = Number.isFinite(scoreRaw)
    ? Math.min(maxScore, Math.max(0, scoreRaw))
    : 0;

  const feedback =
    obj.feedback === null || obj.feedback === undefined
      ? "No feedback provided."
      : String(obj.feedback).trim() || "No feedback provided.";

  return {
    questionId,
    entry: {
      score,
      maxScore,
      correct: parseCorrect(obj.correct),
      feedback,
    },
  };
}

function firstAnswerByQuestion(answers: MappedAnswer[]): Map<string, MappedAnswer> {
  const map = new Map<string, MappedAnswer>();
  for (const answer of answers) {
    if (answer.questionId && !map.has(answer.questionId)) {
      map.set(answer.questionId, answer);
    }
  }
  return map;
}

async function gradeAnswered(
  pairs: { question: Question; answer: MappedAnswer }[],
  hashPrefix: string
): Promise<Map<string, GradeEntry>> {
  const graded = new Map<string, GradeEntry>();
  if (pairs.length === 0) return graded;

  const prompt = [
    "Grade each student answer against its question.",
    "Return a JSON array with exactly one object per input item, in the same order.",
    "Each object: { questionId, score, maxScore, correct, feedback }.",
    "Rules:",
    "- maxScore should be a reasonable point value inferred from the question's apparent complexity (short factual recall ~2, multi-part explanation or diagram ~5). Pick per-question; do not hardcode a single scale.",
    '- correct must be true, false, or the string "partial".',
    "- feedback must be 1-2 sentences, specific to what the student wrote, constructive in tone.",
    "- score must never exceed maxScore, and must be >= 0.",
    "- Unmatched or blank working should score low and say what was missing.",
    "",
    "Items to grade:",
    JSON.stringify(
      pairs.map(({ question, answer }) => ({
        questionId: question.id,
        questionText: question.text,
        number: question.number,
        subpart: question.subpart ?? null,
        transcript: answer.transcript,
      }))
    ),
  ].join("\n");

  console.log(
    `[gemini] stage=grading pairs=${pairs.length} hash=${hashPrefix}`
  );
  const raw = await callGeminiJSON(prompt, [], SCHEMA);
  const rows = asArray(raw);

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (!pair) continue;
    const parsed = parseEntry(rows[i], pair.question.id, inferMaxScore(pair.question));
    if (!parsed) continue;
    graded.set(pair.question.id, parsed.entry);
  }

  if (graded.size === 0) {
    throw new Error("Grading returned no usable entries");
  }

  return graded;
}

function overallFeedback(
  perQuestion: GradingResult["perQuestion"],
  totalScore: number,
  maxScore: number
): string {
  const entries = Object.values(perQuestion);
  const unanswered = entries.filter((e) => e.feedback === "Not answered.").length;
  const parts: string[] = [`Scored ${totalScore} / ${maxScore}.`];
  if (unanswered > 0) {
    parts.push(
      `${unanswered} question${unanswered === 1 ? " was" : "s were"} not answered.`
    );
  }
  return parts.join(" ");
}

export async function gradeAnswers(
  questions: Question[],
  answers: MappedAnswer[],
  hashPrefix = "unknown"
): Promise<GradingResult> {
  const byQuestion = firstAnswerByQuestion(answers);
  const perQuestion: GradingResult["perQuestion"] = {};
  const answeredPairs: { question: Question; answer: MappedAnswer }[] = [];

  for (const question of questions) {
    const mapped = byQuestion.get(question.id);
    if (!mapped) {
      perQuestion[question.id] = unansweredEntry(question);
    } else {
      answeredPairs.push({ question, answer: mapped });
    }
  }

  if (answeredPairs.length > 0) {
    const graded = await gradeAnswered(answeredPairs, hashPrefix);
    for (const pair of answeredPairs) {
      const entry = graded.get(pair.question.id);
      perQuestion[pair.question.id] = entry ?? {
        score: 0,
        maxScore: inferMaxScore(pair.question),
        correct: false,
        feedback: "Grading was unavailable for this question.",
      };
    }
  }

  let totalScore = 0;
  let maxScore = 0;
  for (const entry of Object.values(perQuestion)) {
    totalScore += entry.score;
    maxScore += entry.maxScore;
  }

  return {
    perQuestion,
    overallFeedback: overallFeedback(perQuestion, totalScore, maxScore),
    totalScore,
    maxScore,
  };
}
