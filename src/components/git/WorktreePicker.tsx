import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy, FolderOpen, GitBranch, GitFork, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { projectCommands, worktreeCommands, type WorktreeInfo } from "@/lib/tauri-commands";
import { cn } from "@/lib/utils";

interface WorktreePickerProps {
  projectPath: string | null;
  currentPath?: string | null;
  currentBranch?: string | null;
  onSelectPath?: (path: string) => void;
  onCreateWorktree?: (label?: string) => void;
  triggerClassName?: string;
  compact?: boolean;
}

function pathName(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function WorktreePicker({
  projectPath,
  currentPath,
  currentBranch,
  onSelectPath,
  onCreateWorktree,
  triggerClassName,
  compact = false,
}: WorktreePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingPath, setRemovingPath] = useState<string | null>(null);

  const refreshWorktrees = useCallback((options?: { showLoading?: boolean }) => {
    if (!projectPath) return Promise.resolve();
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);
    return worktreeCommands
      .list(projectPath)
      .then(setWorktrees)
      .catch(() => setWorktrees([]))
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  }, [projectPath]);

  useEffect(() => {
    if (!open || !projectPath) return;
    void refreshWorktrees();
  }, [open, projectPath, refreshWorktrees]);

  const handleOpenPath = useCallback(async (path: string) => {
    try {
      await projectCommands.openInFinder(path);
    } catch (err) {
      toast.error("Failed to open worktree", {
        description: String(err),
      });
    }
  }, []);

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await writeText(path);
      toast.success("Copied worktree path");
    } catch (err) {
      toast.error("Failed to copy path", {
        description: String(err),
      });
    }
  }, []);

  const handleRemoveWorktree = useCallback(async (worktree: WorktreeInfo) => {
    if (!projectPath || worktree.path === projectPath || worktree.path === currentPath) return;

    const name = pathName(worktree.path);
    const confirmed = window.confirm(
      `Remove worktree "${name}"?\n\nThis removes the worktree directory but keeps its branch.`,
    );
    if (!confirmed) return;

    setRemovingPath(worktree.path);
    try {
      await toast.promise(
        worktreeCommands.remove(projectPath, worktree.path),
        {
          loading: "Removing worktree...",
          success: "Worktree removed",
          error: (err) => `Failed to remove worktree: ${String(err)}`,
        },
      );
      setWorktrees((current) => current.filter((item) => item.path !== worktree.path));
      await refreshWorktrees({ showLoading: false });
    } finally {
      setRemovingPath(null);
    }
  }, [currentPath, projectPath, refreshWorktrees]);

  const stopActionClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selected = useMemo(() => {
    if (!currentPath) return null;
    return worktrees.find((worktree) => worktree.path === currentPath) ?? null;
  }, [currentPath, worktrees]);

  const label = currentPath
    ? currentPath === projectPath
      ? "main"
      : pathName(currentPath)
    : "workspace";

  const normalizedQuery = query.trim().toLowerCase();
  const trimmedQuery = query.trim();
  const filteredWorktrees = worktrees.filter((worktree) => {
    if (!normalizedQuery) return true;
    return (
      worktree.path.toLowerCase().includes(normalizedQuery) ||
      worktree.branch.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={!projectPath}
          className={cn(
            "h-7 max-w-[220px] justify-start gap-1.5 rounded-md border border-transparent bg-transparent px-2 font-sans text-xs font-medium text-muted-foreground shadow-none hover:border-border hover:bg-card hover:text-foreground data-[state=open]:border-border data-[state=open]:bg-card data-[state=open]:text-foreground",
            triggerClassName,
          )}
        >
          <GitFork className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn("w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-md p-0 font-sans", compact && "w-[min(36rem,calc(100vw-2rem))]")}
      >
        <div className="flex items-center gap-2 border-b bg-card px-2 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Select a worktree..."
            className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
          />
        </div>

        {onCreateWorktree ? (
          <>
            <div className="p-1">
              <DropdownMenuItem
                onSelect={() => {
                  setOpen(false);
                  onCreateWorktree(trimmedQuery || undefined);
                }}
                className="gap-2 rounded-md px-2 py-1.5 text-xs"
              >
                <Plus className="size-3.5 text-muted-foreground" />
                {trimmedQuery
                  ? `Create "${trimmedQuery}" based on ${currentBranch || selected?.branch || "current branch"}`
                  : `Create new worktree based on ${currentBranch || selected?.branch || "current branch"}`}
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator className="my-0" />
          </>
        ) : null}

        <ScrollArea className={cn("h-52", compact && "h-44")}>
          <div className="flex flex-col p-1">
            {loading ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">Loading worktrees...</div>
            ) : filteredWorktrees.length > 0 ? (
              filteredWorktrees.map((worktree) => {
                const isCurrent = worktree.path === currentPath;
                const name = worktree.path === projectPath ? "main" : pathName(worktree.path);
                return (
                  <div
                    key={worktree.path}
                    className={cn(
                      "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md px-1 py-0.5 text-xs hover:bg-accent/80",
                      isCurrent && "bg-accent/70 text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onSelectPath?.(worktree.path);
                      }}
                      className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-2 rounded-sm px-1 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex justify-center pt-0.5">
                        {isCurrent ? (
                          <Check className="size-3.5 text-primary" />
                        ) : (
                          <GitFork className="size-3.5 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                          <GitBranch className="size-3 shrink-0" />
                          <span className="truncate">{worktree.branch || "detached"}</span>
                          {worktree.head ? <span className="shrink-0">· {worktree.head}</span> : null}
                        </span>
                        <span className="mt-0.5 block break-all font-mono text-[10px] leading-4 text-muted-foreground">
                          {worktree.path}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center gap-0.5 pr-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                              stopActionClick(event);
                              void handleOpenPath(worktree.path);
                            }}
                          >
                            <FolderOpen className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Open in Finder</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                              stopActionClick(event);
                              void handleCopyPath(worktree.path);
                            }}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy path</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={worktree.path === projectPath || isCurrent || removingPath === worktree.path}
                            className="size-6 text-muted-foreground hover:text-destructive disabled:opacity-30"
                            onClick={(event) => {
                              stopActionClick(event);
                              void handleRemoveWorktree(worktree);
                            }}
                          >
                            {removingPath === worktree.path ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isCurrent ? "Cannot remove active worktree" : "Remove worktree"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-2 py-2 text-xs text-muted-foreground">No matching worktrees.</div>
            )}
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
