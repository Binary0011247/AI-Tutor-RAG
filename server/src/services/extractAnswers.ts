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

function promptForBatch(
  batchStart: number,
  batchCount: number,
  pageCount: number,
  contextPage: number | null
): string {
  const newIndices = Array.from(
    { length: batchCount },
    (_, i) => batchStart + i
  );
  const imageLines: string[] = [];
  let imageNumber = 1;
  if (contextPage != null) {
    imageLines.push(
      `Image ${imageNumber} is 0-based page index ${contextPage} (printed page ${contextPage + 1} of ${pageCount}).`
    );
    imageNumber += 1;
  }
  for (const page of newIndices) {
    imageLines.push(
      `Image ${imageNumber} is 0-based page index ${page} (printed page ${page + 1} of ${pageCount}).`
    );
    imageNumber += 1;
  }

  const imageCount = imageLines.length;
  const lines = [
    `You will receive ${imageCount} images, in order, from a student's handwritten answer sheet.`,
    ...imageLines,
  ];

  if (contextPage != null) {
    lines.push(
      "The first image in this batch was already processed in a previous call and included only for continuity context — do not re-emit blocks for it, only use it to correctly detect if the first NEW page's content is a continuation of an answer from that context page."
    );
  }

  lines.push(
    "Process each NEW page in order and return ONE combined JSON array of every distinct handwritten answer block on the NEW pages only.",
    "Each object must include: page, detectedLabel, transcript, bbox, confidence.",
    "`page` is the 0-based page index of the NEW image this block appears on — it must be one of: " +
      newIndices.join(", ") +
      ".",
    "Rules:",
    '- `detectedLabel`: the question label the student wrote (e.g. "Q11 (a)", "2b", "Question 3") exactly as written. Set to null if you cannot confidently tell which question this responds to — do not guess.',
    '- `detectedLabel` must be the literal string "__continuation__" if this block is clearly a continuation of the answer from the previous page (no new question label, content picks up mid-sentence or mid-working). Use the context page (when provided) to decide this for the first NEW page.',
    "- `transcript`: your best-effort transcription of the handwritten text in this block, including working, equations, and crossings-out if readable.",
    "- `bbox`: [xMin, yMin, xMax, yMax] as integers normalized 0-1000, tight around just the handwritten answer content — not the whole page, not surrounding blank space, not printed headers/lines unless the writing sits on them. Coordinates are relative to THAT page image.",
    "- `confidence`: a number from 0 to 1 reflecting confidence in both the transcription and the label reading. Lower for messy or faint handwriting.",
    "- One object per distinct answer block. A labelled sub-part (e.g. 11(a) vs 11(b)) is a separate block.",
    "- Order blocks by page, then top-to-bottom as they appear (left column before right if multi-column).",
    "- Ignore purely printed page furniture (margins, ruling, page numbers) that has no handwriting.",
    "- If none of the NEW pages have handwritten answers, return []."
  );

  return lines.join("\n");
}

function resolvePage(
  raw: unknown,
  batchStart: number,
  batchCount: number,
  contextPage: number | null
): number | null {
  if (batchCount === 1) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return batchStart;
    const i = Math.trunc(n);
    if (contextPage != null && i === contextPage) return null;
    if (i === batchStart || i === 0) return batchStart;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (contextPage != null && i === contextPage) return null;
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

export async function extractAnswers(
  pageImages: Buffer[],
  hashPrefix = "unknown"
): Promise<{ blocks: RawAnswerBlock[]; warnings: string[] }> {
  const blocks: RawAnswerBlock[] = [];
  const warnings: string[] = [];

  for (let batchStart = 0; batchStart < pageImages.length; batchStart += BATCH_SIZE) {
    const batch = pageImages.slice(batchStart, batchStart + BATCH_SIZE);
    const newBuffers = batch.filter((buffer): buffer is Buffer => Boolean(buffer));
    if (newBuffers.length === 0) continue;

    const contextPage = batchStart > 0 ? batchStart - 1 : null;
    const contextBuffer =
      contextPage != null ? pageImages[contextPage] : undefined;
    const buffers =
      contextBuffer != null ? [contextBuffer, ...newBuffers] : newBuffers;

    const pageLabel = `${batchStart + 1}-${batchStart + newBuffers.length}`;

    try {
      console.log(
        `[gemini] stage=extracting_answers pages=${pageLabel}` +
          (contextPage != null ? ` contextPage=${contextPage + 1}` : "") +
          ` hash=${hashPrefix}`
      );
      const raw = await callGeminiJSON(
        promptForBatch(
          batchStart,
          newBuffers.length,
          pageImages.length,
          contextBuffer != null ? contextPage : null
        ),
        buffers.map((buffer) => ({
          data: buffer.toString("base64"),
          mimeType: imageMimeType(buffer),
        })),
        SCHEMA
      );

      for (const entry of asArray(raw)) {
        const page = resolvePage(
          entry && typeof entry === "object"
            ? (entry as Record<string, unknown>).page
            : undefined,
          batchStart,
          newBuffers.length,
          contextBuffer != null ? contextPage : null
        );
        if (page == null) continue;
        const block = toBlock(entry, page);
        if (block) blocks.push(block);
      }
    } catch (err) {
      if (err instanceof GeminiDailyQuotaError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(
        `Answer extraction failed on pages ${pageLabel}: ${message}`
      );
    }
  }

  blocks.sort((a, b) => a.page - b.page);
  return { blocks, warnings };
}
