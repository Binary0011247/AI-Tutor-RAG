"use client";

export function ExtractingScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-6 h-20 w-20" aria-hidden>
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl leading-none text-accent animate-[pulse_1.6s_ease-in-out_infinite]">
          ✦
        </span>
        <span className="absolute left-1 top-1 text-lg leading-none text-accent/70 animate-[pulse_2s_ease-in-out_infinite]">
          ✦
        </span>
        <span className="absolute right-0 bottom-2 text-base leading-none text-accent/50 animate-[pulse_2.4s_ease-in-out_infinite]">
          ✦
        </span>
      </div>
      <h1 className="text-2xl font-bold text-ink">Extracting...</h1>
      <p className="mt-2 text-sm text-muted">This may take a while</p>
    </div>
  );
}
