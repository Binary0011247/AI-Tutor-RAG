"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { UploadDropzone } from "./UploadDropzone";
import { UploadHero } from "./UploadHero";

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
}

function readErrorBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }
  return null;
}

function uploadErrorMessage(res: Response, body: unknown): string {
  const fromBody = readErrorBody(body);
  if (res.status === 429) {
    return fromBody || "Too many uploads. Try again in a minute.";
  }
  if (res.status === 400) {
    return fromBody || "Both a question paper and an answer sheet are required.";
  }
  return fromBody || `Upload failed (${res.status}).`;
}

export function UploadScreen() {
  const router = useRouter();
  const [questionPaper, setQuestionPaper] = useState<File | null>(null);
  const [answerSheet, setAnswerSheet] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headingKey, setHeadingKey] = useState(0);

  useEffect(() => {
    setHeadingKey(1);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setHeadingKey((value) => value + 1);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const ready = Boolean(questionPaper && answerSheet) && !submitting;

  const startMapping = async () => {
    if (!questionPaper || !answerSheet) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("questionPaper", questionPaper);
      form.append("answerSheet", answerSheet);
      const res = await fetch(`${apiBase()}/api/jobs`, {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => null)) as
        | { jobId?: string; error?: string; message?: string }
        | null;
      if (!res.ok) {
        throw new Error(uploadErrorMessage(res, body));
      }
      if (!body?.jobId) {
        throw new Error("Upload succeeded but no job id was returned.");
      }
      router.push(`/review/${body.jobId}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof TypeError) {
        setError(
          "Could not reach the server. Check that the backend is running."
        );
        return;
      }
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  return (
    <main className="flex flex-col items-center bg-page px-4 py-8 text-ink sm:px-6 sm:py-10">
      <div className="w-full max-w-3xl text-center">
        <h1
          key={headingKey}
          className={`text-[1.65rem] font-bold leading-snug tracking-tight sm:text-4xl sm:leading-tight ${
            headingKey > 0 ? "upload-heading" : "opacity-0"
          }`}
        >
          Upload{" "}
          <span className="relative inline-block text-accent">
            <span
              className="upload-heading-highlight absolute inset-x-0 inset-y-[0.12em] -z-0 rounded-md bg-[#F6C7B0]"
              aria-hidden
            />
            <span className="relative z-10 px-2 py-0.5">
              <span className="relative inline-block">
                Question
                <svg
                  className="pointer-events-none absolute top-[0.95em] left-0 h-[0.28em] w-full overflow-visible text-accent"
                  viewBox="0 0 120 12"
                  fill="none"
                  aria-hidden
                >
                  <path
                    className="upload-heading-flourish"
                    d="M2 8 C 28 14, 52 2, 118 7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{" "}
              Paper &amp; Answer Sheets
            </span>
          </span>
        </h1>
        <p className="mt-3 text-sm text-muted">Upload both files to get started</p>

        <UploadHero />

        <div className="grid gap-4 sm:grid-cols-2">
          <UploadDropzone
            labelLead="Question"
            labelAccent="Paper"
            file={questionPaper}
            onFile={(next) => {
              setQuestionPaper(next);
              setError(null);
            }}
          />
          <UploadDropzone
            labelLead="Answer"
            labelAccent="Sheet"
            file={answerSheet}
            onFile={(next) => {
              setAnswerSheet(next);
              setError(null);
            }}
          />
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => void startMapping()}
          className={`mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold transition-colors ${
            ready
              ? "bg-ink text-white hover:bg-ink/90"
              : "cursor-not-allowed bg-[#cfcbc4] text-[#8a8680]"
          }`}
        >
          {submitting ? "Starting..." : "Start Mapping"}
          <ArrowRight
            className={`h-4 w-4 ${ready ? "text-white" : "text-[#8a8680]"}`}
          />
        </button>

        <p className="mt-3 text-xs text-muted">
          Once both files are uploaded, you&apos;ll able to map answers with
          questions
        </p>
        {error ? (
          <p className="mt-2 text-sm text-score-fail">{error}</p>
        ) : null}
      </div>
    </main>
  );
}
