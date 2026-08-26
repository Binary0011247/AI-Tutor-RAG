import { callGeminiJSON, GeminiDailyQuotaError } from "./gemini";
import type { Question } from "../types";

const SCHEMA = `[
  {
    "page": 0,
    "number": "string — the printed question number exactly as shown, e.g. \\"11\\" or \\"Q2\\"",
    "subpart": "string or null — the printed sub-part label exactly as shown, e.g. \\"a\\", \\"(i)\\"; null if none",
    "text": "string — the full question text for this entry, including any given data or options"
  }
]`;

const BATCH_SIZE = 4;

function imageMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^question\s+/, "")
    .replace(/^q\.?\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function questionId(number: string, subpart: string | undefined, used: Set<string>): string {
  const num = slugPart(number) || "unknown";
  const sub = subpart ? slugPart(subpart) : "";
  const base = sub ? `q${num}-${sub}` : `q${num}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function asArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.questions)) return obj.questions;
  }
  throw new Error("Question extraction did not return a JSON array");
}

function optionalSubpart(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null") return undefined;
  return text;
}

function promptForBatch(
  batchStart: number,
  batchCount: number,
  pageCount: number
): string {
  const indices = Array.from(
    { length: batchCount },
    (_, i) => batchStart + i
  );
  const imageLines = indices.map(
    (page, i) =>
      `Image ${i + 1} is 0-based page index ${page} (printed page ${page + 1} of ${pageCount}).`
  );

  return [
    `You will receive ${batchCount} images, in order, from a printed question paper.`,
    ...imageLines,
    "Process each image in order and return ONE combined JSON array of every question that STARTS on any of these pages.",
    "Each object must include: page, number, subpart, text.",
    "`page` is the 0-based page index of the image where that question's number/label starts — it must be one of: " +
      indices.join(", ") +
      ".",
    "Rules:",
    "- Every labelled sub-part ((a), (b), (i), (ii), (1), (2), etc.) is its own separate array entry. Use the same `number` as the parent question and a distinct `subpart`.",
    "- `number` and `subpart` must preserve the exact printed numbering/labelling. Do not normalize, renumber, or convert roman/arabic. Copy characters as printed.",
    "- If a question has no labelled sub-part, set `subpart` to null.",
    "- `text` is the full wording of that question or sub-part, including given data, equations, and options that belong to it.",
    "- Entries must be ordered by page, then top-to-bottom as printed (left column before right if the page is multi-column).",
    "- If a question's text visibly continues from a previous page (no new number/label at the top), skip it — it was already captured earlier. Attribute a question only when its number/label starts on that page.",
    "- Do not extract headers, footers, instructions, marks schemes, or page numbers as questions.",
    "- If none of these images have questions that start on them, return [].",
  ].join("\n");
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

function toQuestion(
  raw: unknown,
  page: number,
  usedIds: Set<string>
): Question | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const number = entry.number === null || entry.number === undefined
    ? ""
    : String(entry.number).trim();
  const text = entry.text === null || entry.text === undefined
    ? ""
    : String(entry.text).trim();
  if (!number || !text) return null;

  const subpart = optionalSubpart(entry.subpart);
  const question: Question = {
    id: questionId(number, subpart, usedIds),
    number,
    text,
    page,
  };
  if (subpart !== undefined) {
    question.subpart = subpart;
  }
  return question;
}

export async function extractQuestions(
  pageImages: Buffer[],
  hashPrefix = "unknown"
): Promise<{ questions: Question[]; warnings: string[] }> {
  const usedIds = new Set<string>();
  const questions: Question[] = [];
  const warnings: string[] = [];

  for (let batchStart = 0; batchStart < pageImages.length; batchStart += BATCH_SIZE) {
    const batch = pageImages.slice(batchStart, batchStart + BATCH_SIZE);
    const buffers = batch.filter((buffer): buffer is Buffer => Boolean(buffer));
    if (buffers.length === 0) continue;

    const pageLabel = `${batchStart + 1}-${batchStart + buffers.length}`;

    try {
      console.log(
        `[gemini] stage=extracting_questions pages=${pageLabel} hash=${hashPrefix}`
      );
      const raw = await callGeminiJSON(
        promptForBatch(batchStart, buffers.length, pageImages.length),
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
          buffers.length
        );
        if (page == null) continue;
        const question = toQuestion(entry, page, usedIds);
        if (question) questions.push(question);
      }
    } catch (err) {
      if (err instanceof GeminiDailyQuotaError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(
        `Question extraction failed on pages ${pageLabel}: ${message}`
      );
    }
  }

  questions.sort((a, b) => a.page - b.page);
  return { questions, warnings };
}
