import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { FileText, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { fileCommands, type FileIndexEntry } from "@/lib/tauri-commands";

interface FileFinderProps {
  open: boolean;
  root: string | null;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}

interface CacheEntry {
  files: FileIndexEntry[];
  loadedAt: number;
}

const fileIndexCache = new Map<string, CacheEntry>();

function compactQuery(value: string) {
  return value.toLowerCase().replace(/[\s._/-]+/g, "");
}

function searchable(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[\s._/-]+/g, " ")
    .toLowerCase();
}

function scoreNeedle(haystack: string, needle: string) {
  if (!needle) return 0;

  const direct = haystack.indexOf(needle);
  if (direct === 0) return 500 - haystack.length * 0.2;
  if (direct > 0) return 420 - direct - haystack.length * 0.05;

  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let i = 0; i < haystack.length && qi < needle.length; i++) {
    if (haystack[i] !== needle[qi]) continue;
    score += lastMatch === i - 1 ? 12 : 5;
    if (i === 0 || haystack[i - 1] === "/" || haystack[i - 1] === " " || haystack[i - 1] === "-" || haystack[i - 1] === "_") {
      score += 8;
    }
    lastMatch = i;
    qi += 1;
  }

  return qi === needle.length ? score - haystack.length * 0.01 : -Infinity;
}

function fuzzyScore(entry: FileIndexEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const basename = searchable(entry.basename);
  const relative = searchable(entry.relative_path);
  const compactBase = compactQuery(entry.basename);
  const compactRelative = compactQuery(entry.relative_path);
  const compact = compactQuery(q);
  const tokens = q.split(/[\s._/-]+/).filter(Boolean);

  const compactBaseScore = scoreNeedle(compactBase, compact);
  if (compactBaseScore > -Infinity) {
    return 1400 + compactBaseScore;
  }

  const compactRelativeScore = scoreNeedle(compactRelative, compact);
  if (compactRelativeScore > -Infinity) {
    return 900 + compactRelativeScore;
  }

  let total = 0;
  let cursor = 0;
  let ordered = true;
  for (const token of tokens) {
    const nextIndex = relative.indexOf(token, cursor);
    if (nextIndex === -1) {
      ordered = false;
      break;
    }
    total += scoreNeedle(relative.slice(nextIndex), token) - nextIndex * 0.2;
    cursor = nextIndex + token.length;
  }

  if (ordered) {
    const baseTokenBonus = tokens.every((token) => basename.includes(token)) ? 300 : 0;
    return 500 + baseTokenBonus + total - relative.length * 0.02;
  }

  if (!tokens.every((token) => relative.includes(token))) {
    return -Infinity;
  }

  const unorderedTotal = tokens.reduce((sum, token) => {
    const baseIndex = basename.indexOf(token);
    const relativeIndex = relative.indexOf(token);
    const index = baseIndex >= 0 ? baseIndex : relativeIndex;
    return sum + scoreNeedle((baseIndex >= 0 ? basename : relative).slice(index), token) - index * 0.2;
  }, 0);
  const baseTokenBonus = tokens.every((token) => basename.includes(token)) ? 80 : 0;
  return 150 + baseTokenBonus + unorderedTotal * 0.6 - relative.length * 0.02;
}

function formatSize(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function FileFinder({ open, root, onClose, onOpenFile }: FileFinderProps) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIndex = async (force = false) => {
    if (!root) {
      setFiles([]);
      setError(null);
      setLoading(false);
      return;
    }

    const cached = fileIndexCache.get(root);
    if (cached && !force) {
      setFiles(cached.files);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextFiles = await fileCommands.indexFiles(root);
      fileIndexCache.set(root, { files: nextFiles, loadedAt: Date.now() });
      setFiles(nextFiles);
    } catch (err) {
      setError(String(err));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!root) {
      setFiles([]);
      return;
    }
    void loadIndex(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  useEffect(() => {
    if (!open) return;
    void loadIndex(false);

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  const matches = useMemo(() => {
    const scored = files
      .map((file) => ({ file, score: fuzzyScore(file, query) }))
      .filter((item) => item.score > -Infinity)
      .sort((a, b) => b.score - a.score || a.file.relative_path.localeCompare(b.file.relative_path));

    return scored.slice(0, 80).map((item) => item.file);
  }, [files, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[16vh] supports-backdrop-filter:bg-background/20 supports-backdrop-filter:backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-popover/95 shadow-xl supports-backdrop-filter:backdrop-blur-sm">
        <Command shouldFilter={false} loop>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Search files..."
              value={query}
              onValueChange={setQuery}
              className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              disabled={!root || loading}
              onClick={() => void loadIndex(true)}
            >
              {loading ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
            </Button>
          </div>
          <Command.List className="max-h-[26rem] overflow-y-auto p-1.5">
            {error ? (
              <div className="px-3 py-6 text-center text-sm text-destructive">{error}</div>
            ) : loading && files.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Spinner className="size-3.5" />
                Indexing files...
              </div>
            ) : matches.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {root ? "No matching files" : "Open a project to search files"}
              </div>
            ) : (
              <Command.Group heading={`${files.length.toLocaleString()} files`}>
                {matches.map((file) => (
                  <Command.Item
                    key={file.path}
                    value={file.relative_path}
                    onSelect={() => {
                      onOpenFile(file.path);
                      onClose();
                    }}
                    className={cn(
                      "grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-2 text-sm",
                      "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    )}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{file.basename}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {file.directory || "."}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {formatSize(file.size)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
