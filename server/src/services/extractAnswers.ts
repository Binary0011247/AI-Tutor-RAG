import { callGeminiJSON, GeminiDailyQuotaError } from "./gemini";
import type { RawAnswerBlock } from "../types";

export type { RawAnswerBlock };

const SCHEMA = `[
  {
    "page": 0,
    "detectedLabel": "string | null — the question label exactly as the student wrote it, e.g. \\"Q11 (a)\\", \\"2b\\", \\"Question 3\\"; null if unreadable; \\"__continuation__\\" if this block continues the previous page",
    "transcript": "string — best-effort transcription of the handwritten answer",
    "bbox": [0, 0, 0, 0],
    "confidence": 0.0
  }
]`;

const BATCH_SIZE = 4;
/** Four handwriting page images often exceed the default 30s network timeout. */
const ANSWER_ATTEMPT_TIMEOUT_MS = 90_000;

function imageMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

function asArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.answers)) return obj.answers;
    if (Array.isArray(obj.blocks)) return obj.blocks;
  }
  throw new Error("Answer extraction did not return a JSON array");
}

function parseLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "none") {
    return null;
  }
  return text;
}

function parseConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function parseBbox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums: number[] = [];
  for (const item of raw) {
    const n = Number(item);
    if (!Number.isFinite(n)) return null;
    nums.push(Math.round(Math.min(1000, Math.max(0, n))));
  }
  let xMin = nums[0];
  let yMin = nums[1];
  let xMax = nums[2];
  let yMax = nums[3];
  if (
    xMin === undefined ||
    yMin === undefined ||
    xMax === undefined ||
    yMax === undefined
  ) {
    return null;
  }
  if (xMin > xMax) {
    const tmp = xMin;
    xMin = xMax;
    xMax = tmp;
  }
  if (yMin > yMax) {
    const tmp = yMin;
    yMin = yMax;
    yMax = tmp;
  }
  if (xMin === xMax || yMin === yMax) return null;
  return [xMin, yMin, xMax, yMax];
}

type PriorBatchTail = {
  label: string;
  ending: string;
};

function lastWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words.slice(-maxWords).join(" ");
}

function promptForBatch(
  batchStart: number,
  batchCount: number,
  pageCount: number,
  prior: PriorBatchTail | null
): string {
  const indices = Array.from(
    { length: batchCount },
    (_, i) => batchStart + i
  );
  const imageLines = indices.map(
    (page, i) =>
      `Image ${i + 1} is 0-based page index ${page} (printed page ${page + 1} of ${pageCount}).`
  );

  const lines = [
    `You will receive ${batchCount} images, in order, from a student's handwritten answer sheet.`,
    ...imageLines,
  ];

  if (prior) {
    lines.push(
      `For context only: the previous page ended mid-answer with this content: [label: '${prior.label}', ending: '...${prior.ending}']. If the FIRST new page in this batch clearly continues that same answer with no new question label at the top, mark its opening block's detectedLabel as __continuation__. Otherwise treat it normally.`
    );
  }

  lines.push(
    "Process each image in order and return ONE combined JSON array of distinct student answer blocks on these pages.",
    "Each object must include: page, detectedLabel, transcript, bbox, confidence.",
    "`page` is the 0-based page index of the image this block appears on — it must be one of: " +
      indices.join(", ") +
      ".",
    "Rules:",
    "- Emit a block for each distinct answer attempt: labelled answers, and unlabeled writing that is clearly a solution or working. If the question number is unreadable, still emit that answer block with detectedLabel null.",
    "- Do not emit a block for stray marks, underlines, ticks, page numbers, printed ruling, or tiny isolated scribbles that are not an answer.",
    '- `detectedLabel`: the question label the student wrote (e.g. "Q11 (a)", "2b", "Question 3") exactly as written. Set to null if you cannot confidently tell which question this responds to — do not guess, but still return the answer block.',
    "- If the student labelled a sub-part ((a), (b), (i), (ii)), `detectedLabel` must include that sub-part. Do not emit a bare parent number such as \"11\" when \"11(a)\" / \"11(b)\" is visible.",
    '- `detectedLabel` must be the literal string "__continuation__" if this block is clearly a continuation of the answer from the previous page (no new question label, content picks up mid-sentence or mid-working).',
    "- `transcript`: your best-effort transcription of the handwritten text in this block, including working, equations, and crossings-out if readable.",
    "- `bbox`: [xMin, yMin, xMax, yMax] as integers normalized 0-1000, tight around just the handwritten content — not the whole page, not surrounding blank space. Coordinates are relative to THAT page image. Always use a valid non-zero-area bbox so the block is kept.",
    "- `confidence`: a number from 0 to 1 reflecting confidence in both the transcription and the label reading. Lower for messy or faint handwriting.",
    "- One object per distinct answer block. A labelled sub-part (e.g. 11(a) vs 11(b)) is a separate block.",
    "- Order blocks by page, then top-to-bottom as they appear (left column before right if multi-column).",
    "- Ignore purely printed page furniture (margins, ruling, page numbers) that has no handwriting.",
    "- If none of these pages have handwritten answers, return []."
  );

  return lines.join("\n");
}

