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

function fuzzyMatch(
  key: string,
  keys: Map<string, string>
): string | undefined {
  if (!key) return undefined;

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

function parseConfidence(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

async function llmMatch(
  questions: Question[],
  unmatched: PendingAnswer[],
  hashPrefix: string
): Promise<void> {
  if (unmatched.length === 0) return;

  const validIds = new Set(questions.map((q) => q.id));
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
    "- questionId must be an id from the question list, or null if you cannot tell. Do not guess.",
    "- confidence is 0-1 for that match (use a low value if unsure).",
    "- Use the detectedLabel when present; otherwise use the transcript to infer which question it answers.",
    "- Prefer a sub-part match (e.g. 11a vs 11b) over the parent number alone.",
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
      unmatched.map((item, index) => ({
        index,
        detectedLabel: item.block.detectedLabel,
        transcript: item.block.transcript,
      }))
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
    const questionId = parseLlmQuestionId(entry.questionId, validIds);
    pending.questionId = questionId;
    pending.matchMethod = questionId ? "llm" : "none";
    pending.confidence = parseConfidence(entry.confidence, pending.confidence);
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
    if (label) {
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

  const unmatched = pending.filter((item) => item.questionId === null);
  if (unmatched.length > 0) {
    try {
      await llmMatch(questions, unmatched, hashPrefix);
    } catch (err) {
      if (err instanceof GeminiDailyQuotaError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`gemini LLM match skipped: ${message}`);
    }
  }

  return pending.map(toMappedAnswer);
}
