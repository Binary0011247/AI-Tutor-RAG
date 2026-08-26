export type PageKind = "questionPaper" | "answerSheet";

export interface StoredPages {
  questionPaper: Buffer[];
  answerSheet: Buffer[];
}

const pagesByJob = new Map<string, StoredPages>();

export function setPages(jobId: string, pages: StoredPages): void {
  pagesByJob.set(jobId, pages);
}

export function getPages(jobId: string): StoredPages | undefined {
  return pagesByJob.get(jobId);
}

export function getPage(
  jobId: string,
  kind: PageKind,
  index: number
): Buffer | undefined {
  return pagesByJob.get(jobId)?.[kind]?.[index];
}

export function deletePages(jobId: string): void {
  pagesByJob.delete(jobId);
}
