"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { DownloadCard } from "./download-card";

export function Hero() {
  const [showDownload, setShowDownload] = useState(false);

  return (
    <section
      id="top"
      className="relative overflow-hidden px-0 pt-32 pb-16 sm:pt-40 sm:pb-24"
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-x-0 top-0 h-[38rem]"
          style={{
            backgroundImage:
              "radial-gradient(circle at top, color-mix(in oklch, var(--color-glow) 38%, transparent), transparent 60%)",
          }}
        />
      </div>

      <div className="container-shell relative">
        <div className="grid gap-12 lg:grid-cols-[0.84fr_1.16fr] lg:items-center">
          <div className="mx-auto flex max-w-xl flex-col items-start text-left">
            <h1 className="max-w-2xl text-balance text-4xl leading-[1.04] font-semibold tracking-[-0.05em] sm:text-[3.35rem] lg:text-[3.55rem]">
              Multi-agent coding workspace
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-[0.96rem] leading-8 text-muted-foreground sm:text-base">
              Run Claude Code, Codex, and Bash side by side with real terminals,
              isolated worktrees, and built-in git review.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 sm:flex-nowrap">
              <button
                type="button"
                onClick={() => setShowDownload(true)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-sm text-background transition-opacity hover:opacity-90"
              >
                Download for macOS
                <ArrowRight className="size-4" />
              </button>
              <a
                href="#why-switchboard"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-panel px-5 text-sm text-foreground transition-colors hover:bg-muted"
              >
                Why Switchboard
                <ArrowRight className="size-4" />
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[0.95rem] border border-black/8 bg-white shadow-[0_28px_90px_-42px_rgba(0,0,0,0.45)] dark:border-white/10 dark:bg-black dark:shadow-[0_28px_90px_-42px_rgba(0,0,0,0.85)]">
              <Image
                src="/switchboard/main_light_mode.png"
                alt="Switchboard in light mode showing an active coding session and built-in git review"
                width={2786}
                height={1782}
                className="w-full dark:hidden"
                priority
              />
              <Image
                src="/switchboard/main_dark_mode.png"
                alt="Switchboard in dark mode showing an active coding session and built-in git review"
                width={2786}
                height={1782}
                className="hidden w-full dark:block"
                priority
              />
            </div>
          </div>
        </div>
      </div>

      <DownloadCard open={showDownload} onClose={() => setShowDownload(false)} />
    </section>
  );
}
