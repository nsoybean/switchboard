import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CalendarDays,
  FileText,
  GitBranch,
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
const ROW_HEIGHT = 38;
const LANE_WIDTH = 18;
const GRAPH_PADDING = 18;
const LANE_COLORS = [
  "var(--sb-status-info)",
  "var(--sb-status-warning)",
  "var(--sb-diff-add-fg)",
  "var(--sb-diff-del-fg)",
  "oklch(0.68 0.13 310)",
  "oklch(0.7 0.12 190)",
  "oklch(0.72 0.14 85)",
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
}

function buildGraphRows(commits: GitGraphCommit[]): GraphRow[] {
  const lanes: string[] = [];

  return commits.map((commit) => {
    let laneIndex = lanes.indexOf(commit.hash);
    if (laneIndex === -1) {
      laneIndex = lanes.length;
      lanes.push(commit.hash);
    }

    const lanesBefore = [...lanes];
    const parents = commit.parents.filter(Boolean);

    if (parents.length === 0) {
      lanes.splice(laneIndex, 1);
    } else {
      lanes.splice(laneIndex, 1, parents[0]);
      for (let index = 1; index < parents.length; index += 1) {
        if (!lanes.includes(parents[index])) {
          lanes.splice(laneIndex + index, 0, parents[index]);
        }
      }
    }

    const lanesAfter = [...lanes];
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
    };
  });
}

