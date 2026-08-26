import { randomUUID } from "crypto";
import type { Job } from "../types";

const jobs = new Map<string, Job>();

export function createJob(): Job {
  const job: Job = {
    id: randomUUID(),
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
    warnings: [],
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, partial: Partial<Job>): Job {
  const existing = jobs.get(id);
  if (!existing) {
    throw new Error(`Job not found: ${id}`);
  }
  const updated: Job = { ...existing, ...partial };
  jobs.set(id, updated);
  return updated;
}

export function deleteJob(id: string): void {
  jobs.delete(id);
}

export function pruneExpiredJobs(ttlMs: number): string[] {
  const cutoff = Date.now() - ttlMs;
  const expired: string[] = [];
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      expired.push(id);
    }
  }
  for (const id of expired) {
    deleteJob(id);
  }
  return expired;
}
