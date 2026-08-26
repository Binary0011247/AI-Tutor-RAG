import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  type Part,
} from "@google/generative-ai";

/**
 * gemini-2.5-flash-lite 404s for this key ("no longer available to new users").
 * gemini-3.1-flash-lite works — default to that; override with GEMINI_MODEL.
 */
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
/** Only used when the configured model returns 404 — never on 429 / RPD. */
const NOT_FOUND_FALLBACKS = [
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
];
export const DAILY_QUOTA_MESSAGE =
  "Daily API quota reached, try again after midnight PT or switch API keys";
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 20_000;
const BACKOFF_MS = [1_000, 2_000, 4_000] as const;
/** Daily-quota hints can be hours; don't park a job that long. */
const MAX_RETRY_AFTER_MS = 120_000;
const MAX_CONCURRENCY = 2;

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/** Read env even if the .env line is indented (` GEMINI_API_KEY=`). */
function env(name: string): string | undefined {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.trim() === name && value?.trim()) return value.trim();
  }
  return undefined;
}

function configuredModel(): string {
  return env("GEMINI_MODEL") || DEFAULT_MODEL;
}

export class GeminiDailyQuotaError extends Error {
  constructor() {
    super(DAILY_QUOTA_MESSAGE);
    this.name = "GeminiDailyQuotaError";
  }
}

/** Sticky after a 404 fallback so we don't waste a request per call. */
let preferredModel: string | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getClient(): GoogleGenerativeAI {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the environment");
  }
  return new GoogleGenerativeAI(apiKey);
}

function errorStatus(err: unknown): number | undefined {
  if (err instanceof GoogleGenerativeAIFetchError && err.status != null) {
    return err.status;
  }
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function isNotFound(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 404) return true;
  return /\[404\b|not found/i.test(errorMessage(err));
}

function isQuota(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 429) return true;
  return /\[429\b|Too Many Requests|quota|RESOURCE_EXHAUSTED/i.test(
    errorMessage(err)
  );
}

/** Daily cap — waiting/retrying cannot help until the window resets. */
export function isDailyQuota(err: unknown): boolean {
  if (err instanceof GeminiDailyQuotaError) return true;
  const text = collectErrorText(err);
  return /GenerateRequestsPerDayPerProjectPerModel|requests per day/i.test(
    text
  );
}

function durationToMs(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds === 0) return null;
  return Math.ceil(seconds * 1000);
}

function parseDurationString(value: string): number | null {
  const trimmed = value.trim();
  const sec = trimmed.match(/^([\d.]+)\s*s(?:ec(?:onds?)?)?$/i);
  if (sec?.[1]) return durationToMs(Number(sec[1]));
  const proto = trimmed.match(/^(\d+)(?:\.(\d+))?s$/);
  if (proto?.[1]) return durationToMs(Number(proto[1]));
  return null;
}

function retryDelayFromDetails(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const details = (err as { errorDetails?: unknown }).errorDetails;
  if (!Array.isArray(details)) return null;

  for (const entry of details) {
    if (!entry || typeof entry !== "object") continue;
    const delay = (entry as Record<string, unknown>).retryDelay;
    if (typeof delay === "string") {
      const ms = parseDurationString(delay);
      if (ms != null) return ms;
    }
    if (delay && typeof delay === "object") {
      const rec = delay as { seconds?: unknown; nanos?: unknown };
      const seconds = Number(rec.seconds ?? 0);
      const nanos = Number(rec.nanos ?? 0);
      const ms =
        (Number.isFinite(seconds) ? seconds * 1000 : 0) +
        (Number.isFinite(nanos) ? nanos / 1e6 : 0);
      if (ms > 0) return Math.ceil(ms);
    }
  }
  return null;
}

function collectErrorText(err: unknown): string {
  const chunks = [errorMessage(err)];
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    if (rec.status != null) chunks.push(String(rec.status));
    if (rec.statusText != null) chunks.push(String(rec.statusText));
    if (rec.headers && typeof rec.headers === "object") {
      chunks.push(JSON.stringify(rec.headers));
    }
    if (rec.errorDetails != null) chunks.push(JSON.stringify(rec.errorDetails));
    if (rec.cause != null) chunks.push(errorMessage(rec.cause));
  }
  return chunks.join(" ");
}

function headerRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const rec = err as Record<string, unknown>;
  const headers = rec.headers as Record<string, unknown> | undefined;
  if (!headers) return null;

  const raw =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    headers["Retry-after"];
  if (raw == null) return null;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.ceil(asNumber * 1000);
  }
  return null;
}

/**
 * Prefer Retry-After / retryDelay from the 429 body or headers.
 * Returns null when Gemini gave no hint (caller falls back to 1s/2s/4s).
 */
export function retryAfterMs(err: unknown): number | null {
  const fromDetails = retryDelayFromDetails(err);
  if (fromDetails != null) return fromDetails;

  const fromHeader = headerRetryAfterMs(err);
  if (fromHeader != null) return fromHeader;

  const text = collectErrorText(err);

  const retryIn = text.match(/retry in ([\d.]+)\s*s/i);
  if (retryIn?.[1]) {
    const ms = durationToMs(Number(retryIn[1]));
    if (ms != null) return ms;
  }

  const retryDelay = text.match(/retryDelay["':\s]+(\d+(?:\.\d+)?)s/i);
  if (retryDelay?.[1]) {
    const ms = durationToMs(Number(retryDelay[1]));
    if (ms != null) return ms;
  }

  const retryAfter = text.match(/Retry-After["':\s]+(\d+)/i);
  if (retryAfter?.[1]) {
    const ms = durationToMs(Number(retryAfter[1]));
    if (ms != null) return ms;
  }

  return null;
}

function waitMsForAttempt(err: unknown, attempt: number, quota: boolean): number {
  const hinted = quota ? retryAfterMs(err) : null;
  const raw = hinted ?? BACKOFF_MS[attempt] ?? 1_000 * 2 ** attempt;
  if (raw > MAX_RETRY_AFTER_MS) {
    console.warn(
      `gemini: retry-after ${raw}ms exceeds cap, waiting ${MAX_RETRY_AFTER_MS}ms`
    );
    return MAX_RETRY_AFTER_MS;
  }
  return raw;
}

class Gate {
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.max) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.inFlight -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

const geminiGate = new Gate(MAX_CONCURRENCY);

export async function callGeminiJSON(
  prompt: string,
  imageParts: { data: string; mimeType: string }[],
  schemaDescription: string
): Promise<any> {
  const parts: Part[] = [
    {
      text: `${prompt}\n\nRespond with JSON only, matching this schema:\n${schemaDescription}`,
    },
    ...imageParts.map((image) => ({
      inlineData: {
        data: image.data,
        mimeType: image.mimeType,
      },
    })),
  ];

  let lastError: unknown;
  const models = unique([
    preferredModel ?? undefined,
    configuredModel(),
    ...NOT_FOUND_FALLBACKS,
  ]);

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const modelName = models[modelIndex];
    if (!modelName) continue;

    const model = getClient().getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    let notFound = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await geminiGate.run(() =>
          model.generateContent(parts, { timeout: ATTEMPT_TIMEOUT_MS })
        );
        if (preferredModel !== modelName) {
          preferredModel = modelName;
          console.log(`gemini: using model ${modelName}`);
        }
        return JSON.parse(result.response.text());
      } catch (err) {
        lastError = err;

        if (isDailyQuota(err)) {
          console.warn(
            `gemini: daily quota (RPD) on ${modelName} — failing immediately`
          );
          throw new GeminiDailyQuotaError();
        }

        if (isNotFound(err)) {
          notFound = true;
          console.warn(`gemini: model ${modelName} not found, trying fallback`);
          break;
        }

        const quota = isQuota(err);
        if (attempt < MAX_ATTEMPTS - 1) {
          const wait = waitMsForAttempt(err, attempt, quota);
          const hinted = quota ? retryAfterMs(err) : null;
          console.warn(
            `gemini: ${quota ? "429 RPM" : "error"} on ${modelName} attempt ${attempt + 1}/${MAX_ATTEMPTS}, waiting ${wait}ms${hinted != null ? " (retry-after)" : ""} — retrying same model`
          );
          await sleep(wait);
          continue;
        }

        if (quota) {
          console.warn(
            `gemini: 429 exhausted retries on ${modelName}; not switching models`
          );
        }
      }
    }

    // Stay on the same model for rate limits and other runtime errors.
    // Only a 404 (model id missing) may advance to a fallback.
    if (!notFound) break;
  }

  throw new Error(
    `Gemini JSON call failed after ${MAX_ATTEMPTS} attempts: ${errorMessage(lastError)}`
  );
}
