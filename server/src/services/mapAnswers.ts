import { randomUUID } from "crypto";
import { distance } from "fastest-levenshtein";
import { callGeminiJSON, GeminiDailyQuotaError } from "./gemini";
import type {
  MappedAnswer,
  Question,
  RawAnswerBlock,
} from "../types";

const CONTINUATION = "__continuation__";
const MAX_FUZZY_DISTANCE = 2;
const MIN_LLM_CONFIDENCE = 0.5;

interface StitchedBlock {
  detectedLabel: string | null;
  transcript: string;
  regions: { page: number; bbox: [number, number, number, number] }[];
  confidence: number;
}

interface PendingAnswer {
  block: StitchedBlock;
  questionId: string | null;
  matchMethod: MappedAnswer["matchMethod"];
  confidence: number;
}

export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^question\s+/, "")
    .replace(/^q\.?\s*/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function questionKey(question: Question): string {
  return normalizeKey(
    [question.number, question.subpart ?? ""].filter(Boolean).join(" ")
  );
}

function uniqueQuestionKeys(questions: Question[]): Map<string, string> {
  const buckets = new Map<string, string[]>();
  for (const question of questions) {
    const key = questionKey(question);
    if (!key) continue;
    const ids = buckets.get(key) ?? [];
    ids.push(question.id);
    buckets.set(key, ids);
  }

  const unique = new Map<string, string>();
  for (const [key, ids] of buckets) {
    if (ids.length === 1 && ids[0]) {
      unique.set(key, ids[0]);
    }
  }
  return unique;
}

function stitchContinuations(rawBlocks: RawAnswerBlock[]): StitchedBlock[] {
  const ordered = rawBlocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.page - b.block.page || a.index - b.index)
    .map(({ block }) => block);

  const stitched: StitchedBlock[] = [];

  for (const block of ordered) {
    const isContinuation =
      (block.detectedLabel ?? "").trim().toLowerCase() === CONTINUATION;

    if (isContinuation) {
      const previous = stitched[stitched.length - 1];
      if (previous) {
        previous.regions.push({ page: block.page, bbox: block.bbox });
        previous.transcript = [previous.transcript, block.transcript]
          .filter((part) => part.length > 0)
          .join(" ");
        previous.confidence = Math.min(previous.confidence, block.confidence);
      } else {
        stitched.push({
          detectedLabel: null,
          transcript: block.transcript,
          regions: [{ page: block.page, bbox: block.bbox }],
          confidence: block.confidence,
        });
      }
      continue;
    }

    stitched.push({
      detectedLabel: block.detectedLabel,
      transcript: block.transcript,
      regions: [{ page: block.page, bbox: block.bbox }],
      confidence: block.confidence,
    });
  }

  return stitched;
}

function exactMatch(
  key: string,
  keys: Map<string, string>
): string | undefined {
  return keys.get(key);
}

/** "11", "11a", "12ii" — fuzzy here maps 11→12 or 11a→11b. */
function isQuestionNumberLike(key: string): boolean {
  if (!key) return false;
  if (key.length <= 2) return true;
  return /^\d+[a-z]{0,3}$/.test(key);
}

function numberPrefix(key: string): string | null {
  const match = key.match(/^(\d+)/);
  return match?.[1] ?? null;
}

function candidateQuestions(questions: Question[], key: string): Question[] {
  const prefix = numberPrefix(key);
  if (!prefix) return questions;
  const matches = questions.filter(
    (question) => normalizeKey(question.number) === prefix
  );
  return matches.length > 0 ? matches : questions;
}

function fuzzyMatch(
  key: string,
  keys: Map<string, string>
): string | undefined {
  if (!key || isQuestionNumberLike(key)) return undefined;

  let bestId: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let ties = 0;

  for (const [candidate, questionId] of keys) {
    const d = distance(key, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      bestId = questionId;
      ties = 1;
    } else if (d === bestDistance) {
      ties += 1;
    }
  }

  if (bestId && ties === 1 && bestDistance <= MAX_FUZZY_DISTANCE) {
    return bestId;
  }
  return undefined;
}

function asArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.matches)) return obj.matches;
    if (Array.isArray(obj.results)) return obj.results;
  }
  throw new Error("Mapping LLM did not return a JSON array");
}

function parseLlmQuestionId(
  value: unknown,
  validIds: Set<string>
): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  if (!id || id.toLowerCase() === "null" || id.toLowerCase() === "none") {
    return null;
  }
  return validIds.has(id) ? id : null;
}

async function llmMatch(
  questions: Question[],
  unmatched: PendingAnswer[],
  hashPrefix: string
): Promise<void> {
  if (unmatched.length === 0) return;

  const schema = `[
  {
    "questionId": "string | null — must be one of the provided question ids, or null if none fit",
    "confidence": 0.0
  }
]`;

  const prompt = [
    "You are matching student answer blocks to questions from a question paper.",
    "Return a JSON array with exactly one object per unmatched answer block, in the same order as the blocks listed below.",
    "Each object: { questionId, confidence }.",
    "- questionId must be an id from that block's candidateIds (or the full question list if candidateIds is omitted), or null if you cannot tell. Do not guess.",
    "- If candidateIds has more than one id (e.g. 11a vs 11b) and the student only wrote the parent number, pick a sub-part only when the transcript clearly fits that sub-part; otherwise null.",
    "- Never assign a parent-only label like \"11\" to a different question number (not 12, not 1).",
    "- confidence is 0-1 for that match. Use a low value if unsure. Omit or use 0 if you return null.",
    "- Use the detectedLabel when present; otherwise use the transcript.",
    "- Prefer a sub-part match (e.g. 11a vs 11b) over the parent number alone when the label includes the sub-part.",
    "",
    "Questions:",
    JSON.stringify(
      questions.map((q) => ({
        id: q.id,
        number: q.number,
        subpart: q.subpart ?? null,
        text: q.text,
      }))
    ),
    "",
    "Unmatched answer blocks (in order):",
    JSON.stringify(
      unmatched.map((item, index) => {
        const key = item.block.detectedLabel
          ? normalizeKey(item.block.detectedLabel)
          : "";
        const candidates = key
          ? candidateQuestions(questions, key)
          : questions;
        return {
          index,
          detectedLabel: item.block.detectedLabel,
          transcript: item.block.transcript,
          candidateIds: candidates.map((question) => question.id),
        };
      })
    ),
  ].join("\n");

  console.log(
    `[gemini] stage=mapping (LLM fallback) unmatched=${unmatched.length} hash=${hashPrefix}`
  );
  const raw = await callGeminiJSON(prompt, [], schema);
  const rows = asArray(raw);

  for (let i = 0; i < unmatched.length; i++) {
    const pending = unmatched[i];
    if (!pending) continue;
    const row = rows[i];
    const entry =
      row && typeof row === "object" ? (row as Record<string, unknown>) : {};

    const key = pending.block.detectedLabel
      ? normalizeKey(pending.block.detectedLabel)
      : "";
    const allowed = new Set(
      (key ? candidateQuestions(questions, key) : questions).map((q) => q.id)
    );
    const questionId = parseLlmQuestionId(entry.questionId, allowed);
    const reported = Number(entry.confidence);
    const confidence = Number.isFinite(reported)
      ? Math.min(1, Math.max(0, reported))
      : 0;

    if (questionId && confidence >= MIN_LLM_CONFIDENCE) {
      pending.questionId = questionId;
      pending.matchMethod = "llm";
      pending.confidence = confidence;
    } else {
      pending.questionId = null;
      pending.matchMethod = "none";
      if (questionId && confidence < MIN_LLM_CONFIDENCE) {
        console.warn(
          `[mapAnswers] rejected low-confidence LLM match ${questionId} confidence=${confidence}`
        );
      }
    }
  }
}