function resolvePage(
  raw: unknown,
  batchStart: number,
  batchCount: number
): number | null {
  if (batchCount === 1) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return batchStart;
    const i = Math.trunc(n);
    if (i === batchStart || i === 0) return batchStart;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i >= batchStart && i < batchStart + batchCount) return i;
  if (i >= 0 && i < batchCount) return batchStart + i;
  return null;
}

function toBlock(raw: unknown, page: number): RawAnswerBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const bbox = parseBbox(entry.bbox);
  if (!bbox) return null;

  const transcript =
    entry.transcript === null || entry.transcript === undefined
      ? ""
      : String(entry.transcript).trim();

  return {
    page,
    detectedLabel: parseLabel(entry.detectedLabel),
    transcript,
    bbox,
    confidence: parseConfidence(entry.confidence),
  };
}

function logAnswerAccounting(
  hashPrefix: string,
  blockCount: number,
  skipped: Array<{ pages: string; message: string }>
): void {
  console.log(
    `[extractAnswers] rawAnswerBlocks=${blockCount} hash=${hashPrefix}`
  );
  if (skipped.length > 0) {
    console.warn(
      `[extractAnswers] batchRetriesExhausted=true skippedBatches=${skipped.length} pages=${skipped
        .map((item) => item.pages)
        .join(",")} hash=${hashPrefix}`
    );
  } else {
    console.log(
      `[extractAnswers] batchRetriesExhausted=false hash=${hashPrefix}`
    );
  }
}

export async function extractAnswers(
  pageImages: Buffer[],
  hashPrefix = "unknown"
): Promise<{ blocks: RawAnswerBlock[]; warnings: string[] }> {
  const blocks: RawAnswerBlock[] = [];
  const warnings: string[] = [];
  const skipped: Array<{ pages: string; message: string }> = [];
  let prior: PriorBatchTail | null = null;

  for (let batchStart = 0; batchStart < pageImages.length; batchStart += BATCH_SIZE) {
    const batch = pageImages.slice(batchStart, batchStart + BATCH_SIZE);
    const buffers = batch.filter((buffer): buffer is Buffer => Boolean(buffer));
    if (buffers.length === 0) continue;

    const pageLabel = `${batchStart + 1}-${batchStart + buffers.length}`;

    try {
      console.log(
        `[gemini] stage=extracting_answers pages=${pageLabel} hash=${hashPrefix}`
      );
      const raw = await callGeminiJSON(
        promptForBatch(batchStart, buffers.length, pageImages.length, prior),
        buffers.map((buffer) => ({
          data: buffer.toString("base64"),
          mimeType: imageMimeType(buffer),
        })),
        SCHEMA,
        ANSWER_ATTEMPT_TIMEOUT_MS
      );

      const batchBlocks: RawAnswerBlock[] = [];
      for (const entry of asArray(raw)) {
        const page = resolvePage(
          entry && typeof entry === "object"
            ? (entry as Record<string, unknown>).page
            : undefined,
          batchStart,
          buffers.length
        );
        if (page == null) continue;
        const block = toBlock(entry, page);
        if (block) batchBlocks.push(block);
      }

      blocks.push(...batchBlocks);

      const ordered = [...batchBlocks].sort((a, b) => a.page - b.page);
      const lastInBatch = ordered[ordered.length - 1];
      prior = lastInBatch
        ? {
            label: lastInBatch.detectedLabel ?? "null",
            ending: lastWords(lastInBatch.transcript, 40),
          }
        : null;
    } catch (err) {
      if (err instanceof GeminiDailyQuotaError) {
        logAnswerAccounting(hashPrefix, blocks.length, skipped);
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ pages: pageLabel, message });
      warnings.push(
        `Answer extraction failed on pages ${pageLabel}: ${message}`
      );
    }
  }

  blocks.sort((a, b) => a.page - b.page);
  logAnswerAccounting(hashPrefix, blocks.length, skipped);

  if (skipped.length > 0 && blocks.length === 0) {
    const detail = skipped
      .map((item) => `pages ${item.pages}: ${item.message}`)
      .join("; ");
    throw new Error(
      `Answer extraction failed after all retries (${detail}).`
    );
  }

  return { blocks, warnings };
}
