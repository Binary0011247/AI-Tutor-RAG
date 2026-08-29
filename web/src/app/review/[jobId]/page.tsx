"use client";

import { use, useEffect, useState } from "react";
import { ExtractingScreen } from "@/components/ExtractingScreen";
import {
  MappingScreen,
  defaultMappingSelection,
} from "@/components/MappingScreen";
import type { MappingSelection } from "@/components/QuestionList";
import type { Job } from "@/types";

const POLL_MS = 1500;

class JobRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
}

async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`${apiBase()}/api/jobs/${jobId}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new JobRequestError(
      body?.error || `Request failed (${res.status})`,
      res.status
    );
  }
  return (await res.json()) as Job;
}

export default function ReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const [job, setJob] = useState<Job | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MappingSelection | null>(null);
  const [mobilePane, setMobilePane] = useState<"questions" | "sheet">(
    "questions"
  );

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const next = await fetchJob(jobId);
        if (cancelled) return;
        setJob(next);
        setFatalError(null);
        if (next.status !== "done" && next.status !== "error") {
          timeoutId = setTimeout(poll, POLL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load this job.";
        const status = err instanceof JobRequestError ? err.status : 0;
        if (status === 404 || status === 400) {
          setFatalError(message);
          return;
        }
        timeoutId = setTimeout(poll, POLL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [jobId]);

  if (fatalError) {
    return <ErrorState message={fatalError} />;
  }

  if (!job || (job.status !== "done" && job.status !== "error")) {
    return <ExtractingScreen />;
  }

  if (job.status === "error") {
    return <ErrorState message={job.error ?? "This job failed."} />;
  }

  if (!job.result) {
    return <ErrorState message="This job finished without a result." />;
  }

  const selection = selected ?? defaultMappingSelection(job.result);

  return (
    <MappingScreen
      jobId={jobId}
      result={job.result}
      gradeOverrides={job.gradeOverrides}
      selected={selection}
      mobilePane={mobilePane}
      onMobilePaneChange={setMobilePane}
      onSelect={(next) => {
        setSelected(next);
        setMobilePane((pane) => (pane === "questions" ? "sheet" : pane));
      }}
    />
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted">{message}</p>
    </div>
  );
}
