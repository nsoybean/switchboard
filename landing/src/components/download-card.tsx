"use client";

import { useEffect, useRef, useState } from "react";
import { Apple, Download, X } from "lucide-react";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

function useLatestRelease() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/nsoybean/switchboard/releases/latest")
      .then((r) => r.json())
      .then((data: ReleaseInfo) => setRelease(data))
      .catch(() => {});
  }, []);

  return release;
}

function getDownloadUrl(release: ReleaseInfo | null, arch: "aarch64" | "x86_64"): string {
  if (release) {
    const asset = release.assets.find((a) => a.name.includes(arch) && a.name.endsWith(".dmg"));
    if (asset) return asset.browser_download_url;
  }
  return "https://github.com/nsoybean/switchboard/releases/latest";
}

export function DownloadCard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const release = useLatestRelease();
  const version = release?.tag_name ?? "";

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <div className="mb-6">
          <h3 className="text-lg font-semibold">Download Switchboard</h3>
          {version && (
            <p className="mt-1 text-sm text-muted-foreground">{version}</p>
          )}
        </div>

        <div className="space-y-3">
          <a
            href={getDownloadUrl(release, "aarch64")}
            className="flex items-center gap-3 rounded-xl bg-foreground px-5 py-3.5 text-background transition-opacity hover:opacity-90"
          >
            <Apple className="size-5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium">Download for Mac</div>
              <div className="text-xs opacity-70">Apple Silicon</div>
            </div>
            <Download className="size-4 shrink-0 opacity-70" />
          </a>

          <a
            href={getDownloadUrl(release, "x86_64")}
            className="flex items-center gap-3 rounded-xl border border-border bg-background px-5 py-3.5 text-foreground transition-colors hover:bg-muted"
          >
            <Apple className="size-5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-medium">Download for Mac</div>
              <div className="text-xs text-muted-foreground">Intel</div>
            </div>
            <Download className="size-4 shrink-0 text-muted-foreground" />
          </a>
        </div>

        <div className="mt-5 rounded-lg bg-muted px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            After downloading, allow the app to open:
          </p>
          <code className="block rounded bg-background px-3 py-2 font-mono text-xs text-foreground">
            xattr -cr /Applications/Switchboard.app
          </code>
          <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
            The app is not yet code-signed with an Apple Developer certificate.
            Run the command above, then open normally.
          </p>
        </div>
      </div>
    </div>
  );
}
