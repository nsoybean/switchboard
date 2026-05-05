import { memo, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderTree,
  GitCommit,
  GitPullRequest,
  List,
  FileText,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fileCommands, gitCommands, type ChangedFile, type StashEntry } from "../../lib/tauri-commands";
import { BranchPicker } from "./BranchPicker";
import { DiffView } from "./DiffView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitState, GitActions } from "@/hooks/useGitState";
import type { Session } from "@/state/types";

interface GitPanelProps {
  cwd: string;
  git: GitState & GitActions;
  sessions?: Session[];
  projectPath?: string | null;
  githubToken?: string | null;
  onCreateBranch?: (branchName?: string) => void;
  onCreateWorktree?: (label?: string) => void;
  onSelectWorktree?: (path: string) => void;
  onCreatePr?: () => void;
  onFileSelect?: (filePath: string) => void;
  onOpenDiff?: (diff: { path: string; staged: boolean; status: string }) => void;
  onOpenStashDiff?: (stash: StashEntry) => void | Promise<void>;
  activeDiffPath?: string | null;
  activeDiffStaged?: boolean | null;
}

type CommitMode = "tracked" | "staged" | "all";
type ChangesViewMode = "flat" | "tree";

interface ChangeTreeNode {
  name: string;
  path: string;
  dirs: Map<string, ChangeTreeNode>;
  files: ChangedFile[];
}

function fileKey(file: ChangedFile) {
  return `${file.path}\0${file.staged ? "staged" : "unstaged"}`;
}

function statusLabel(status: string) {
  if (status === "??") return "?";
  return status;
}

function commitModeLabel(mode: CommitMode) {
  if (mode === "tracked") return "Commit Tracked";
  if (mode === "all") return "Commit All";
  return "Commit Staged";
}

function hasFileStats(file: ChangedFile) {
  return typeof file.additions === "number" || typeof file.deletions === "number";
}

function splitFilePath(path: string) {
  const index = path.lastIndexOf("/");
  if (index === -1) {
    return { name: path, directory: "" };
  }

  return {
    name: path.slice(index + 1),
    directory: path.slice(0, index),
  };
}

function countTreeFiles(node: ChangeTreeNode): number {
  let count = node.files.length;
  node.dirs.forEach((child) => {
    count += countTreeFiles(child);
  });
  return count;
}

