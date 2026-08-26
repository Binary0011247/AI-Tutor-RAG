export type JobStatus =
  | "queued"
  | "converting"
  | "extracting_questions"
  | "extracting_answers"
  | "mapping"
  | "grading"
  | "done"
  | "error";

export interface Job {
  id: string;
  status: JobStatus;
  progress: number; // 0-100, coarse is fine
  createdAt: number;
  error?: string;
  warnings: string[]; // partial-failure messages, never silent
  result?: PipelineResult;
}

export interface Question {
  id: string; // stable slug, e.g. "q11-a"
  number: string; // "11" — printed number, exactly as shown
  subpart?: string; // "a"
  text: string;
  page: number; // page index in question paper (0-based)
}

export interface AnswerRegion {
  page: number; // page index in answer sheet (0-based)
  bbox: [number, number, number, number]; // [xMin,yMin,xMax,yMax] normalized 0-1000
}

export interface RawAnswerBlock {
  page: number;
  detectedLabel: string | null;
  transcript: string;
  bbox: [number, number, number, number];
  confidence: number;
}

export interface MappedAnswer {
  id: string;
  detectedLabel: string | null; // raw label the model read, e.g. "Q11 (a)"; null if unreadable
  questionId: string | null; // null => unmatched answer, must show in "unmapped" panel
  transcript: string;
  regions: AnswerRegion[]; // >1 entry => multi-page answer
  confidence: number; // 0-1, model or matcher confidence
  matchMethod: "exact" | "fuzzy" | "llm" | "none";
}

export interface PipelineResult {
  questions: Question[];
  answers: MappedAnswer[];
  unansweredQuestionIds: string[]; // derived: questions with no MappedAnswer
  unmatchedAnswerIds: string[]; // derived: answers with questionId === null
  questionPaperPages: string[]; // image URLs/paths, one per page
  answerSheetPages: string[]; // image URLs/paths, one per page
  rawAnswerBlocks?: RawAnswerBlock[]; // Stage 3 output, before mapping
  grading?: GradingResult; // optional, populated only if grading stage ran
}

export interface GradingResult {
  perQuestion: Record<
    string,
    { score: number; maxScore: number; feedback: string; correct: boolean | "partial" }
  >;
  overallFeedback: string;
  totalScore: number;
  maxScore: number;
}

export type QuestionGrade = GradingResult["perQuestion"][string];
