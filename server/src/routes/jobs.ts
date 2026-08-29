import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { extractAnswers } from "../services/extractAnswers";
import { extractQuestions } from "../services/extractQuestions";
import { gradeAnswers } from "../services/grade";
import { mapAnswers } from "../services/mapAnswers";
import { rasterizeFile } from "../services/rasterize";
import { createJob, getJob, pruneExpiredJobs, updateJob } from "../store/jobStore";
import {
  deletePages,
  getPage,
  setPages,
  type PageKind,
} from "../store/pageStore";
import {
  getCachedPipeline,
  hashUploadPair,
  setCachedPipeline,
} from "../store/resultCache";
import type { GradeOverride, PipelineResult } from "../types";

const JOB_TTL_MS = Number(process.env.JOB_TTL_MS) || 3_600_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 2 },
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many uploads. Maximum 10 jobs per minute per IP.",
  },
});

type UploadedFields = {
  questionPaper?: Express.Multer.File[];
  answerSheet?: Express.Multer.File[];
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function pageUrls(jobId: string, kind: PageKind, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `/api/jobs/${jobId}/pages/${kind}/${i}`
  );
}

function logJobEvent(
  jobId: string,
  event: string,
  extra: Record<string, unknown> = {}
): void {
  console.log(JSON.stringify({ event, jobId, ts: Date.now(), ...extra }));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function logJobDuration(
  jobId: string,
  outcome: "complete" | "failed" | "cached",
  totalMs: number,
  stages: Record<string, number>,
  extra: Record<string, unknown> = {}
): void {
  const stageParts = Object.entries(stages).map(
    ([name, ms]) => `${name}=${formatDuration(ms)}`
  );
  console.log(
    `[job ${jobId}] ${outcome} total=${formatDuration(totalMs)}` +
      (stageParts.length ? ` | ${stageParts.join(" | ")}` : "")
  );
  logJobEvent(
    jobId,
    outcome === "failed" ? "job_failed" : "job_complete",
    {
      cached: outcome === "cached",
      totalMs,
      stages,
      ...extra,
    }
  );
}

async function timed<T>(
  jobId: string,
  stage: string,
  fn: () => Promise<T>
): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  try {
    const value = await fn();
    const ms = Date.now() - started;
    logJobEvent(jobId, "stage", { stage, ms, ok: true });
    return { value, ms };
  } catch (err) {
    const ms = Date.now() - started;
    logJobEvent(jobId, "stage", {
      stage,
      ms,
      ok: false,
      error: errorMessage(err),
    });
    throw err;
  }
}