export const GitPanel = memo(function GitPanel({
  cwd,
  git,
  sessions = [],
  projectPath,
  githubToken = null,
  onCreateBranch,
  onCreateWorktree,
  onCreatePr,
  onFileSelect,
  onOpenStashDiff,
}: GitPanelProps) {
  const [expandedFileKey, setExpandedFileKey] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [commitMode, setCommitMode] = useState<CommitMode>("all");
  const [commitPending, setCommitPending] = useState(false);
  const [pullPending, setPullPending] = useState(false);
  const [pushPending, setPushPending] = useState(false);
  const [fetchPending, setFetchPending] = useState(false);
  const [stashPending, setStashPending] = useState(false);
  const [manualPrPending, setManualPrPending] = useState(false);
  const [viewMode, setViewMode] = useState<ChangesViewMode>("flat");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const sortedFiles = useMemo(
    () =>
      [...git.files].sort((a, b) => {
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        if (a.staged !== b.staged) return a.staged ? -1 : 1;
        return a.status.localeCompare(b.status);
      }),
    [git.files],
  );

  const { treeRoot, treeDirPaths } = useMemo(() => {
    const root: ChangeTreeNode = {
      name: "",
      path: "",
      dirs: new Map(),
      files: [],
    };
    const dirPaths = new Set<string>();

    sortedFiles.forEach((file) => {
      const parts = file.path.split("/");
      let current = root;

      parts.slice(0, -1).forEach((part, index) => {
        const path = parts.slice(0, index + 1).join("/");
        let next = current.dirs.get(part);

        if (!next) {
          next = {
            name: part,
            path,
            dirs: new Map(),
            files: [],
          };
          current.dirs.set(part, next);
        }

        dirPaths.add(path);
        current = next;
      });

      current.files.push(file);
    });

    return {
      treeRoot: root,
      treeDirPaths: [...dirPaths].sort(),
    };
  }, [sortedFiles]);

  useEffect(() => {
    setExpandedFileKey(null);
    setFileDiff("");
    setCommitMsg("");
    setExpandedDirs(new Set());
  }, [cwd]);

  useEffect(() => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      treeDirPaths.forEach((path) => next.add(path));
      return next;
    });
  }, [treeDirPaths]);

  useEffect(() => {
    if (!expandedFileKey) {
      setFileDiff("");
      return;
    }

    const expandedFile = sortedFiles.find((file) => fileKey(file) === expandedFileKey);
    if (!expandedFile) {
      setFileDiff("");
      return;
    }

    let cancelled = false;
    setFileDiff("");

    const loadDiff = async () => {
      try {
        if (expandedFile.status === "??" && !expandedFile.staged) {
          const filePath = `${cwd.replace(/\/$/, "")}/${expandedFile.path}`;
          const contents = await fileCommands.readFile(filePath);
          if (cancelled) return;

          setFileDiff(
            contents
              .split("\n")
              .map((line) => `+${line}`)
              .join("\n"),
          );
          return;
        }

        const diff = await gitCommands.diff(cwd, expandedFile.path, expandedFile.staged);
        if (!cancelled) setFileDiff(diff);
      } catch (err) {
        if (!cancelled) {
          setFileDiff(
            `diff --git a/${expandedFile.path} b/${expandedFile.path}\nUnable to load diff: ${String(err)}`,
          );
        }
      }
    };

    void loadDiff();

    return () => {
      cancelled = true;
    };
    // Keep polling from reloading the visible diff when the same row is still expanded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, expandedFileKey]);

  const stagedCount = git.files.filter((file) => file.staged).length;
  const unstagedCount = git.files.filter((file) => !file.staged).length;
  const trackedUnstagedFiles = git.files.filter(
    (file) => !file.staged && file.status !== "??",
  );
  const untrackedCount = git.files.filter((file) => file.status === "??").length;
  const hasChanges = git.files.length > 0;
  const allChangesStaged = hasChanges && unstagedCount === 0;
  const bulkStageLabel = allChangesStaged ? "Unstage All" : "Stage All";
  const bulkStageDisabled = allChangesStaged ? stagedCount === 0 : unstagedCount === 0;
  const handleBulkStageToggle = allChangesStaged ? git.unstageAll : git.stageAll;
  const hasCommitTarget =
    commitMode === "staged"
      ? stagedCount > 0
      : commitMode === "tracked"
        ? stagedCount > 0 || trackedUnstagedFiles.length > 0
        : hasChanges;
  const canPush = git.aheadBehind.ahead > 0;
  const canPull = git.aheadBehind.behind > 0;
  const canCreatePr = Boolean(git.branch && githubToken && onCreatePr);
  const canManualPr = Boolean(git.branch);
  const anyGitPending =
    git.branchActionPending ||
    Boolean(git.pendingAction) ||
    pullPending ||
    pushPending ||
    fetchPending ||
    stashPending ||
    manualPrPending ||
    commitPending;
  const isNotGitRepo =
    git.error !== null &&
    (git.error.includes("not a git repository") ||
      git.error.includes("needed a single revision"));

  const toggleFile = (file: ChangedFile) => {
    const key = fileKey(file);
    setExpandedFileKey((prev) => (prev === key ? null : key));
  };

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleStageStateChange = async (file: ChangedFile, checked: boolean) => {
    if (checked === file.staged) return;
    if (expandedFileKey === fileKey(file)) {
      setExpandedFileKey(fileKey({ ...file, staged: checked }));
    }
    if (checked) {
      await git.stageFiles([file.path]);
    } else {
      await git.unstageFiles([file.path]);
    }
  };

  const handleDiscardFile = async (file: ChangedFile) => {
    if (expandedFileKey === fileKey(file)) {
      setExpandedFileKey(null);
    }
    if (file.staged) {
      await git.unstageFiles([file.path]);
    }
    await git.revertFiles([file.path]);
  };

  const handleOpenFile = (file: ChangedFile) => {
    if (file.status === "D") return;
    onFileSelect?.(`${cwd.replace(/\/$/, "")}/${file.path}`);
  };

  const handlePull = async () => {
    if (!canPull || pullPending || anyGitPending) return;
    setPullPending(true);
    try {
      await git.pull();
    } finally {
      setPullPending(false);
    }
  };

  const handlePush = async () => {
    if (!canPush || pushPending || anyGitPending) return;
    setPushPending(true);
    try {
      await git.push();
    } finally {
      setPushPending(false);
    }
  };

  const handleFetch = async () => {
    if (fetchPending) return;
    setFetchPending(true);
    try {
      await git.fetch();
    } finally {
      setFetchPending(false);
    }
  };

  const handleStash = async () => {
    if (!hasChanges || stashPending || anyGitPending) return;
    setStashPending(true);
    try {
      await git.stash();
    } finally {
      setStashPending(false);
    }
  };

  const handleCreatePr = async () => {
    if (!canCreatePr || anyGitPending) return;
    onCreatePr?.();
  };

  const handleManualPr = async () => {
    if (!canManualPr || manualPrPending || anyGitPending) return;
    setManualPrPending(true);
    try {
      const publish = gitCommands.manualPrUrl(cwd);
      toast.promise(publish, {
        loading: "Publishing branch...",
        success: "Opening pull request page",
        error: (err) => `Failed to publish branch: ${String(err)}`,
      });
      const url = await publish;
      await open(url);
      await git.refresh();
    } finally {
      setManualPrPending(false);
    }
  };

  const handleCommit = async () => {
    const message = commitMsg.trim();
    if (!message || !hasCommitTarget || commitPending || git.branchActionPending) return;

    setCommitPending(true);
    try {
      if (commitMode === "tracked" && trackedUnstagedFiles.length > 0) {
        await git.stageFiles(trackedUnstagedFiles.map((file) => file.path));
      } else if (commitMode === "all" && unstagedCount > 0) {
        await git.stageAll();
      }

      await git.commit(message);
      setCommitMsg("");
      setExpandedFileKey(null);
    } finally {
      setCommitPending(false);
    }
  };

  const renderFileRow = (file: ChangedFile, depth = 0) => {
    const key = fileKey(file);
    const isExpanded = expandedFileKey === key;
    const filePathParts = splitFilePath(file.path);

    return (
      <div key={key}>
        <div
          onClick={() => toggleFile(file)}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          className={cn(
            "group/file relative grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-1.5 py-1.5 pr-3 text-xs transition-colors",
            isExpanded ? "bg-accent/55" : "hover:bg-muted/35",
          )}
        >
          <span onClick={(event) => event.stopPropagation()}>
            <Checkbox
              checked={file.staged}
              aria-label={file.staged ? `Unstage ${file.path}` : `Stage ${file.path}`}
              onCheckedChange={(checked) =>
                void handleStageStateChange(file, checked === true)
              }
            />
          </span>
          <span
            className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px]"
            title={file.path}
          >
            <span className="min-w-0 truncate text-foreground/85">
              {filePathParts.name}
            </span>
            {viewMode === "flat" && filePathParts.directory ? (
              <span className="min-w-0 truncate text-muted-foreground">
                {filePathParts.directory}
              </span>
            ) : null}
          </span>
          <Badge
            variant="secondary"
            className={cn(
              "h-4 shrink-0 px-1 font-mono text-[10px]",
              (file.status === "A" || file.status === "??") &&
                "text-[var(--sb-diff-add-fg)]",
              file.status === "D" && "text-[var(--sb-diff-del-fg)]",
              file.status === "M" && "text-[var(--sb-status-warning)]",
            )}
          >
            {statusLabel(file.status)}
          </Badge>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
            {hasFileStats(file) ? (
              <>
              {typeof file.additions === "number" && file.additions > 0 ? (
                <span className="text-[var(--sb-diff-add-fg)]">+{file.additions}</span>
              ) : null}
              {typeof file.deletions === "number" && file.deletions > 0 ? (
                <span className="text-[var(--sb-diff-del-fg)]">-{file.deletions}</span>
              ) : null}
              </>
            ) : null}
          </span>
          <div className="pointer-events-none absolute right-7 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-background/95 opacity-0 shadow-sm transition-opacity group-hover/file:pointer-events-auto group-hover/file:opacity-100 group-focus-within/file:pointer-events-auto group-focus-within/file:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  disabled={!onFileSelect || file.status === "D"}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenFile(file);
                  }}
                >
                  <FileText />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {file.status === "D" ? "Deleted file cannot be opened" : "Open file"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDiscardFile(file);
                  }}
                >
                  {file.status === "??" ? <Trash2 /> : <Undo2 />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {file.status === "??" ? "Delete file" : "Revert file"}
              </TooltipContent>
            </Tooltip>
          </div>
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-90",
            )}
          />
        </div>
        {isExpanded ? (
          <div className="bg-background/35">
            {fileDiff ? (
              <DiffView diff={fileDiff} />
            ) : (
              <div className="flex items-center justify-center p-4">
                <Spinner className="size-3.5" />
              </div>
            )}
            <div className="flex items-center gap-1 border-t px-3 py-1.5">
              {file.staged ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => void git.unstageFiles([file.path])}
                >
                  Unstage file
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => void git.stageFiles([file.path])}
                >
                  Stage file
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => void handleDiscardFile(file)}
              >
                {file.status === "??" ? "Delete file" : "Revert file"}
              </Button>
              {file.status !== "D" && onFileSelect ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => handleOpenFile(file)}
                >
                  Open file
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderTreeNode = (node: ChangeTreeNode, depth = 0) => {
    const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    const files = [...node.files].sort((a, b) => {
      const nameCompare = a.path.localeCompare(b.path);
      if (nameCompare !== 0) return nameCompare;
      if (a.staged !== b.staged) return a.staged ? -1 : 1;
      return a.status.localeCompare(b.status);
    });

    return (
      <>
        {dirs.map((dir) => {
          const isOpen = expandedDirs.has(dir.path);
          const count = countTreeFiles(dir);

          return (
            <div key={dir.path}>
              <button
                type="button"
                onClick={() => toggleDir(dir.path)}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                className="flex w-full min-w-0 items-center gap-2 py-1.5 pr-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              >
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
                <Folder className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                  {dir.name}
                </span>
                <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px]">
                  {count}
                </Badge>
              </button>
              {isOpen ? renderTreeNode(dir, depth + 1) : null}
            </div>
          );
        })}
        {files.map((file) => renderFileRow(file, depth))}
      </>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card font-sans">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="whitespace-nowrap text-xs font-medium text-foreground">
            {git.files.length} {git.files.length === 1 ? "file" : "files"}
          </span>
          {(git.stats.additions > 0 || git.stats.deletions > 0) && (
            <span className="flex items-center gap-1 font-mono text-[10px] tabular-nums">
              {git.stats.additions > 0 ? (
                <span className="text-[var(--sb-diff-add-fg)]">+{git.stats.additions}</span>
              ) : null}
              {git.stats.deletions > 0 ? (
                <span className="text-[var(--sb-diff-del-fg)]">-{git.stats.deletions}</span>
              ) : null}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="mr-1 inline-flex rounded-md border bg-background/70 p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={viewMode === "flat" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-5"
                  onClick={() => setViewMode("flat")}
                >
                  <List />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Flat view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={viewMode === "tree" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-5"
                  onClick={() => setViewMode("tree")}
                >
                  <FolderTree />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tree view</TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => void handleBulkStageToggle()}
                  disabled={bulkStageDisabled}
                >
                  {bulkStageLabel}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {allChangesStaged ? "Unstage all files" : "Stage all changed files"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground"
                  onClick={() => void git.refresh()}
                  disabled={git.loading}
                >
                  {git.loading ? <Spinner className="size-3" /> : <RefreshCw />}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Refresh changes</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {isNotGitRepo && (
          <div className="flex items-center justify-center p-4">
            <div className="flex max-w-xs flex-col items-center gap-2 text-center">
              <p className="text-sm font-medium">No git repository at this workspace</p>
              <p className="break-all text-xs text-muted-foreground">
                Switchboard checked <span className="font-mono">{cwd}</span>.
              </p>
            </div>
          </div>
        )}
        {git.error && !isNotGitRepo && (
          <div className="p-3 text-xs text-destructive">{git.error}</div>
        )}
        {git.loading && sortedFiles.length === 0 && !git.error && (
          <div className="p-3 text-xs text-muted-foreground">Loading...</div>
        )}
        {!git.loading && sortedFiles.length === 0 && !git.error && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No changes in this workspace
          </div>
        )}

        {!git.error && sortedFiles.length > 0 ? (
          <div className="py-1">
            {viewMode === "tree"
              ? renderTreeNode(treeRoot)
              : sortedFiles.map((file) => renderFileRow(file))}
          </div>
        ) : null}
      </div>

      {git.branch ? (
        <div className="shrink-0 border-t bg-background/70 p-2">
          <div className="flex items-center gap-1.5">
            <BranchPicker
              branches={git.branches}
              loading={git.branchesLoading && git.branches.length === 0}
              value={git.branch}
              disabled={git.branchActionPending}
              currentBranchUpstreamStatus={git.currentBranchUpstreamStatus}
              currentAheadBehind={git.aheadBehind}
              pendingAction={git.pendingAction}
              sessions={sessions}
              githubToken={githubToken}
              onFetch={git.fetch}
              onPull={git.pull}
              onPush={git.push}
              onCreatePr={onCreatePr}
              onMergeBranch={(branchName) => git.mergeBranch(branchName, "merge")}
              onSquashMergeBranch={(branchName) => git.mergeBranch(branchName, "squash")}
              onRebaseBranch={(branchName) => git.mergeBranch(branchName, "rebase")}
              onCreateWorktree={onCreateWorktree}
              onDeleteBranch={git.deleteBranch}
              onDeleteRemoteBranch={git.pushDeleteRemote}
              triggerClassName="h-7 min-w-0 flex-1 border-border/70 bg-card/70 px-2 text-xs font-medium text-foreground hover:bg-muted/55 data-[state=open]:bg-muted"
              createLabel="Create branch..."
              onSelect={(branchName) => void git.switchBranch(branchName)}
              onCreateBranch={onCreateBranch}
              stashes={git.stashes}
              stashesLoading={git.stashesLoading}
              onStashTabOpen={() => void git.refreshStashes()}
              onStashApply={(index) => git.stashApply(index)}
              onStashPop={(index) => git.stashPop(index)}
              onStashDrop={(index) => git.stashDrop(index)}
              onStashOpen={onOpenStashDiff}
              onStashView={(index) => git.stashShow(index)}
              compact
            />
            <DropdownMenu onOpenChange={(open) => open && void git.refreshStashes()}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                  disabled={anyGitPending}
                >
                  {git.pendingAction === "fetch" ? <Spinner className="size-3" /> : <RefreshCw />}
                  Fetch
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => void handleFetch()}>
                    <RefreshCw />
                    Fetch
                    <DropdownMenuShortcut>⌃G ⌃G</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canPull}
                    onSelect={() => void handlePull()}
                  >
                    <ArrowDown />
                    Pull
                    <DropdownMenuShortcut>{canPull ? `${git.aheadBehind.behind} behind` : ""}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canPush}
                    onSelect={() => void handlePush()}
                  >
                    <ArrowUp />
                    Push
                    <DropdownMenuShortcut>{canPush ? `${git.aheadBehind.ahead} ahead` : ""}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!hasChanges}
                    onSelect={() => void handleStash()}
                  >
                    {git.pendingAction === "stash" ? <Spinner className="size-3.5" /> : <Archive />}
                    Stash Changes
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={git.stashes.length === 0}
                    onSelect={() => void git.stashPop()}
                  >
                    {git.pendingAction === "stash-pop" ? <Spinner className="size-3.5" /> : <RotateCcw />}
                    Pop Latest Stash
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={unstagedCount === 0}
                    onSelect={() => void git.stageAll()}
                  >
                    {git.pendingAction === "stage-all" ? <Spinner className="size-3.5" /> : <GitCommit />}
                    Stage All
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={stagedCount === 0}
                    onSelect={() => void git.unstageAll()}
                  >
                    {git.pendingAction === "unstage-all" ? <Spinner className="size-3.5" /> : <Undo2 />}
                    Unstage All
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={unstagedCount === 0}
                    variant="destructive"
                    onSelect={() => void git.revertAll()}
                  >
                    {git.pendingAction === "discard-all" ? <Spinner className="size-3.5" /> : <Undo2 />}
                    Discard Unstaged
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canCreatePr}
                  onSelect={() => void handleCreatePr()}
                >
                  <GitPullRequest />
                  Create Pull Request
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canManualPr || manualPrPending}
                  onSelect={() => void handleManualPr()}
                >
                  {manualPrPending ? <Spinner className="size-3.5" /> : <GitPullRequest />}
                  Publish & Open Pull Request
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-2">
            <div className="rounded-md border bg-card p-2">
              <Textarea
                value={commitMsg}
                onChange={(event) => setCommitMsg(event.target.value)}
                placeholder="Enter commit message"
                rows={4}
                className="min-h-28 resize-none border-0 bg-transparent p-1 font-mono text-xs shadow-none focus-visible:ring-0"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    void handleCommit();
                  }
                }}
              />
              <div className="mt-2 flex justify-end gap-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-xs"
                      >
                        {commitModeLabel(commitMode)}
                        <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Commit mode</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => setCommitMode("tracked")}>
                        Commit Tracked
                        <DropdownMenuShortcut>
                          {stagedCount + trackedUnstagedFiles.length}
                        </DropdownMenuShortcut>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setCommitMode("staged")}>
                        Commit Staged
                        <DropdownMenuShortcut>{stagedCount}</DropdownMenuShortcut>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setCommitMode("all")}>
                        Commit All
                        <DropdownMenuShortcut>{git.files.length}</DropdownMenuShortcut>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-3 text-xs"
                    disabled={!commitMsg.trim() || !hasCommitTarget || anyGitPending}
                    onClick={() => void handleCommit()}
                  >
                    {commitPending ? <Spinner className="size-3" /> : null}
                    Commit
                  </Button>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {stagedCount} staged · {unstagedCount} unstaged
                {untrackedCount > 0 ? ` · ${untrackedCount} untracked` : ""}
              </span>
              <span className="truncate font-mono">
                {projectPath?.split("/").filter(Boolean).pop() ?? cwd.split("/").filter(Boolean).pop()}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
