import { useState } from "react";
import { GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreatePrDialog } from "./CreatePrDialog";
import type { DiffStats } from "../../lib/tauri-commands";

interface GitToolbarProps {
  branch: string;
  stats: DiffStats;
  cwd: string;
  githubToken: string | null;
  onCommit: (message: string) => Promise<void>;
  onStageAll: () => Promise<void>;
  onPush: () => Promise<void>;
  onRefresh: () => void;
  onOpenSettings?: () => void;
}

export function GitToolbar({
  branch,
  stats,
  cwd,
  githubToken,
  onCommit,
  onStageAll,
  onPush,
  onRefresh,
  onOpenSettings,
}: GitToolbarProps) {
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [stageAllFirst, setStageAllFirst] = useState(true);
  const [prDialogOpen, setPrDialogOpen] = useState(false);

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    if (stageAllFirst) {
      await onStageAll();
    }
    await onCommit(commitMsg.trim());
    setCommitMsg("");
    setCommitOpen(false);
  };

  return (
    <div className="flex flex-col gap-2 p-3 border-b overflow-hidden">
      {/* Branch + stats */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate">{branch || "\u2014"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
          <span className="text-[var(--sb-diff-add-fg)]">+{stats.additions}</span>
          <span className="text-[var(--sb-diff-del-fg)]">-{stats.deletions}</span>
          <span className="text-muted-foreground">{stats.files_changed} files</span>
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="flex-1 text-xs">
              Commit
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setCommitOpen(true)}>
                Commit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPush()}>
                Push
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {githubToken ? (
                <DropdownMenuItem onClick={() => setPrDialogOpen(true)}>
                  Create PR
                </DropdownMenuItem>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      disabled
                      onSelect={(e) => e.preventDefault()}
                    >
                      Create PR
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="text-xs">Add a GitHub token in Settings to create PRs</p>
                    {onOpenSettings && (
                      <button
                        className="text-xs text-primary underline mt-1"
                        onClick={onOpenSettings}
                      >
                        Open Settings
                      </button>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </div>

      {/* Inline commit form */}
      {commitOpen && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Commit message..."
            rows={3}
            autoFocus
            className="text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleCommit();
              }
              if (e.key === "Escape") {
                setCommitOpen(false);
              }
            }}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={stageAllFirst}
                onCheckedChange={(v) => setStageAllFirst(v === true)}
                className="size-3.5"
              />
              <span className="text-[11px] text-muted-foreground">Stage all</span>
            </label>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setCommitOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" className="text-xs" onClick={handleCommit}>
                Commit
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create PR dialog */}
      {githubToken && (
        <CreatePrDialog
          open={prDialogOpen}
          onClose={() => setPrDialogOpen(false)}
          cwd={cwd}
          githubToken={githubToken}
        />
      )}
    </div>
  );
}
