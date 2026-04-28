import { useEffect, useMemo, useState } from "react";
import { Check, GitBranch, GitFork, Plus, Search } from "lucide-react";
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
import { worktreeCommands, type WorktreeInfo } from "@/lib/tauri-commands";
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

  useEffect(() => {
    if (!open || !projectPath) return;
    setLoading(true);
    worktreeCommands
      .list(projectPath)
      .then(setWorktrees)
      .catch(() => setWorktrees([]))
      .finally(() => setLoading(false));
  }, [open, projectPath]);

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
        className={cn("w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-md p-0 font-sans", compact && "w-[min(24rem,calc(100vw-2rem))]")}
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
                  <DropdownMenuItem
                    key={worktree.path}
                    onSelect={() => {
                      setOpen(false);
                      onSelectPath?.(worktree.path);
                    }}
                    className={cn(
                      "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-xs",
                      isCurrent && "bg-accent/70 text-foreground",
                    )}
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
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                        <GitBranch className="size-3 shrink-0" />
                        <span className="truncate">{worktree.branch || "detached"}</span>
                        {worktree.head ? <span className="shrink-0">· {worktree.head}</span> : null}
                        <span className="truncate">· {worktree.path}</span>
                      </span>
                    </span>
                  </DropdownMenuItem>
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
