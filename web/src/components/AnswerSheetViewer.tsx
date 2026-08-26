"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { HighlightOverlay } from "./HighlightOverlay";
import type { AnswerRegion } from "@/types";

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.75;
const ZOOM_STEP = 0.25;

function pageImageUrl(jobId: string, page: number): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return `${base}/api/jobs/${jobId}/pages/answerSheet/${page}`;
}

function highlightTag(number: string, subpart?: string): string {
  const n = number.replace(/^[Qq]\s*/, "").replace(/[.)\s]+$/g, "");
  const s = subpart?.replace(/[()]/g, "").trim();
  return s ? `Q${n}${s}` : `Q${n}`;
}

export function AnswerSheetViewer({
  jobId,
  pageCount,
  selectedRegions = [],
  questionNumber,
  questionSubpart,
  unanswered = false,
  pageSrcs,
}: {
  jobId: string;
  pageCount: number;
  selectedRegions?: AnswerRegion[];
  questionNumber?: string;
  questionSubpart?: string;
  unanswered?: boolean;
  /** Optional preview overrides; production uses the jobs API URL. */
  pageSrcs?: string[];
}) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [display, setDisplay] = useState({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  const regionPages = useMemo(
    () => [...new Set(selectedRegions.map((region) => region.page))],
    [selectedRegions]
  );

  const regionsKey = selectedRegions
    .map((region) => `${region.page}:${region.bbox.join(",")}`)
    .join("|");

  useEffect(() => {
    const first = selectedRegions[0];
    if (first) setPage(first.page);
  }, [regionsKey, selectedRegions]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    const measure = () => {
      setDisplay({
        width: image.clientWidth,
        height: image.clientHeight,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    return () => observer.disconnect();
  }, [page, zoom, jobId, pageSrcs]);

  const src = pageSrcs?.[page] ?? pageImageUrl(jobId, page);
  const pageRegions = selectedRegions.filter((region) => region.page === page);
  const tag =
    questionNumber !== undefined
      ? highlightTag(questionNumber, questionSubpart)
      : "Q";
  const regionIndex = selectedRegions.findIndex((region) => region.page === page);
  const multiPage = selectedRegions.length > 1;

  const goToRegion = (index: number) => {
    const region = selectedRegions[index];
    if (region) setPage(region.page);
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-line bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-base font-bold text-ink">Answer Sheet</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Zoom out"
              className="rounded-md p-1 hover:bg-page disabled:opacity-40"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-12 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              className="rounded-md p-1 hover:bg-page disabled:opacity-40"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              className="rounded-md p-1 hover:bg-page disabled:opacity-40"
              disabled={page <= 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex items-center gap-1.5 tabular-nums">
              Page {page + 1} of {Math.max(pageCount, 1)}
              {regionPages.length > 0
                ? regionPages.map((regionPage) => (
                    <span
                      key={regionPage}
                      className={`h-1.5 w-1.5 rounded-full ${
                        regionPage === page ? "bg-highlight" : "bg-highlight/40"
                      }`}
                      title={`Highlight on page ${regionPage + 1}`}
                    />
                  ))
                : null}
            </span>
            <button
              type="button"
              aria-label="Next page"
              className="rounded-md p-1 hover:bg-page disabled:opacity-40"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-page p-4">
        {unanswered ? (
          <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-line bg-card px-6 text-center">
            <p className="text-sm text-muted">No answer found for this question.</p>
          </div>
        ) : (
          <div className="flex justify-center">
            <div
              className="relative origin-top"
              style={{ width: `${zoom * 100}%`, maxWidth: "100%" }}
            >
              {/* Native img: API page URLs are dynamic and off-origin. */}
              <img
                ref={imageRef}
                src={src}
                alt={`Answer sheet page ${page + 1}`}
                className="block h-auto w-full rounded-md bg-white shadow-sm"
                onLoad={() => {
                  const image = imageRef.current;
                  if (image) {
                    setDisplay({
                      width: image.clientWidth,
                      height: image.clientHeight,
                    });
                  }
                }}
              />
              {pageRegions.map((region, index) => (
                <HighlightOverlay
                  key={`${region.page}-${region.bbox.join("-")}-${index}`}
                  bbox={region.bbox}
                  displayedWidth={display.width}
                  displayedHeight={display.height}
                  tag={tag}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {multiPage && !unanswered ? (
        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2 text-xs text-muted">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 hover:bg-page disabled:opacity-40"
            disabled={regionIndex <= 0}
            onClick={() => goToRegion(Math.max(0, regionIndex - 1))}
          >
            Prev region
          </button>
          <span className="tabular-nums">
            {Math.max(regionIndex, 0) + 1}/{selectedRegions.length} pages
          </span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 hover:bg-page disabled:opacity-40"
            disabled={regionIndex < 0 || regionIndex >= selectedRegions.length - 1}
            onClick={() =>
              goToRegion(Math.min(selectedRegions.length - 1, regionIndex + 1))
            }
          >
            Next region
          </button>
        </div>
      ) : null}
    </section>
  );
}
