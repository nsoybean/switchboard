import { memo, useEffect, useState } from "react";
import { Plus, Minus, Undo2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fileCommands,
  gitCommands,
} from "../../lib/tauri-commands";
import { GitToolbar } from "./GitToolbar";
import { DiffView } from "./DiffView";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitState, GitActions } from "@/hooks/useGitState";

interface GitPanelProps {
  cwd: string;
  git: GitState & GitActions;
  githubToken?: string | null;
  onOpenSettings?: () => void;
}

export const GitPanel = memo(function GitPanel({
  cwd,
  git,
  githubToken,
  onOpenSettings,
}: GitPanelProps) {
  const [activeTab, setActiveTab] = useState("unstaged");
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<string>("");

  const showStaged = activeTab === "staged";

  // Reset UI state when cwd changes
  useEffect(() => {
    setActiveTab("unstaged");
    setExpandedFile(null);
    setFileDiff("");
  }, [cwd]);

  // Fetch diff when a file is expanded
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

          const lines = contents.split("\n");
          const syntheticDiff = lines.map((line) => `+${line}`).join("\n");

          setFileDiff(syntheticDiff);
          return;
        }

        const diff = await gitCommands.diff(cwd, expandedFile, showStaged);
        if (!cancelled) setFileDiff(diff);
      } catch (err) {
        if (!cancelled) {
          setFileDiff(`diff --git a/${expandedFile} b/${expandedFile}\nUnable to load diff: ${String(err)}`);
        }
      }
    };

    void loadDiff();

    return () => { cancelled = true; };
  }, [expandedFile, cwd, git.files, showStaged]);

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
    ? git.files.filter((f) => f.staged)
    : git.files.filter((f) => !f.staged);

  const unstagedCount = git.files.filter((f) => !f.staged).length;
  const stagedCount = git.files.filter((f) => f.staged).length;

  const isNotGitRepo =
    git.error !== null &&
    (git.error.includes("not a git repository") ||
      git.error.includes("needed a single revision"));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <GitToolbar
        branch={git.branch}
        branchActionPending={git.branchActionPending}
        stats={git.stats}
        cwd={cwd}
        githubToken={githubToken ?? null}
        onCommit={git.commit}
        onStageAll={git.stageAll}
        onPull={git.pull}
        onPush={git.push}
        onRefresh={git.refresh}
        onOpenSettings={onOpenSettings}
      />

      {/* Staged/Unstaged toggle */}
      <div className="flex border-b shrink-0">
        <button
          onClick={() => { setActiveTab("unstaged"); setExpandedFile(null); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors",
            activeTab === "unstaged"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Unstaged
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{unstagedCount}</Badge>
        </button>
        <button
          onClick={() => { setActiveTab("staged"); setExpandedFile(null); }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors",
            activeTab === "staged"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Staged
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{stagedCount}</Badge>
        </button>
      </div>

      {/* File list + per-file diff */}
      <ScrollArea className="flex-1 min-h-0">
        {isNotGitRepo && (
          <div className="flex h-full items-center justify-center p-4">
            <div className="flex max-w-xs flex-col items-center gap-2 text-center">
              <p className="text-sm font-medium">No git repository at this workspace</p>
              <p className="text-xs text-muted-foreground break-all">
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

        {!git.error && filteredFiles.map((file) => {
          const isExpanded = expandedFile === file.path;
          return (
            <div key={`${file.path}-${file.staged}`}>
              {/* File row — clickable to toggle diff */}
              <div
                onClick={() => toggleFile(file.path)}
                className={cn(
                  "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden border-b px-2 py-1.5 text-xs cursor-pointer",
                  isExpanded ? "bg-accent/60" : "hover:bg-accent/50",
                )}
              >
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                  <ChevronRight
                    className={cn(
                      "size-3 shrink-0 transition-transform text-muted-foreground",
                      isExpanded && "rotate-90",
                    )}
                  />
                  <Badge
                    variant="secondary"
                    className={cn(
                      "h-4 shrink-0 px-1 text-[10px] font-mono",
                      (file.status === "A" || file.status === "??") && "text-[var(--sb-diff-add-fg)]",
                      file.status === "D" && "text-[var(--sb-diff-del-fg)]",
                      file.status === "M" && "text-[var(--sb-status-warning)]",
                    )}
                  >
                    {file.status}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground" title={file.path}>
                    {file.path}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
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
                      {file.status !== "??" && (
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
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Inline diff for this file */}
              {isExpanded && fileDiff && <DiffView diff={fileDiff} />}
            </div>
          );
        })}
      </ScrollArea>

      {/* Bottom action bar */}
      <div className="flex gap-2 p-2 border-t shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={git.revertAll}
        >
          <Undo2 data-icon="inline-start" />
          Revert all
        </Button>
        <Button
          size="sm"
          className="flex-1 text-xs"
          onClick={git.stageAll}
        >
          <Plus data-icon="inline-start" />
          Stage all
        </Button>
      </div>
    </div>
  );
});
