"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Upload, X } from "lucide-react";

const ACCEPT = ".pdf,image/png,image/jpeg,image/jpg,image/webp,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(/\.0$/, "")}MB`;
}

function isPdf(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return type.includes("pdf") || name.endsWith(".pdf");
}

function isAllowed(file: File): boolean {
  return isPdf(file) || file.type.toLowerCase().startsWith("image/");
}

/** Count PDF page objects when they appear as plain text. Omit rather than guess. */
async function countPdfPages(file: File): Promise<number | null> {
  try {
    const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
    if (!text.startsWith("%PDF")) return null;
    const spaced = text.match(/\/Type\s*\/Page(?!\s*s)\b/g)?.length ?? 0;
    const compact = text.match(/\/Type\/Page(?!s)\b/g)?.length ?? 0;
    const count = Math.max(spaced, compact);
    return count > 0 ? count : null;
  } catch {
    return null;
  }
}

async function countPages(file: File): Promise<number | null> {
  if (isPdf(file)) return countPdfPages(file);
  if (file.type.toLowerCase().startsWith("image/")) return 1;
  return null;
}

export function UploadDropzone({
  labelLead,
  labelAccent,
  file,
  onFile,
}: {
  labelLead: string;
  labelAccent: string;
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  useEffect(() => {
    if (!file) {
      setPageCount(null);
      return;
    }
    let cancelled = false;
    void countPages(file).then((count) => {
      if (!cancelled) setPageCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const assign = (next: File | undefined) => {
    if (!next) return;
    if (next.size > MAX_BYTES) {
      setError("File must be 10MB or smaller");
      return;
    }
    if (!isAllowed(next)) {
      setError("Upload a PDF or image");
      return;
    }
    setError(null);
    onFile(next);
  };

  const onDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragOver(false);
    assign(event.dataTransfer.files[0]);
  };

  const clear = () => {
    onFile(null);
    setError(null);
    setPageCount(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const meta =
    pageCount == null
      ? formatSize(file?.size ?? 0)
      : `${formatSize(file?.size ?? 0)} • ${pageCount} ${
          pageCount === 1 ? "Page" : "Pages"
        }`;

  return (
    <div
      className={`relative text-left ${
        file
          ? "min-h-[140px] rounded-2xl border-2 border-dashed border-line bg-card p-4 sm:min-h-[152px]"
          : ""
      }`}
    >
      {file ? (
        <>
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide text-white ${
              isPdf(file) ? "bg-[#E24B4A]" : "bg-ink"
            }`}
          >
            {isPdf(file) ? "PDF" : "IMG"}
          </span>
          <p className="mt-3 truncate pr-10 text-sm font-semibold text-ink">
            {file.name}
          </p>
          <p className="mt-1 text-sm text-muted">{meta}</p>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/80"
            onClick={clear}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragOver ? "border-accent bg-accent/5" : "border-line bg-card"
          }`}
        >
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-page text-ink">
            <Upload className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-ink">
            Upload {labelLead}{" "}
            <span className="text-accent">{labelAccent}</span>
          </p>
          <p className="mt-1 text-xs text-muted">Max 10MB</p>
        </label>
      )}
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => assign(event.target.files?.[0])}
      />
      {error ? (
        <p className="mt-2 text-center text-xs text-score-fail">{error}</p>
      ) : null}
    </div>
  );
}
