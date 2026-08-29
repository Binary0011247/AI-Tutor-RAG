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
  const [browseAll, setBrowseAll] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [display, setDisplay] = useState({ width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  const regionPages = useMemo(
    () =>
      [...new Set(selectedRegions.map((region) => region.page))].sort(
        (a, b) => a - b
      ),
    [selectedRegions]
  );

  const regionsKey = selectedRegions
    .map((region) => `${region.page}:${region.bbox.join(",")}`)
    .join("|");

  const highlightNav = regionPages.length > 0 && !browseAll && !unanswered;
  const navPages = highlightNav ? regionPages : null;
  const navIndex = navPages ? navPages.indexOf(page) : page;
  const navCount = navPages ? navPages.length : Math.max(pageCount, 1);

  useEffect(() => {
    setBrowseAll(false);
    const first = regionPages[0];
    if (first != null) setPage(first);
  }, [regionsKey]);

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

  const goNav = (direction: -1 | 1) => {
    if (navPages) {
      const next = navPages[navIndex + direction];
      if (next != null) setPage(next);
      return;
    }
    setPage((value) =>
      Math.min(Math.max(pageCount - 1, 0), Math.max(0, value + direction))
    );
  };

  const prevDisabled = highlightNav ? navIndex <= 0 : page <= 0;
  const nextDisabled = highlightNav
    ? navIndex < 0 || navIndex >= navCount - 1
    : page >= pageCount - 1;

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
              aria-label={highlightNav ? "Previous highlighted page" : "Previous page"}
              className="rounded-md p-1 hover:bg-page disabled:opacity-40"
              disabled={prevDisabled}
              onClick={() => goNav(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex items-center gap-1.5 tabular-nums">
              Page {page + 1} of {Math.max(pageCount, 1)}
              {highlightNav && navCount > 1 ? (
                <span className="text-muted">
                  · {navIndex + 1}/{navCount}
                </span>
              ) : null}
              {regionPages.length > 0
                ? regionPages.map((regionPage) => (
                    <button
                      key={regionPage}
                      type="button"
                      aria-label={`Go to highlighted page ${regionPage + 1}`}
                      className={`h-1.5 w-1.5 rounded-full ${
                        regionPage === page ? "bg-highlight" : "bg-highlight/40"
                      }`}
                      title={`Highlight on page ${regionPage + 1}`}
                      onClick={() => {
                        setBrowseAll(false);
                        setPage(regionPage);
                      }}
                    />
                  ))
                : null}
            </span>
            <button
              type="button"
              aria-label={highlightNav ? "Next highlighted page" : "Next page"}
              className="rounded-md p-1 hover:bg-page disabled:opacity-40"
              disabled={nextDisabled}
              onClick={() => goNav(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {regionPages.length > 0 && !unanswered ? (
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-page hover:text-ink"
              onClick={() => {
                setBrowseAll((current) => {
                  const next = !current;
                  if (!next && regionPages[0] != null && !regionPages.includes(page)) {
                    setPage(regionPages[0]);
                  }
                  return next;
                });
              }}
            >
              {browseAll ? "Highlights" : "All pages"}
            </button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-page p-4">
        {unanswered ? (
          <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-line bg-card px-6 text-center">
            <p className="text-sm text-muted">No answer found for this question.</p>
          </div>
        ) : (
          <div
            className="relative mx-auto"
            style={{ width: `${zoom * 100}%` }}
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
        )}
      </div>
    </section>
  );
}
