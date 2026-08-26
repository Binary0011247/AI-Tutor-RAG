export function HighlightOverlay({
  bbox,
  displayedWidth,
  displayedHeight,
  tag,
}: {
  bbox: [number, number, number, number];
  displayedWidth: number;
  displayedHeight: number;
  tag: string;
}) {
  if (displayedWidth <= 0 || displayedHeight <= 0) return null;

  const [xMin, yMin, xMax, yMax] = bbox;
  const left = (xMin / 1000) * displayedWidth;
  const top = (yMin / 1000) * displayedHeight;
  const width = ((xMax - xMin) / 1000) * displayedWidth;
  const height = ((yMax - yMin) / 1000) * displayedHeight;

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left, top, width, height }}
    >
      <div className="absolute inset-0 rounded-lg border-[3px] border-highlight" />
      <span className="absolute -top-2.5 -left-1 rounded-full bg-highlight px-2 py-0.5 text-[11px] font-semibold leading-none text-white shadow-sm">
        {tag}
      </span>
    </div>
  );
}