async function processJob(
  jobId: string,
  questionPaper: { buffer: Buffer; mimeType: string },
  answerSheet: { buffer: Buffer; mimeType: string }
): Promise<void> {
  const pipelineStarted = Date.now();
  const stageMs: Record<string, number> = {};
  const cacheKey = hashUploadPair(questionPaper.buffer, answerSheet.buffer);
  const hashPrefix = cacheKey.slice(0, 8);
  console.log(
    `[cache] job start jobId=${jobId} pairSha256=${cacheKey} source=file-bytes-only`
  );
  logJobEvent(jobId, "job_start", {
    pairSha256: cacheKey,
    cacheKeySource: "sha256(questionPaperBytes + NUL + answerSheetBytes)",
  });

  try {
    updateJob(jobId, { status: "converting", progress: 15 });

    const { value: rasterized, ms: convertingMs } = await timed(
      jobId,
      "converting",
      () =>
        Promise.all([
          rasterizeFile(questionPaper.buffer, questionPaper.mimeType),
          rasterizeFile(answerSheet.buffer, answerSheet.mimeType),
        ])
    );
    stageMs.converting = convertingMs;
    const [questionPaperPages, answerSheetPages] = rasterized;

    const cached = getCachedPipeline(cacheKey);
    if (cached) {
      console.log(
        `[cache] HIT jobId=${jobId} prefix=${hashPrefix} — skipping Gemini`
      );
      setPages(jobId, cached.pages);
      const result: PipelineResult = {
        ...cached.result,
        questionPaperPages: pageUrls(
          jobId,
          "questionPaper",
          cached.pages.questionPaper.length
        ),
        answerSheetPages: pageUrls(
          jobId,
          "answerSheet",
          cached.pages.answerSheet.length
        ),
      };
      updateJob(jobId, {
        status: "done",
        progress: 100,
        result,
        warnings: [
          ...cached.warnings,
          "Reused cached extraction for identical uploads (no Gemini calls).",
        ],
      });
      logJobDuration(jobId, "cached", Date.now() - pipelineStarted, stageMs);
      return;
    }

    console.log(
      `[cache] MISS jobId=${jobId} prefix=${hashPrefix} — running pipeline`
    );

    setPages(jobId, {
      questionPaper: questionPaperPages,
      answerSheet: answerSheetPages,
    });

    const result: PipelineResult = {
      questions: [],
      answers: [],
      unansweredQuestionIds: [],
      unmatchedAnswerIds: [],
      questionPaperPages: pageUrls(jobId, "questionPaper", questionPaperPages.length),
      answerSheetPages: pageUrls(jobId, "answerSheet", answerSheetPages.length),
      rawAnswerBlocks: [],
    };

    updateJob(jobId, {
      status: "extracting_questions",
      progress: 40,
      result,
    });

    const questionsP = timed(jobId, "extracting_questions", () =>
      extractQuestions(questionPaperPages, hashPrefix)
    ).then((r) => {
      updateJob(jobId, {
        status: "extracting_answers",
        progress: 70,
        result: { ...result, questions: r.value.questions },
      });
      return r;
    });
    const answersP = timed(jobId, "extracting_answers", () =>
      extractAnswers(answerSheetPages, hashPrefix)
    );

    const [qSettled, aSettled] = await Promise.allSettled([
      questionsP,
      answersP,
    ]);
    if (qSettled.status === "rejected") throw qSettled.reason;
    if (aSettled.status === "rejected") throw aSettled.reason;

    const questionsResult = qSettled.value;
    stageMs.extracting_questions = questionsResult.ms;
    const { questions, warnings: questionWarnings } = questionsResult.value;
    result.questions = questions;
    if (questionWarnings.length) {
      const current = getJob(jobId);
      updateJob(jobId, {
        warnings: [...(current?.warnings ?? []), ...questionWarnings],
      });
    }
    if (questions.length === 0 && questionPaperPages.length > 0) {
      throw new Error(
        questionWarnings[0] ??
          "No questions could be extracted from the question paper."
      );
    }

    updateJob(jobId, {
      status: "extracting_answers",
      progress: 70,
      result,
    });

    const answersExtract = aSettled.value;
    stageMs.extracting_answers = answersExtract.ms;
    const { blocks: rawAnswerBlocks, warnings: answerWarnings } =
      answersExtract.value;
    result.rawAnswerBlocks = rawAnswerBlocks;
    console.log(
      `[extractAnswers] jobId=${jobId} rawAnswerBlocks=${rawAnswerBlocks.length} pairSha256=${cacheKey}`
    );
    if (answerWarnings.length) {
      const current = getJob(jobId);
      updateJob(jobId, {
        warnings: [...(current?.warnings ?? []), ...answerWarnings],
      });
    }
    if (
      rawAnswerBlocks.length === 0 &&
      answerSheetPages.length > 0 &&
      answerWarnings.length > 0
    ) {
      throw new Error(
        answerWarnings[0] ??
          "No answers could be extracted from the answer sheet."
      );
    }
    updateJob(jobId, { result, progress: 80 });

    updateJob(jobId, { status: "mapping", progress: 90, result });

    const mapped = await timed(jobId, "mapping", () =>
      mapAnswers(questions, rawAnswerBlocks, hashPrefix)
    );
    stageMs.mapping = mapped.ms;
    const answers = mapped.value;
    const matchedQuestionIds = new Set(
      answers
        .map((answer) => answer.questionId)
        .filter((id): id is string => id !== null)
    );
    result.answers = answers;
    result.unansweredQuestionIds = questions
      .filter((question) => !matchedQuestionIds.has(question.id))
      .map((question) => question.id);
    result.unmatchedAnswerIds = answers
      .filter((answer) => answer.questionId === null)
      .map((answer) => answer.id);

    updateJob(jobId, { status: "grading", progress: 95, result });

    try {
      const graded = await timed(jobId, "grading", () =>
        gradeAnswers(questions, answers, hashPrefix)
      );
      stageMs.grading = graded.ms;
      result.grading = graded.value;
    } catch (err) {
      const message = errorMessage(err);
      console.error(`job ${jobId} grading failed: ${message}`);
      const current = getJob(jobId);
      updateJob(jobId, {
        warnings: [
          ...(current?.warnings ?? []),
          `Grading failed: ${message}`,
        ],
      });
    }

    updateJob(jobId, { status: "done", progress: 100, result });
    const finished = getJob(jobId);
    const hasPartialExtraction = (finished?.warnings ?? []).some((warning) =>
      warning.startsWith("Answer extraction failed on pages")
    );
    if (!hasPartialExtraction) {
      setCachedPipeline(cacheKey, {
        result,
        pages: {
          questionPaper: questionPaperPages,
          answerSheet: answerSheetPages,
        },
        warnings: finished?.warnings ?? [],
      });
    } else {
      console.log(
        `[cache] skip store jobId=${jobId} prefix=${hashPrefix} — partial answer extraction`
      );
    }
    logJobDuration(jobId, "complete", Date.now() - pipelineStarted, stageMs);
  } catch (err) {
    const message = errorMessage(err);
    console.error(`job ${jobId} failed: ${message}`);
    updateJob(jobId, { status: "error", progress: 0, error: message });
    logJobDuration(jobId, "failed", Date.now() - pipelineStarted, stageMs, {
      error: message,
    });
  }
}

