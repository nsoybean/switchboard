import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  GitCommit as GitCommitIcon,
  Mail,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  gitCommands,
  type GitCommitFile,
  type GitGraphCommit,
} from "@/lib/tauri-commands";
import { DiffView } from "./DiffView";

const GRAPH_LIMIT = 300;
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 28;
const LANE_WIDTH = 15;
const GRAPH_PADDING = 15;
const GRAPH_STROKE_WIDTH = 2.2;
const DESCRIPTION_WIDTH = 600;
const DATE_WIDTH = 148;
const AUTHOR_WIDTH = 128;
const COMMIT_WIDTH = 88;
const ROW_OVERSCAN = 8;
const LANE_COLORS = [
  "oklch(0.62 0.18 252)",
  "oklch(0.66 0.18 39)",
  "oklch(0.58 0.15 328)",
  "oklch(0.64 0.16 156)",
  "oklch(0.62 0.15 205)",
  "oklch(0.62 0.15 286)",
  "oklch(0.7 0.15 92)",
];

interface GitGraphDocumentProps {
  cwd: string;
  title?: string;
}

interface GraphRow {
  commit: GitGraphCommit;
  lanesBefore: string[];
  lanesAfter: string[];
  laneIndex: number;
  parentLanes: number[];
  isNew: boolean;
}

interface VirtualRows {
  rows: GraphRow[];
  topPadding: number;
  totalHeight: number;
}

interface CommitDiffFile {
  key: string;
  path: string;
  name: string;
  directory: string;
  additions: number;
  deletions: number;
  diff: string;
}

export function buildGraphRows(commits: GitGraphCommit[]): GraphRow[] {
  const lanes: string[] = [];

  return commits.map((commit) => {
    let laneIndex = lanes.indexOf(commit.hash);
    const isNew = laneIndex === -1;
    if (isNew) {
      laneIndex = lanes.length;
      lanes.push(commit.hash);
    }

    const lanesBefore = [...lanes];
    const parents = commit.parents.filter(Boolean);
    const lanesAfter = [...lanesBefore];

    // First parent: replace commit's slot in-place to avoid shifting other lanes.
    // If first parent is already being tracked elsewhere, just remove the slot (compaction).
    const firstParent = parents[0];
    if (firstParent && !lanesAfter.includes(firstParent)) {
      lanesAfter[laneIndex] = firstParent;
    } else {
      lanesAfter.splice(laneIndex, 1);
    }

    // Additional parents: append to the far right to avoid shifting active lanes.
    for (let i = 1; i < parents.length; i++) {
      const parent = parents[i];
      if (!lanesAfter.includes(parent)) {
        lanesAfter.push(parent);
      }
    }

    lanes.splice(0, lanes.length, ...lanesAfter);
    const parentLanes = parents.map((parent) => {
      const index = lanesAfter.indexOf(parent);
      return index === -1 ? laneIndex : index;
    });

    return {
      commit,
      lanesBefore,
      lanesAfter,
      laneIndex,
      parentLanes,
      isNew,
    };
  });
}

function laneColor(index: number) {
  return LANE_COLORS[index % LANE_COLORS.length];
}

function divergenceRowSplitPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = ROW_HEIGHT / 2;
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const radius = Math.min(5, Math.abs(x2 - x1) / 2, Math.abs(y2 - midY));
  const direction = Math.sign(x2 - x1);
  const turnInX = x2 - direction * radius;
  const endY = midY + radius;

  return [
    `M ${x1} ${y1}`,
    `L ${turnInX} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${endY}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}

function roundedRowSplitPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = ROW_HEIGHT / 2;
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const radius = Math.min(5, Math.abs(x2 - x1) / 2, Math.abs(midY - y1), Math.abs(y2 - midY));
  const direction = Math.sign(x2 - x1);
  const startY = midY - radius;
  const endY = midY + radius;
  const turnOutX = x1 + direction * radius;
  const turnInX = x2 - direction * radius;

  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${startY}`,
    `Q ${x1} ${midY} ${turnOutX} ${midY}`,
    `L ${turnInX} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${endY}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}

function laneTint(index: number, alpha = 0.14) {
  return `color-mix(in oklch, ${laneColor(index)} ${Math.round(alpha * 100)}%, transparent)`;
}

function laneX(index: number) {
  return GRAPH_PADDING + index * LANE_WIDTH;
}

function matchesQuery(commit: GitGraphCommit, query: string) {
  if (!query) return true;
  const haystack = [
    commit.subject,
    commit.short_hash,
    commit.hash,
    commit.author,
    commit.email,
    ...commit.refs,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function getGridTemplate(graphWidth: number) {
  return `${graphWidth}px ${DESCRIPTION_WIDTH}px ${DATE_WIDTH}px ${AUTHOR_WIDTH}px ${COMMIT_WIDTH}px`;
}

function getVirtualRows(rows: GraphRow[], scrollTop: number, viewportHeight: number): VirtualRows {
  const totalHeight = rows.length * ROW_HEIGHT;
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + ROW_OVERSCAN * 2;
  const maxStartIndex = Math.max(0, rows.length - visibleCount);
  const startIndex = Math.min(
    maxStartIndex,
    Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - ROW_OVERSCAN),
  );
  const endIndex = Math.min(rows.length, startIndex + visibleCount);

  return {
    rows: rows.slice(startIndex, endIndex),
    topPadding: startIndex * ROW_HEIGHT,
    totalHeight,
  };
}

function parseCommitDiff(diff: string): CommitDiffFile[] {
  const lines = diff.split("\n");
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current.length > 0) sections.push(current);
      current = [line];
      continue;
    }

    if (current.length > 0) current.push(line);
  }

  if (current.length > 0) sections.push(current);

  return sections.map((section, index) => {
    const path = getDiffPath(section[0]) ?? `File ${index + 1}`;
    const slashIndex = path.lastIndexOf("/");
    const name = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
    const directory = slashIndex >= 0 ? `${path.slice(0, slashIndex)}/` : "";
    let additions = 0;
    let deletions = 0;

    for (const line of section) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
      if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    }

    return {
      key: path,
      path,
      name,
      directory,
      additions,
      deletions,
      diff: section.join("\n"),
    };
  });
}

function getDiffPath(header: string) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(header);
  if (!match) return null;
  return match[2] || match[1] || null;
}

export const GitGraphDocument = memo(function GitGraphDocument({
  cwd,
}: GitGraphDocumentProps) {
  const [commits, setCommits] = useState<GitGraphCommit[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<GitCommitFile[]>([]);
  const [diff, setDiff] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [listRef, listSize] = useElementSize<HTMLDivElement>();

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await gitCommands.graphLog(cwd, GRAPH_LIMIT);
      setCommits(next);
      setSelectedHash((current) =>
        current && next.some((commit) => commit.hash === current)
          ? current
          : null,
      );
    } catch (err) {
      setError(String(err));
      setCommits([]);
      setSelectedHash(null);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    if (!selectedHash) {
      setFiles([]);
      setDiff("");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setFiles([]);
    setDiff("");

    Promise.all([
      gitCommands.commitFiles(cwd, selectedHash).catch(() => []),
      gitCommands.showCommit(cwd, selectedHash).catch((err) => `Unable to load diff: ${String(err)}`),
    ])
      .then(([nextFiles, nextDiff]) => {
        if (cancelled) return;
        setFiles(nextFiles);
        setDiff(nextDiff);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cwd, selectedHash]);

  const graphRows = useMemo(() => buildGraphRows(commits), [commits]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(
    () => graphRows.filter((row) => matchesQuery(row.commit, normalizedQuery)),
    [graphRows, normalizedQuery],
  );
  const selectedCommit = useMemo(
    () => commits.find((commit) => commit.hash === selectedHash) ?? null,
    [commits, selectedHash],
  );
  const maxLaneCount = Math.max(
    1,
    ...graphRows.map((row) => Math.max(row.lanesBefore.length, row.lanesAfter.length)),
  );
  const graphWidth = GRAPH_PADDING * 2 + maxLaneCount * LANE_WIDTH;
  const gridTemplateColumns = getGridTemplate(graphWidth);
  const tableWidth = graphWidth + DESCRIPTION_WIDTH + DATE_WIDTH + AUTHOR_WIDTH + COMMIT_WIDTH;
  const columnDividerOffsets = [
    graphWidth,
    graphWidth + DESCRIPTION_WIDTH,
    graphWidth + DESCRIPTION_WIDTH + DATE_WIDTH,
    graphWidth + DESCRIPTION_WIDTH + DATE_WIDTH + AUTHOR_WIDTH,
  ];
  const virtualRows = useMemo(
    () => getVirtualRows(filteredRows, scrollTop, Math.max(0, listSize.height - HEADER_HEIGHT)),
    [filteredRows, listSize.height, scrollTop],
  );
  const handleSelectHash = useCallback((hash: string) => {
    setSelectedHash(hash);
  }, []);
  const changedTotals = files.reduce(
    (total, file) => ({
      additions: total.additions + (file.additions ?? 0),
      deletions: total.deletions + (file.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background font-sans text-xs">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card/85 px-3 backdrop-blur">
        <div className="flex h-7 min-w-[180px] flex-1 items-center gap-2 rounded-md border bg-background px-2 shadow-xs sm:max-w-4xl">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commits..."
            className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Badge variant="outline" className="hidden h-6 shrink-0 px-2 font-mono text-[10px] sm:inline-flex">
          {normalizedQuery ? `${filteredRows.length}/${commits.length}` : `${commits.length} commits`}
        </Badge>
        <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground md:inline">
          all refs
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => void loadGraph()}
          disabled={loading}
        >
          {loading ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
        </Button>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 overflow-hidden",
          selectedCommit
            ? "grid-cols-[minmax(0,1fr)_clamp(340px,34vw,520px)]"
            : "grid-cols-[minmax(0,1fr)]",
        )}
      >
        <div className="min-w-0 border-r">
          <div
            ref={listRef}
            className="h-full overflow-auto bg-muted/10 contain-strict"
            onScroll={(event) => setScrollTop(Math.max(0, event.currentTarget.scrollTop - HEADER_HEIGHT))}
          >
            {loading && commits.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Spinner className="mr-2 size-4" />
                Loading graph
              </div>
            ) : error ? (
              <div className="p-4 text-destructive">{error}</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-4 text-muted-foreground">No matching commits.</div>
            ) : (
              <div className="relative" style={{ minWidth: tableWidth }}>
                <div className="pointer-events-none absolute inset-y-0 left-0 z-20">
                  {columnDividerOffsets.map((offset) => (
                    <div
                      key={offset}
                      className="absolute top-0 bottom-0 w-px bg-border"
                      style={{ left: offset }}
                    />
                  ))}
                </div>
                <div
                  className="sticky top-0 z-10 grid h-7 items-center border-b bg-muted/55 px-0 text-[11px] font-medium text-muted-foreground/90 shadow-[0_1px_0_var(--border)] backdrop-blur"
                  style={{ gridTemplateColumns } as CSSProperties}
                >
                  <div className="px-3">Graph</div>
                  <div className="px-2">Description</div>
                  <div className="px-2">Date</div>
                  <div className="px-2">Author</div>
                  <div className="px-2">Commit</div>
                </div>
                <div className="relative" style={{ height: virtualRows.totalHeight }}>
                  <div
                    className="absolute left-0 right-0 top-0"
                    style={{ transform: `translateY(${virtualRows.topPadding}px)` }}
                  >
                    {virtualRows.rows.map((row) => (
                      <CommitGraphRow
                        key={row.commit.hash}
                        row={row}
                        graphWidth={graphWidth}
                        gridTemplateColumns={gridTemplateColumns}
                        selected={row.commit.hash === selectedHash}
                        onSelectHash={handleSelectHash}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedCommit ? (
          <aside className="min-w-0 overflow-y-auto border-l bg-card/75">
            <CommitDetail
              commit={selectedCommit}
              files={files}
              diff={diff}
              loading={detailLoading}
              additions={changedTotals.additions}
              deletions={changedTotals.deletions}
              onClose={() => setSelectedHash(null)}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
});

const CommitGraphRow = memo(function CommitGraphRow({
  row,
  graphWidth,
  gridTemplateColumns,
  selected,
  onSelectHash,
}: {
  row: GraphRow;
  graphWidth: number;
  gridTemplateColumns: string;
  selected: boolean;
  onSelectHash: (hash: string) => void;
}) {
  const { commit } = row;
  const handleSelect = useCallback(() => {
    onSelectHash(commit.hash);
  }, [commit.hash, onSelectHash]);

  return (
    <button
      type="button"
      onClick={handleSelect}
      className={cn(
        "grid w-full items-center text-left",
        selected
          ? "bg-muted/80 text-foreground shadow-[inset_3px_0_0_var(--primary)]"
          : "text-muted-foreground hover:bg-muted/45",
      )}
      style={{
        gridTemplateColumns,
        height: ROW_HEIGHT,
        contain: "layout paint style",
      } as CSSProperties}
    >
      <GraphCell row={row} width={graphWidth} />
      <div className="flex min-w-0 items-center gap-2 overflow-hidden px-2 whitespace-nowrap">
        <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden">
          {commit.refs.slice(0, 3).map((reference, index) => (
            <Badge
              key={reference}
              variant={reference.includes("origin/") ? "outline" : "secondary"}
              className="h-[20px] max-w-[180px] shrink-0 truncate rounded-[4px] border px-1.5 font-mono text-[10px] font-medium"
              style={{
                backgroundColor: laneTint(row.parentLanes[index] ?? row.laneIndex, 0.1),
                borderColor: laneColor(row.parentLanes[index] ?? row.laneIndex),
                color: "var(--foreground)",
              }}
            >
              <span className="min-w-0 truncate">{reference}</span>
            </Badge>
          ))}
          {commit.refs.length > 3 ? (
            <Badge variant="outline" className="h-[20px] rounded-[4px] px-1.5 font-mono text-[10px]">
              +{commit.refs.length - 3}
            </Badge>
          ) : null}
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px]">{commit.subject}</span>
      </div>
      <div className="truncate px-2 font-mono text-[11px] whitespace-nowrap">{commit.date}</div>
      <div className="truncate px-2 whitespace-nowrap">{commit.author}</div>
      <div className="truncate px-2 font-mono text-muted-foreground whitespace-nowrap">{commit.short_hash}</div>
    </button>
  );
});

const GraphCell = memo(function GraphCell({ row, width }: { row: GraphRow; width: number }) {
  const y = ROW_HEIGHT / 2;
  const currentX = laneX(row.laneIndex);

  // Build an index map so lane moves can be drawn as one connected edge.
  const afterMap = new Map<string, number>();
  row.lanesAfter.forEach((hash, i) => { if (hash) afterMap.set(hash, i); });

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="block overflow-visible"
      shapeRendering="geometricPrecision"
      style={{ contain: "paint" }}
    >
      {/* Pass-through lanes: hashes active before this commit that continue after.
          When a lane shifts position (e.g. left-compaction after a merge), draw an
          orthogonal row split so the line stays connected instead of becoming two stubs. */}
      {row.lanesBefore.map((hash, fromIdx) => {
        if (!hash || hash === row.commit.hash) return null;
        const toIdx = afterMap.get(hash);
        if (toIdx === undefined) return null;
        const fromX = laneX(fromIdx);
        const toX = laneX(toIdx);
        if (fromX === toX) {
          return (
            <line key={`pass-${fromIdx}`} x1={fromX} y1={0} x2={toX} y2={ROW_HEIGHT}
              stroke={laneColor(fromIdx)} strokeWidth={GRAPH_STROKE_WIDTH} strokeLinecap="round" opacity="0.9" />
          );
        }
        return (
          <path key={`shift-${fromIdx}`}
            d={roundedRowSplitPath(fromX, 0, toX, ROW_HEIGHT)}
            fill="none" stroke={laneColor(fromIdx)} strokeWidth={GRAPH_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        );
      })}

      {/* Incoming half-line: only when this commit was already being tracked from above */}
      {!row.isNew && (
        <line x1={currentX} y1={0} x2={currentX} y2={y}
          stroke={laneColor(row.laneIndex)} strokeWidth={GRAPH_STROKE_WIDTH} strokeLinecap="round" opacity="0.9" />
      )}

      {/* Outgoing parent lines: straight down for same-lane parents, row split for others */}
      {row.parentLanes.map((parentLane, idx) => {
        const targetX = laneX(parentLane);
        if (parentLane === row.laneIndex) {
          return (
            <line key={`par-${idx}`} x1={currentX} y1={y} x2={currentX} y2={ROW_HEIGHT}
              stroke={laneColor(row.laneIndex)} strokeWidth={GRAPH_STROKE_WIDTH} strokeLinecap="round" opacity="0.9" />
          );
        }
        return (
          <path key={`par-${idx}`}
            d={divergenceRowSplitPath(currentX, y, targetX, ROW_HEIGHT)}
            fill="none" stroke={laneColor(parentLane)} strokeWidth={GRAPH_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        );
      })}

      <circle cx={currentX} cy={y} r="4.15" fill={laneColor(row.laneIndex)} opacity="0.22" />
      <circle cx={currentX} cy={y} r="3.65" fill={laneColor(row.laneIndex)} stroke="var(--background)" strokeWidth="0.6" />
      <circle cx={currentX} cy={y} r="1.65" fill="color-mix(in oklch, white 60%, transparent)" opacity="0.48" />
    </svg>
  );
});

function CommitDetail({
  commit,
  files,
  diff,
  loading,
  additions,
  deletions,
  onClose,
}: {
  commit: GitGraphCommit;
  files: GitCommitFile[];
  diff: string;
  loading: boolean;
  additions: number;
  deletions: number;
  onClose: () => void;
}) {
  const [expandedFileKeys, setExpandedFileKeys] = useState<Set<string>>(() => new Set());
  const diffFiles = useMemo(() => parseCommitDiff(diff), [diff]);
  const diffFilesByPath = useMemo(() => {
    const next = new Map<string, CommitDiffFile>();
    for (const file of diffFiles) {
      next.set(file.path, file);
    }
    return next;
  }, [diffFiles]);

  useEffect(() => {
    setExpandedFileKeys(new Set());
  }, [commit.hash]);

  const toggleFile = (key: string) => {
    setExpandedFileKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const initials = commit.author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative border-b px-4 py-5 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 size-7"
          onClick={onClose}
          aria-label="Close commit details"
        >
          <X className="size-4" />
        </Button>
        <div className="mx-auto flex size-14 items-center justify-center rounded-full border bg-background font-medium text-muted-foreground">
          {initials}
        </div>
        <div className="mt-3 font-medium text-foreground">{commit.author}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{commit.date}</div>
      </div>

      <div className="space-y-3 border-b p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="size-3.5" />
          <span className="min-w-0 truncate">{commit.email || "No email"}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <GitCommitIcon className="size-3.5" />
          <span className="min-w-0 truncate font-mono"># {commit.hash}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="size-3.5" />
          <span>{commit.relative_date}</span>
        </div>
      </div>

      <div className="border-b p-4">
        <p className="text-base font-medium leading-relaxed text-foreground">{commit.subject}</p>
        {commit.refs.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {commit.refs.map((reference) => (
              <Badge key={reference} variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
                {reference}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-medium text-foreground">
            {files.length} {files.length === 1 ? "Changed File" : "Changed Files"}
          </span>
          <span className="ml-auto font-mono text-[11px]">
            <span className="text-[var(--sb-diff-add-fg)]">+{additions}</span>
            <span className="mx-1 text-muted-foreground">/</span>
            <span className="text-[var(--sb-diff-del-fg)]">-{deletions}</span>
          </span>
        </div>
        {loading && files.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-3.5" />
            Loading files
          </div>
        ) : files.length === 0 && diffFiles.length === 0 ? (
          <div className="text-muted-foreground">No changed files.</div>
        ) : (
          <div className="space-y-1.5">
            {(files.length > 0
              ? files
              : diffFiles.map((file) => ({
                  path: file.path,
                  status: "M",
                  additions: file.additions,
                  deletions: file.deletions,
                }))
            ).map((file) => {
              const fileDiff = diffFilesByPath.get(file.path);
              const key = fileDiff?.key ?? `${file.status}:${file.path}`;
              const isExpanded = expandedFileKeys.has(key);
              const slashIndex = file.path.lastIndexOf("/");
              const name = slashIndex >= 0 ? file.path.slice(slashIndex + 1) : file.path;
              const directory = slashIndex >= 0 ? `${file.path.slice(0, slashIndex)}/` : "";
              const fileAdditions = file.additions ?? fileDiff?.additions ?? 0;
              const fileDeletions = file.deletions ?? fileDiff?.deletions ?? 0;

              return (
                <div key={`${file.status}:${file.path}`} className="overflow-hidden rounded-md border bg-background">
                  <button
                    type="button"
                    className={cn(
                      "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-2 py-1.5 text-left transition-colors",
                      isExpanded ? "bg-accent/55" : "hover:bg-muted/35",
                    )}
                    onClick={() => toggleFile(key)}
                    aria-expanded={isExpanded}
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px]" title={file.path}>
                      <span className="min-w-0 truncate text-foreground">{name}</span>
                      {directory ? (
                        <span className="min-w-0 truncate text-muted-foreground">{directory}</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
                      {fileAdditions > 0 ? (
                        <span className="text-[var(--sb-diff-add-fg)]">+{fileAdditions}</span>
                      ) : null}
                      {fileDeletions > 0 ? (
                        <span className="text-[var(--sb-diff-del-fg)]">-{fileDeletions}</span>
                      ) : null}
                      <span className="text-muted-foreground">{file.status}</span>
                    </span>
                    <ChevronRight
                      className={cn(
                        "size-3 shrink-0 text-muted-foreground transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                  </button>
                  {isExpanded ? (
                    <div className="border-t bg-background/35">
                      {loading && !fileDiff ? (
                        <div className="flex items-center justify-center p-4">
                          <Spinner className="size-3.5" />
                        </div>
                      ) : fileDiff ? (
                        <DiffView diff={fileDiff.diff} />
                      ) : (
                        <div className="p-3 text-[11px] text-muted-foreground">No diff available.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