function laneColor(index: number) {
  return LANE_COLORS[index % LANE_COLORS.length];
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

export const GitGraphDocument = memo(function GitGraphDocument({
  cwd,
  title = "Git Graph",
}: GitGraphDocumentProps) {
  const [commits, setCommits] = useState<GitGraphCommit[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<GitCommitFile[]>([]);
  const [diff, setDiff] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const loadGraph = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await gitCommands.graphLog(cwd, GRAPH_LIMIT);
      setCommits(next);
      setSelectedHash((current) =>
        current && next.some((commit) => commit.hash === current)
          ? current
          : next[0]?.hash ?? null,
      );
    } catch (err) {
      setError(String(err));
      setCommits([]);
      setSelectedHash(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

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
  const changedTotals = files.reduce(
    (total, file) => ({
      additions: total.additions + (file.additions ?? 0),
      deletions: total.deletions + (file.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background font-sans text-xs">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card px-3">
        <GitBranch className="size-4 text-muted-foreground" />
        <span className="font-medium text-foreground">{title}</span>
        <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
          {commits.length}
        </Badge>
        <div className="ml-2 flex h-7 min-w-0 max-w-md flex-1 items-center gap-2 rounded-md border bg-background px-2">
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
        <span className="font-mono text-[10px] text-muted-foreground">
          {normalizedQuery ? `${filteredRows.length}/${commits.length}` : `all refs`}
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <div className="min-w-0 overflow-hidden border-r">
          <div className="grid h-8 grid-cols-[var(--graph-width)_minmax(320px,1fr)_132px_120px_84px] items-center border-b bg-muted/35 px-0 text-[11px] font-medium text-muted-foreground" style={{ "--graph-width": `${graphWidth}px` } as CSSProperties}>
            <div className="px-3">Graph</div>
            <div className="px-2">Description</div>
            <div className="px-2">Date</div>
            <div className="px-2">Author</div>
            <div className="px-2">Commit</div>
          </div>
          <div className="h-[calc(100%-2rem)] overflow-auto">
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
              <div style={{ "--graph-width": `${graphWidth}px` } as CSSProperties}>
                {filteredRows.map((row) => (
                  <CommitGraphRow
                    key={row.commit.hash}
                    row={row}
                    graphWidth={graphWidth}
                    selected={row.commit.hash === selectedHash}
                    onSelect={() => setSelectedHash(row.commit.hash)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="min-w-0 overflow-y-auto bg-card/65">
          {selectedCommit ? (
            <CommitDetail
              commit={selectedCommit}
              files={files}
              diff={diff}
              loading={detailLoading}
              additions={changedTotals.additions}
              deletions={changedTotals.deletions}
            />
          ) : (
            <div className="p-4 text-muted-foreground">Select a commit.</div>
          )}
        </aside>
      </div>
    </div>
  );
});

function CommitGraphRow({
  row,
  graphWidth,
  selected,
  onSelect,
}: {
  row: GraphRow;
  graphWidth: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { commit } = row;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[var(--graph-width)_minmax(320px,1fr)_132px_120px_84px] items-center border-b text-left transition-colors",
        selected ? "bg-accent/70 text-foreground" : "hover:bg-muted/45",
      )}
      style={{
        "--graph-width": `${graphWidth}px`,
        minHeight: ROW_HEIGHT,
      } as CSSProperties}
    >
      <GraphCell row={row} width={graphWidth} />
      <div className="flex min-w-0 items-center gap-2 px-2">
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          {commit.refs.slice(0, 3).map((reference) => (
            <Badge
              key={reference}
              variant={reference.includes("origin/") ? "outline" : "secondary"}
              className="h-5 max-w-[160px] truncate px-1.5 font-mono text-[10px]"
            >
              {reference}
            </Badge>
          ))}
          {commit.refs.length > 3 ? (
            <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
              +{commit.refs.length - 3}
            </Badge>
          ) : null}
        </div>
        <span className="min-w-0 truncate text-sm text-foreground/90">{commit.subject}</span>
      </div>
      <div className="truncate px-2 text-muted-foreground">{commit.date}</div>
      <div className="truncate px-2 text-muted-foreground">{commit.author}</div>
      <div className="truncate px-2 font-mono text-muted-foreground">{commit.short_hash}</div>
    </button>
  );
}

function GraphCell({ row, width }: { row: GraphRow; width: number }) {
  const y = ROW_HEIGHT / 2;
  const currentX = laneX(row.laneIndex);
  const laneCount = Math.max(row.lanesBefore.length, row.lanesAfter.length);

  return (
    <svg width={width} height={ROW_HEIGHT} className="block">
      {Array.from({ length: laneCount }).map((_, index) => {
        const beforeActive = Boolean(row.lanesBefore[index]);
        const afterActive = Boolean(row.lanesAfter[index]);
        const x = laneX(index);
        return (
          <g key={index}>
            {beforeActive ? (
              <line x1={x} y1={0} x2={x} y2={y - 5} stroke={laneColor(index)} strokeWidth="2" strokeLinecap="round" />
            ) : null}
            {afterActive ? (
              <line x1={x} y1={y + 5} x2={x} y2={ROW_HEIGHT} stroke={laneColor(index)} strokeWidth="2" strokeLinecap="round" />
            ) : null}
          </g>
        );
      })}

      {row.parentLanes.map((parentLane, index) => {
        if (parentLane === row.laneIndex) return null;
        const targetX = laneX(parentLane);
        const controlOffset = Math.max(8, Math.abs(targetX - currentX) / 2);
        const sweep = targetX > currentX ? controlOffset : -controlOffset;
        return (
          <path
            key={`${parentLane}-${index}`}
            d={`M ${currentX} ${y} C ${currentX + sweep} ${y}, ${targetX - sweep} ${y + 8}, ${targetX} ${y + 8}`}
            fill="none"
            stroke={laneColor(parentLane)}
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}

      <circle cx={currentX} cy={y} r="4.5" fill={laneColor(row.laneIndex)} stroke="var(--background)" strokeWidth="1.5" />
    </svg>
  );
}

function CommitDetail({
  commit,
  files,
  diff,
  loading,
  additions,
  deletions,
}: {
  commit: GitGraphCommit;
  files: GitCommitFile[];
  diff: string;
  loading: boolean;
  additions: number;
  deletions: number;
}) {
  const initials = commit.author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b px-4 py-5 text-center">
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

      <div className="border-b p-4">
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
        ) : files.length === 0 ? (
          <div className="text-muted-foreground">No changed files.</div>
        ) : (
          <div className="space-y-1.5">
            {files.slice(0, 12).map((file) => (
              <div key={`${file.status}:${file.path}`} className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.path}>
                  {file.path}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{file.status}</span>
              </div>
            ))}
            {files.length > 12 ? (
              <div className="px-1 text-[11px] text-muted-foreground">+{files.length - 12} more files</div>
            ) : null}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {loading && !diff ? (
          <div className="p-4 text-muted-foreground">Loading diff...</div>
        ) : diff ? (
          <DiffView diff={diff} />
        ) : (
          <div className="p-4 text-muted-foreground">No diff available.</div>
        )}
      </div>
    </div>
  );
}
