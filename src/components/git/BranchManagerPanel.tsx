import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  GitMerge,
  MoreHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MergeDialog } from "./MergeDialog";
import type { GitState, GitActions } from "@/hooks/useGitState";
import type { MergeStrategy } from "@/lib/tauri-commands";
import type { Session } from "@/state/types";

interface BranchManagerPanelProps {
  git: GitState & GitActions;
  cwd: string;
  sessions?: Session[];
}

export function BranchManagerPanel({
  git,
  sessions = [],
}: BranchManagerPanelProps) {
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const { branches, branch: currentBranch, aheadBehind } = git;
  const localBranches = branches.filter((branch) => !branch.is_remote);

  const sessionsByBranch = useMemo(() => {
    const map = new Map<string, Session[]>();

    sessions.forEach((session) => {
      const branchName = session.workspace.branchName ?? session.branch;
      if (!branchName) return;
      const current = map.get(branchName) ?? [];
      current.push(session);
      map.set(branchName, current);
    });

    return map;
  }, [sessions]);

  const handleCheckout = async (name: string) => {
    if (actionPending) return;
    setActionPending(name);
    try {
      await git.switchBranch(name);
    } finally {
      setActionPending(null);
    }
  };

  const handleDelete = async (name: string, force = false) => {
    if (actionPending) return;
    setActionPending(name);
    try {
      await git.deleteBranch(name, force);
    } finally {
      setActionPending(null);
    }
  };

  const handleDeleteRemote = async (name: string) => {
    if (actionPending) return;
    setActionPending(name);
    try {
      await git.pushDeleteRemote(name);
    } finally {
      setActionPending(null);
    }
  };

  const handlePushCurrent = async (name: string) => {
    if (actionPending) return;
    setActionPending(name);
    try {
      await git.push();
    } finally {
      setActionPending(null);
    }
  };

  const handleMerge = async (source: string, strategy: MergeStrategy) => {
    await git.mergeBranch(source, strategy);
  };

  if (localBranches.length === 0) {
    return (
      <div className="flex items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">No branches found</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0">
        {localBranches.map((branch) => {
          const isCurrent = branch.name === currentBranch;
          const isPending = actionPending === branch.name;
          const branchAhead = isCurrent
            ? aheadBehind.ahead
            : (branch.ahead ?? 0);
          const branchBehind = isCurrent
            ? aheadBehind.behind
            : (branch.behind ?? 0);
          const attachedSessions = sessionsByBranch.get(branch.name) ?? [];

          return (
            <div
              key={branch.name}
              className={cn(
                "group border-t px-3 py-2 text-xs",
                isCurrent ? "bg-accent/30" : "hover:bg-accent/20",
              )}
            >
              <div className="flex items-start gap-2">
                <GitBranch className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate font-mono text-[12px]",
                        isCurrent
                          ? "font-semibold text-foreground"
                          : "cursor-pointer text-foreground hover:underline",
                      )}
                      onClick={() => {
                        if (!isCurrent) void handleCheckout(branch.name);
                      }}
                    >
                      {branch.name}
                    </span>
                    {isCurrent ? (
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                        current
                      </Badge>
                    ) : null}
                    {branchAhead > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[var(--sb-diff-add-fg)]">
                        <ArrowUp className="size-3" />
                        {branchAhead}
                      </span>
                    ) : null}
                    {branchBehind > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[var(--sb-diff-del-fg)]">
                        <ArrowDown className="size-3" />
                        {branchBehind}
                      </span>
                    ) : null}
                  </div>

                  {branch.last_commit_subject || branch.last_commit_date ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {branch.last_commit_subject ?? "No recent commit"}
                      {branch.last_commit_date ? ` · ${branch.last_commit_date}` : ""}
                    </div>
                  ) : null}

                  {attachedSessions.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {attachedSessions.slice(0, 2).map((session) => (
                        <Badge
                          key={session.id}
                          variant="outline"
                          className="h-5 gap-1 px-1.5 text-[10px]"
                        >
                          {session.worktreePath ? "worktree" : "session"}
                          <span className="text-muted-foreground">·</span>
                          {session.label || session.agent}
                        </Badge>
                      ))}
                      {attachedSessions.length > 2 ? (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                          +{attachedSessions.length - 2} more
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {isCurrent && branchAhead > 0 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => void handlePushCurrent(branch.name)}
                    disabled={isPending}
                  >
                    <Upload className="size-3.5" />
                  </Button>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                      disabled={isPending}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    {!isCurrent ? (
                      <DropdownMenuItem
                        className="text-xs"
                        onSelect={() => void handleCheckout(branch.name)}
                      >
                        Checkout
                      </DropdownMenuItem>
                    ) : null}
                    {!isCurrent && currentBranch ? (
                      <DropdownMenuItem
                        className="text-xs"
                        onSelect={() => setMergeSource(branch.name)}
                      >
                        <GitMerge className="size-3.5" />
                        Merge into {currentBranch}
                      </DropdownMenuItem>
                    ) : null}
                    {isCurrent ? (
                      <DropdownMenuItem
                        className="text-xs"
                        onSelect={() => void handlePushCurrent(branch.name)}
                      >
                        <ArrowUp className="size-3.5" />
                        Push branch
                      </DropdownMenuItem>
                    ) : null}
                    {!isCurrent ? <DropdownMenuSeparator /> : null}
                    {!isCurrent ? (
                      <DropdownMenuItem
                        className="text-xs text-destructive focus:text-destructive"
                        onSelect={() => void handleDelete(branch.name, false)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete local branch
                      </DropdownMenuItem>
                    ) : null}
                    {!isCurrent ? (
                      <DropdownMenuItem
                        className="text-xs text-destructive focus:text-destructive"
                        onSelect={() => void handleDelete(branch.name, true)}
                      >
                        <Trash2 className="size-3.5" />
                        Force delete local
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      className="text-xs text-destructive focus:text-destructive"
                      onSelect={() => void handleDeleteRemote(branch.name)}
                    >
                      <Trash2 className="size-3.5" />
                      Delete remote branch
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <MergeDialog
        open={mergeSource !== null}
        onClose={() => setMergeSource(null)}
        sourceBranch={mergeSource}
        targetBranch={currentBranch}
        branches={branches}
        onMerge={handleMerge}
      />
    </>
  );
}