function servePage(kind: PageKind) {
  return (req: Request, res: Response): void => {
    const id = routeParam(req.params.id);
    const n = Number.parseInt(routeParam(req.params.n), 10);
    if (!id || !Number.isInteger(n) || n < 0) {
      res.status(400).json({ error: "Invalid job id or page index" });
      return;
    }

    if (!getJob(id)) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const image = getPage(id, kind, n);
    if (!image) {
      res.status(404).json({ error: "Page not found" });
      return;
    }

    res.type("png").send(image);
  };
}

const router = Router();

router.post(
  "/",
  uploadLimiter,
  upload.fields([
    { name: "questionPaper", maxCount: 1 },
    { name: "answerSheet", maxCount: 1 },
  ]),
  (req, res) => {
    const files = req.files as UploadedFields | undefined;
    const questionPaper = files?.questionPaper?.[0];
    const answerSheet = files?.answerSheet?.[0];

    if (!questionPaper || !answerSheet) {
      res.status(400).json({
        error: "Both questionPaper and answerSheet files are required",
      });
      return;
    }

    const job = createJob();
    res.json({ jobId: job.id });

    void processJob(
      job.id,
      {
        buffer: Buffer.from(questionPaper.buffer),
        mimeType: questionPaper.mimetype,
      },
      {
        buffer: Buffer.from(answerSheet.buffer),
        mimeType: answerSheet.mimetype,
      }
    );
  }
);

router.get("/:id/pages/questionPaper/:n", servePage("questionPaper"));
router.get("/:id/pages/answerSheet/:n", servePage("answerSheet"));

router.patch("/:id/grade-overrides", (req, res) => {
  const id = routeParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Job id is required" });
    return;
  }

  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.status !== "done" || !job.result) {
    res.status(409).json({ error: "Job is not ready for grade edits" });
    return;
  }

  const body = req.body as {
    questionId?: unknown;
    score?: unknown;
    feedback?: unknown;
  };
  const questionId =
    typeof body.questionId === "string" ? body.questionId.trim() : "";
  if (!questionId) {
    res.status(400).json({ error: "questionId is required" });
    return;
  }
  const question = job.result.questions.find((item) => item.id === questionId);
  if (!question) {
    res.status(400).json({ error: "Unknown questionId" });
    return;
  }

  const original = job.result.grading?.perQuestion[questionId];
  const patch: GradeOverride = { ...(job.gradeOverrides?.[questionId] ?? {}) };

  if (body.score !== undefined) {
    const raw = Number(body.score);
    if (!Number.isFinite(raw)) {
      res.status(400).json({ error: "score must be a number" });
      return;
    }
    const maxScore = original?.maxScore ?? Math.max(0, Math.round(raw));
    patch.score = Math.min(maxScore, Math.max(0, Math.round(raw)));
  }
  if (body.feedback !== undefined) {
    if (typeof body.feedback !== "string") {
      res.status(400).json({ error: "feedback must be a string" });
      return;
    }
    patch.feedback = body.feedback;
  }

  const gradeOverrides = {
    ...(job.gradeOverrides ?? {}),
    [questionId]: patch,
  };
  const updated = updateJob(id, { gradeOverrides });
  res.json({ gradeOverrides: updated.gradeOverrides });
});

router.get("/:id", (req, res) => {
  const id = routeParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Job id is required" });
    return;
  }
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

setInterval(() => {
  for (const id of pruneExpiredJobs(JOB_TTL_MS)) {
    deletePages(id);
  }
}, 60_000).unref();

export default router;
