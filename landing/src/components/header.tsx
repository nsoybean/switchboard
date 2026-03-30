"use client";

import Image from "next/image";
import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { DownloadCard } from "./download-card";

type ThemeMode = "dark" | "light";

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

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function Header() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const nextTheme: ThemeMode = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="container-shell pt-4">
        <div className="panel-surface flex min-h-16 items-center justify-between px-4 py-3 backdrop-blur">
          <a href="#top" className="flex items-center gap-3">
            <Image
              src="/switchboard/app-icon.png"
              alt="Switchboard app icon"
              width={40}
              height={40}
              className="size-10"
            />
            <span className="text-sm font-semibold tracking-[0.14em] uppercase">
              Switchboard
            </span>
          </a>

          <nav className="hidden items-center gap-6 text-[0.8rem] text-muted-foreground lg:flex">
            <a href="#why-switchboard" className="transition-colors hover:text-foreground">
              Why Switchboard
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex size-10 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === "light" ? (
                <MoonStar className="size-4" />
              ) : (
                <SunMedium className="size-4" />
              )}
            </button>
            <a
              href="https://github.com/nsoybean/switchboard"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden size-10 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground transition-colors hover:text-foreground sm:flex"
              aria-label="GitHub repository"
            >
              <GitHubMark />
            </a>
            <button
              type="button"
              onClick={() => setShowDownload(true)}
              className="inline-flex h-10 items-center rounded-2xl bg-foreground px-4 text-sm text-background transition-opacity hover:opacity-90"
            >
              Download
            </button>
          </div>
        </div>
      </div>

      <DownloadCard open={showDownload} onClose={() => setShowDownload(false)} />
    </header>
  );
}
