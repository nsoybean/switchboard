import { useCallback, useEffect, useState } from "react";
import { Plus, Minus, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { gitCommands, type ChangedFile, type DiffStats } from "../../lib/tauri-commands";
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

interface GitPanelProps {
  cwd: string;
  visible: boolean;
}

export function GitPanel({ cwd, visible }: GitPanelProps) {
  const [branch, setBranch] = useState("");
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [stats, setStats] = useState<DiffStats>({ additions: 0, deletions: 0, files_changed: 0 });
  const [diff, setDiff] = useState("");
  const [activeTab, setActiveTab] = useState("unstaged");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showStaged = activeTab === "staged";

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await gitCommands.status(cwd);
      setBranch(status.branch);
      setFiles(status.files);
      setStats(status.stats);

      const diffText = await gitCommands.diff(cwd, undefined, showStaged);
      setDiff(diffText);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd, showStaged]);

  useEffect(() => {
    if (!visible) return;
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [visible, refresh]);

  const handleStageAll = async () => {
    const unstaged = files.filter((f) => !f.staged).map((f) => f.path);
    if (unstaged.length === 0) return;
    await gitCommands.stage(cwd, unstaged);
    refresh();
  };

  const handleRevertAll = async () => {
    const unstaged = files.filter((f) => !f.staged && f.status !== "??").map((f) => f.path);
    if (unstaged.length === 0) return;
    await gitCommands.revert(cwd, unstaged);
    refresh();
  };

  const handleStageFile = async (path: string) => {
    await gitCommands.stage(cwd, [path]);
    refresh();
  };

  const handleUnstageFile = async (path: string) => {
    await gitCommands.unstage(cwd, [path]);
    refresh();
  };

  const handleRevertFile = async (path: string) => {
    await gitCommands.revert(cwd, [path]);
    refresh();
  };

  const handleCommit = async (message: string) => {
    await gitCommands.commit(cwd, message);
    refresh();
  };

  const handlePush = async () => {
    await gitCommands.push(cwd);
    refresh();
  };

  if (!visible) return null;

  const filteredFiles = showStaged
    ? files.filter((f) => f.staged)
    : files.filter((f) => !f.staged);

  const unstagedCount = files.filter((f) => !f.staged).length;
  const stagedCount = files.filter((f) => f.staged).length;

  return (
    <div className="flex flex-col h-full w-[280px] min-w-[280px] max-w-[280px] border-l bg-card overflow-hidden">
      <GitToolbar
        branch={branch}
        stats={stats}
        onCommit={handleCommit}
        onPush={handlePush}
        onRefresh={refresh}
      />

      {/* Staged/Unstaged toggle */}
      <div className="flex border-b shrink-0">
        <button
          onClick={() => setActiveTab("unstaged")}
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
          onClick={() => setActiveTab("staged")}
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

      {/* File list + diff */}
      <ScrollArea className="flex-1 min-h-0">
        {error && (
          <div className="p-3 text-xs text-destructive">{error}</div>
        )}
        {loading && filteredFiles.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">Loading...</div>
        )}
        {!loading && filteredFiles.length === 0 && !error && (
          <div className="p-3 text-xs text-muted-foreground">
            {showStaged ? "No staged changes" : "No unstaged changes"}
          </div>
        )}

        {/* File list */}
        {filteredFiles.map((file) => (
              <div
                key={`${file.path}-${file.staged}`}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs border-b hover:bg-accent/50 min-w-0"
              >
                <Badge
                  variant="secondary"
                  className={cn(
                    "h-4 px-1 text-[10px] font-mono shrink-0",
                    (file.status === "A" || file.status === "??") && "text-[var(--sb-diff-add-fg)]",
                    file.status === "D" && "text-[var(--sb-diff-del-fg)]",
                    file.status === "M" && "text-[var(--sb-status-warning)]",
                  )}
                >
                  {file.status}
                </Badge>
                <span className="flex-1 truncate text-muted-foreground min-w-0">
                  {file.path}
                </span>
                {showStaged ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 shrink-0"
                        onClick={() => handleUnstageFile(file.path)}
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
                          onClick={() => handleStageFile(file.path)}
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
                            onClick={() => handleRevertFile(file.path)}
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
            ))}

            {/* Diff */}
            {diff && <DiffView diff={diff} />}
      </ScrollArea>

      {/* Bottom action bar */}
      <div className="flex gap-2 p-2 border-t">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={handleRevertAll}
        >
          <Undo2 data-icon="inline-start" />
          Revert all
        </Button>
        <Button
          size="sm"
          className="flex-1 text-xs"
          onClick={handleStageAll}
        >
          <Plus data-icon="inline-start" />
          Stage all
        </Button>
      </div>
    </div>
  );
}
