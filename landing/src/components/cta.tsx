"use client";

import { ArrowRight, Download } from "lucide-react";
import { useState } from "react";
import { DownloadCard } from "./download-card";

function GitHubMark() {
  return (
    <svg
      viewBox="0 0 1024 1024"
      fill="none"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M512 0C229.12 0 0 229.12 0 512c0 226.56 146.56 417.92 350.08 485.76 25.6 4.48 35.2-10.88 35.2-24.32 0-12.16-.64-52.48-.64-95.36-128.64 23.68-161.92-31.36-172.16-60.16-5.76-14.72-30.72-60.16-52.48-72.32-17.92-9.6-43.52-33.28-.64-33.92 40.32-.64 69.12 37.12 78.72 52.48 46.08 77.44 119.68 55.68 149.12 42.24 4.48-33.28 17.92-55.68 32.64-68.48-113.92-12.8-232.96-56.96-232.96-252.8 0-55.68 19.84-101.76 52.48-137.6-5.12-12.8-23.04-65.28 5.12-135.68 0 0 42.88-13.44 140.8 52.48 40.96-11.52 84.48-17.28 128-17.28s87.04 5.76 128 17.28c97.92-66.56 140.8-52.48 140.8-52.48 28.16 70.4 10.24 122.88 5.12 135.68 32.64 35.84 52.48 81.28 52.48 137.6 0 196.48-119.68 240-233.6 252.8 18.56 16 34.56 46.72 34.56 94.72 0 68.48-.64 123.52-.64 140.8 0 13.44 9.6 29.44 35.2 24.32C877.44 929.92 1024 737.92 1024 512 1024 229.12 794.88 0 512 0"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CTASection() {
  const [showDownload, setShowDownload] = useState(false);

  return (
    <section className="py-20 sm:py-28">
      <div className="container-shell">
        <div className="terminal-surface overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
          <h2 className="max-w-4xl text-balance text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-5xl">
            Keep every agent moving without losing control.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-terminal-muted">
            Switchboard gives you the missing operating layer for coding agents
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowDownload(true)}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-terminal-foreground px-5 text-sm text-terminal transition-opacity hover:opacity-90"
            >
              <Download className="size-4" />
              Download
            </button>
            <a
              href="https://github.com/nsoybean/switchboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/15 px-5 text-sm text-terminal-foreground transition-colors hover:bg-white/5"
            >
              <GitHubMark />
              Star on GitHub
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </div>

      <DownloadCard
        open={showDownload}
        onClose={() => setShowDownload(false)}
      />
    </section>
  );
}