function toMappedAnswer(pending: PendingAnswer): MappedAnswer {
  return {
    id: randomUUID(),
    detectedLabel: pending.block.detectedLabel,
    questionId: pending.questionId,
    transcript: pending.block.transcript,
    regions: pending.block.regions,
    confidence: pending.confidence,
    matchMethod: pending.matchMethod,
  };
}

const MATCH_RANK: Record<MappedAnswer["matchMethod"], number> = {
  exact: 3,
  fuzzy: 2,
  llm: 1,
  none: 0,
};

function regionKey(region: {
  page: number;
  bbox: [number, number, number, number];
}): string {
  return `${region.page}:${region.bbox.join(",")}`;
}

function sortRegions(
  regions: StitchedBlock["regions"]
): StitchedBlock["regions"] {
  return [...regions].sort(
    (a, b) => a.page - b.page || a.bbox[1] - b.bbox[1]
  );
}

function firstRegion(
  block: StitchedBlock
): StitchedBlock["regions"][number] | undefined {
  return sortRegions(block.regions)[0];
}

function lastRegion(
  block: StitchedBlock
): StitchedBlock["regions"][number] | undefined {
  const ordered = sortRegions(block.regions);
  return ordered[ordered.length - 1];
}

function isUnlabeledOrContinuation(label: string | null): boolean {
  if (label == null) return true;
  const text = label.trim().toLowerCase();
  return (
    text === "" ||
    text === "null" ||
    text === "none" ||
    text === CONTINUATION
  );
}

function isExplicitContinuation(label: string | null): boolean {
  return (label ?? "").trim().toLowerCase() === CONTINUATION;
}

/** Previous answer ran to the bottom of page N; this block starts near the top of N+1. */
const PREV_BOTTOM_Y = 650;
const NEXT_TOP_Y = 400;

function looksLikePageSpill(
  previous: StitchedBlock,
  current: StitchedBlock
): boolean {
  const prevLast = lastRegion(previous);
  const currFirst = firstRegion(current);
  if (!prevLast || !currFirst) return false;
  if (currFirst.page !== prevLast.page + 1) return false;
  if (prevLast.bbox[3] < PREV_BOTTOM_Y) return false;
  if (currFirst.bbox[1] > NEXT_TOP_Y) return false;
  return true;
}

function isOpeningBlockOnItsPage(
  pending: PendingAnswer[],
  index: number
): boolean {
  const item = pending[index];
  if (!item) return false;
  const page = firstRegion(item.block)?.page;
  if (page == null) return false;
  for (let i = 0; i < index; i++) {
    const earlier = pending[i];
    if (earlier && firstRegion(earlier.block)?.page === page) return false;
  }
  return true;
}

function appendPendingBlock(target: PendingAnswer, source: PendingAnswer): void {
  const seen = new Set(target.block.regions.map(regionKey));
  for (const region of source.block.regions) {
    const key = regionKey(region);
    if (seen.has(key)) continue;
    seen.add(key);
    target.block.regions.push(region);
  }
  target.block.regions = sortRegions(target.block.regions);
  target.block.transcript = [target.block.transcript, source.block.transcript]
    .filter((part) => part.length > 0)
    .join(" ");
  target.confidence = Math.min(target.confidence, source.confidence);
  target.block.confidence = Math.min(
    target.block.confidence,
    source.block.confidence
  );
}

/**
 * Attach only explicit __continuation__ spills. Unlabeled next-page writing
 * stays unmatched so it can appear in Unmapped.
 */
