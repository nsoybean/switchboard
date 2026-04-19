import { memo, useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Files,
  GitBranch,
  History,
  Minus,
  Plus,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileCommands, gitCommands } from "../../lib/tauri-commands";
import { GitToolbar } from "./GitToolbar";
import { DiffView } from "./DiffView";
import { GitHistory } from "./GitHistory";
import { StashPanel } from "./StashPanel";
import { BranchManagerPanel } from "./BranchManagerPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  githubToken?: string | null;
  onOpenDiff?: (diff: { path: string; staged: boolean; status: string }) => void;
  activeDiffPath?: string | null;
  activeDiffStaged?: boolean | null;
}

interface GitSectionProps {
  icon: ReactNode;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}

function GitSection({
  icon,
  title,
  count,
  defaultOpen = false,
  headerActions,
  children,
}: GitSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="group/section border-b">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span>{title}</span>
          <span className="ml-auto flex items-center gap-1">
            {headerActions ? (
              <span
                className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100"
                onClick={(event) => event.stopPropagation()}
              >
                {headerActions}
              </span>
            ) : null}
            {typeof count === "number" && count > 0 ? (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {count}
              </Badge>
            ) : null}
          </span>
        </button>
      </div>
      {open ? <div>{children}</div> : null}
    </section>
  );
}

