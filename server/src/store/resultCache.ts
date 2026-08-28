import { createHash } from "crypto";
import type { PipelineResult } from "../types";
import type { StoredPages } from "./pageStore";

export interface CachedPipeline {
  result: PipelineResult;
  pages: StoredPages;
  warnings: string[];
}

const cache = new Map<string, CachedPipeline>();

/** sha256 of question-paper bytes + NUL + answer-sheet bytes. No timestamps or IDs. */
export function hashUploadPair(
  questionPaper: Buffer,
  answerSheet: Buffer
): string {
  return createHash("sha256")
    .update(questionPaper)
    .update("\0")
    .update(answerSheet)
    .digest("hex");
}

function clonePages(pages: StoredPages): StoredPages {
  return {
    questionPaper: pages.questionPaper.map((page) => Buffer.from(page)),
    answerSheet: pages.answerSheet.map((page) => Buffer.from(page)),
  };
}

export function getCachedPipeline(hash: string): CachedPipeline | undefined {
  const hit = cache.get(hash);
  if (!hit) return undefined;
  return {
    result: structuredClone(hit.result),
    pages: clonePages(hit.pages),
    warnings: [...hit.warnings],
  };
}

export function setCachedPipeline(hash: string, value: CachedPipeline): void {
  cache.set(hash, {
    result: structuredClone(value.result),
    pages: clonePages(value.pages),
    warnings: [...value.warnings],
  });
}