function attachLikelyContinuations(
  pending: PendingAnswer[],
  originalOrder: PendingAnswer[]
): PendingAnswer[] {
  const result: PendingAnswer[] = [];
  let attached = 0;

  for (const item of pending) {
    const originalIndex = originalOrder.indexOf(item);
    const previous = result[result.length - 1];
    if (
      previous?.questionId &&
      item.questionId == null &&
      isExplicitContinuation(item.block.detectedLabel) &&
      originalIndex >= 0 &&
      isOpeningBlockOnItsPage(originalOrder, originalIndex) &&
      looksLikePageSpill(previous.block, item.block)
    ) {
      appendPendingBlock(previous, item);
      attached += 1;
      continue;
    }

    result.push(item);
  }

  if (attached > 0) {
    console.log(
      `[mapAnswers] attachedLikelyContinuations=${attached} answers=${result.length}`
    );
  }
  return result;
}

function mergeByQuestionId(answers: MappedAnswer[]): MappedAnswer[] {
  const result: MappedAnswer[] = [];
  const indexByQuestionId = new Map<string, number>();
  let mergedExtras = 0;

  for (const answer of answers) {
    const questionId = answer.questionId;
    if (questionId == null) {
      result.push(answer);
      continue;
    }

    const existingIndex = indexByQuestionId.get(questionId);
    if (existingIndex === undefined) {
      indexByQuestionId.set(questionId, result.length);
      result.push({
        ...answer,
        regions: [...answer.regions],
      });
      continue;
    }

    const existing = result[existingIndex];
    if (!existing) continue;

    mergedExtras += 1;
    const seen = new Set(existing.regions.map(regionKey));
    for (const region of answer.regions) {
      const key = regionKey(region);
      if (seen.has(key)) continue;
      seen.add(key);
      existing.regions.push(region);
    }
    existing.regions.sort(
      (a, b) => a.page - b.page || a.bbox[1] - b.bbox[1]
    );
    existing.transcript = [existing.transcript, answer.transcript]
      .filter((part) => part.length > 0)
      .join(" ");
    existing.confidence = Math.min(existing.confidence, answer.confidence);
    if (MATCH_RANK[answer.matchMethod] > MATCH_RANK[existing.matchMethod]) {
      existing.matchMethod = answer.matchMethod;
    }
    if (!existing.detectedLabel && answer.detectedLabel) {
      existing.detectedLabel = answer.detectedLabel;
    }
  }

  if (mergedExtras > 0) {
    console.log(
      `[mapAnswers] mergeByQuestionId mergedExtras=${mergedExtras} answers=${result.length}`
    );
  }

  return result;
}

export async function mapAnswers(
  questions: Question[],
  rawBlocks: RawAnswerBlock[],
  hashPrefix = "unknown"
): Promise<MappedAnswer[]> {
  const keys = uniqueQuestionKeys(questions);
  const stitched = stitchContinuations(rawBlocks);
  const pending: PendingAnswer[] = [];

  for (const block of stitched) {
    const item: PendingAnswer = {
      block,
      questionId: null,
      matchMethod: "none",
      confidence: block.confidence,
    };

    const label = block.detectedLabel;
    if (label && !isUnlabeledOrContinuation(label)) {
      const key = normalizeKey(label);
      const exactId = exactMatch(key, keys);
      if (exactId) {
        item.questionId = exactId;
        item.matchMethod = "exact";
      } else {
        const fuzzyId = fuzzyMatch(key, keys);
        if (fuzzyId) {
          item.questionId = fuzzyId;
          item.matchMethod = "fuzzy";
        }
      }
    }

    pending.push(item);
  }

  const afterExact = attachLikelyContinuations(pending, pending);

  const unmatched = afterExact.filter((item) => item.questionId === null);
  if (unmatched.length > 0) {
    try {
      await llmMatch(questions, unmatched, hashPrefix);
    } catch (err) {
      if (err instanceof GeminiDailyQuotaError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`gemini LLM match skipped: ${message}`);
    }
  }

  const afterLlm = attachLikelyContinuations(afterExact, pending);
  return mergeByQuestionId(afterLlm.map(toMappedAnswer));
}