export const GitPanel = memo(function GitPanel({
  cwd,
  git,
  sessions = [],
  githubToken,
  onOpenDiff,
  activeDiffPath,
  activeDiffStaged,
}: GitPanelProps) {
  const [changesTab, setChangesTab] = useState<"unstaged" | "staged">("unstaged");
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<string>("");

  const showStaged = changesTab === "staged";

  useEffect(() => {
    setChangesTab("unstaged");
    setExpandedFile(null);
    setFileDiff("");
  }, [cwd]);

  useEffect(() => {
    if (!expandedFile) {
      setFileDiff("");
      return;
    }

    const expandedFileEntry = git.files.find(
      (file) => file.path === expandedFile && file.staged === showStaged,
    );
    let cancelled = false;

    const loadDiff = async () => {
      try {
        if (expandedFileEntry?.status === "??" && !showStaged) {
          const filePath = `${cwd.replace(/\/$/, "")}/${expandedFile}`;
          const contents = await fileCommands.readFile(filePath);
          if (cancelled) return;

          const syntheticDiff = contents
            .split("\n")
            .map((line) => `+${line}`)
            .join("\n");
          setFileDiff(syntheticDiff);
          return;
        }

        const diff = await gitCommands.diff(cwd, expandedFile, showStaged);
        if (!cancelled) setFileDiff(diff);
      } catch (err) {
        if (!cancelled) {
          setFileDiff(
            `diff --git a/${expandedFile} b/${expandedFile}\nUnable to load diff: ${String(err)}`,
          );
        }
      }
    };

    void loadDiff();

    return () => {
      cancelled = true;
    };
  }, [cwd, expandedFile, git.files, showStaged]);

  const toggleFile = (path: string) => {
    setExpandedFile((prev) => (prev === path ? null : path));
  };

  const handleStageFile = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await git.stageFiles([path]);
  };

  const handleUnstageFile = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await git.unstageFiles([path]);
  };

  const handleRevertFile = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    await git.revertFiles([path]);
  };

  const filteredFiles = showStaged
    ? git.files.filter((file) => file.staged)
    : git.files.filter((file) => !file.staged);
  const unstagedCount = git.files.filter((file) => !file.staged).length;
  const stagedCount = git.files.filter((file) => file.staged).length;
  const revertableCount = git.files.filter((file) => !file.staged).length;
  const localBranchCount = git.branches.filter((branch) => !branch.is_remote).length;
  const isNotGitRepo =
    git.error !== null &&
    (git.error.includes("not a git repository") ||
      git.error.includes("needed a single revision"));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <GitToolbar
        branchActionPending={git.branchActionPending}
        currentBranchUpstreamStatus={git.currentBranchUpstreamStatus}
        cwd={cwd}
        githubToken={githubToken ?? null}
        onCommit={git.commit}
        onStageAll={git.stageAll}
        onPull={git.pull}
        onPush={git.push}
        onFetch={git.fetch}
        onRefresh={git.refresh}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <GitSection
          icon={<Files className="size-3.5" />}
          title="Changes"
          count={git.files.length}
          defaultOpen
          headerActions={
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      void git.revertAll();
                    }}
                    disabled={revertableCount === 0}
                  >
                    <Undo2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Revert all</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      void git.stageAll();
                    }}
                    disabled={unstagedCount === 0}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stage all</TooltipContent>
              </Tooltip>
            </>
          }
        >
          <div className="flex border-t">
            <button
              type="button"
              onClick={() => {
                setChangesTab("unstaged");
                setExpandedFile(null);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors",
                changesTab === "unstaged"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Unstaged
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {unstagedCount}
              </Badge>
            </button>
            <button
              type="button"
              onClick={() => {
                setChangesTab("staged");
                setExpandedFile(null);
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors",
                changesTab === "staged"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Staged
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                {stagedCount}
              </Badge>
            </button>
          </div>

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
          {git.loading && filteredFiles.length === 0 && !git.error && (
            <div className="p-3 text-xs text-muted-foreground">Loading...</div>
          )}
          {!git.loading && filteredFiles.length === 0 && !git.error && (
            <div className="p-3 text-xs text-muted-foreground">
              {showStaged ? "No staged changes" : "No unstaged changes"}
            </div>
          )}

          {!git.error &&
            filteredFiles.map((file) => {
              const isExpanded = expandedFile === file.path;
              const isSelectedDocument =
                activeDiffPath === file.path && activeDiffStaged === showStaged;

              return (
                <div key={`${file.path}-${file.staged}`}>
                  <div
                    onClick={() => {
                      if (onOpenDiff) {
                        onOpenDiff({
                          path: file.path,
                          staged: showStaged,
                          status: file.status,
                        });
                        return;
                      }
                      toggleFile(file.path);
                    }}
                    className={cn(
                      "group/file grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden border-t px-2 py-1.5 text-xs",
                      isExpanded || isSelectedDocument
                        ? "bg-accent/60"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                      <ChevronRight
                        className={cn(
                          "size-3 shrink-0 text-muted-foreground transition-transform",
                          isExpanded && "rotate-90",
                        )}
                      />
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
                        {file.status}
                      </Badge>
                      <span
                        className="min-w-0 flex-1 truncate text-muted-foreground"
                        title={file.path}
                      >
                        {file.path}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/file:opacity-100 group-focus-within/file:opacity-100">
                      {showStaged ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-5 shrink-0"
                              onClick={(e) => handleUnstageFile(e, file.path)}
                            >
                              <Minus />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Unstage</TooltipContent>
                        </Tooltip>
                      ) : (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-5 shrink-0"
                                onClick={(e) => handleStageFile(e, file.path)}
                              >
                                <Plus />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Stage</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-5 shrink-0"
                                onClick={(e) => handleRevertFile(e, file.path)}
                              >
                                <Undo2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Revert</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </div>
                  {!onOpenDiff && isExpanded && fileDiff ? <DiffView diff={fileDiff} /> : null}
                </div>
              );
            })}
        </GitSection>

        <GitSection
          icon={<GitBranch className="size-3.5" />}
          title="Branches"
          count={localBranchCount}
        >
          <BranchManagerPanel cwd={cwd} git={git} sessions={sessions} />
        </GitSection>

        <GitSection
          icon={<History className="size-3.5" />}
          title="Commits"
          count={git.log.length}
        >
          <GitHistory cwd={cwd} git={git} />
        </GitSection>

        <StashPanel git={git} cwd={cwd} />
      </div>
    </div>
  );
});
