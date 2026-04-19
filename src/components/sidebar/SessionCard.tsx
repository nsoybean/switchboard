import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  GitBranch,
  GitMerge,
  GitPullRequest,
  MoreHorizontal,
  PencilLine,
  Pin,
  PinOff,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import type { Session } from "../../state/types";

export interface SessionGitSummary {
  ahead: number;
  dirty: number;
}

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  isPast?: boolean;
  index?: number;
  timestampLabel?: string;
  timestampTitle?: string;
  diffStats?: { additions: number; deletions: number } | null;
  gitSummary?: SessionGitSummary | null;
  isPinned?: boolean;
  /** Ref from useDraggable — attach to the root element to make it draggable */
  dragRef?: React.Ref<HTMLDivElement>;
  isDragSource?: boolean;
  isOpenInTab?: boolean;
  onClick: () => void;
  onPin?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onMerge?: () => void;
  onCreatePr?: () => void;
  onRemoveWorktree?: () => void;
  onDeleteBranch?: () => void;
}

export function SessionCard({
  session,
  isActive,
  isPinned,
  dragRef,
  isDragSource,
  isOpenInTab,
  index,
  timestampLabel,
  timestampTitle,
  diffStats,
  gitSummary,
  onClick,
  onPin,
  onResume,
  onStop,
  onRename,
  onDelete,
  onMerge,
  onCreatePr,
  onRemoveWorktree,
  onDeleteBranch,
}: SessionCardProps) {
  const isRunning = session.status === "running";
  const canManage = Boolean(onPin || onResume || onStop || onRename || onDelete);
  const hasGitActions = Boolean(onMerge || onCreatePr || onRemoveWorktree || onDeleteBranch);
  const branchName = session.workspace.branchName;

  // When this card is the drag source, show a compact solid card
  if (isDragSource) {
    return (
      <div
        ref={dragRef}
        className="inline-flex max-w-[240px] items-center rounded bg-card px-1.5 py-0.5 shadow-sm ring-1 ring-border"
      >
        <span className="truncate text-[12px] font-medium">
          {session.label || "New session"}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={dragRef}
      className={cn(
        "group/session flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors overflow-hidden cursor-pointer",
        isActive
          ? "bg-accent text-accent-foreground"
          : isOpenInTab
            ? "bg-muted/60 hover:bg-accent/50 text-foreground"
            : "hover:bg-accent/50 text-foreground",
      )}
      onClick={onClick}
    >
      {/* Session number */}
      {typeof index === "number" && (
        <span
          className={cn(
            "mt-0.5 shrink-0 w-4 text-right text-[11px] tabular-nums",
            isRunning
              ? "text-[var(--sb-status-running)] font-semibold"
              : session.status === "idle" || session.status === "needs-input"
                ? "text-[var(--sb-status-done)]"
                : "text-muted-foreground",
          )}
        >
          {index}
        </span>
      )}

      {/* Git branch icon */}
      <GitBranch className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <StatusDot status={session.status} />
          <span className={cn(
            "truncate text-[13px] font-medium",
            !session.label && "italic text-muted-foreground",
          )}>
            {session.label || "New session"}
          </span>
        </div>

        {/* Git status strip */}
        {branchName && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="truncate font-mono">{branchName}</span>
            {gitSummary && gitSummary.ahead > 0 && (
              <span className="flex items-center gap-0.5 text-[var(--sb-diff-add-fg)] shrink-0">
                <ArrowUp className="size-2.5" />
                {gitSummary.ahead}
              </span>
            )}
            {gitSummary && gitSummary.dirty > 0 && (
              <span className="shrink-0 text-muted-foreground">
                {gitSummary.dirty} changed
              </span>
            )}
          </div>
        )}

        <div
          className="mt-0.5 text-[11px] text-muted-foreground"
          title={timestampTitle}
        >
          {timestampLabel}
        </div>
      </div>

      {/* Right side: diff stats / overflow menu / action buttons */}
      <div className="relative mt-0.5 shrink-0 self-start">
        {diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) ? (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] font-medium tabular-nums transition-opacity",
              (canManage || hasGitActions) &&
                "group-hover/session:opacity-0 group-hover/session:hidden group-focus-within/session:opacity-0 group-focus-within/session:hidden",
            )}
          >
            <span className="text-[var(--sb-diff-add-fg)]">
              +{diffStats.additions}
            </span>
            <span className="text-[var(--sb-diff-del-fg)]">
              -{diffStats.deletions}
            </span>
          </span>
        ) : (
          !canManage && !hasGitActions ? null : (
            <span
              className={cn(
                "flex items-start justify-end text-[10px] text-muted-foreground transition-opacity",
                "group-hover/session:opacity-0 group-hover/session:hidden group-focus-within/session:opacity-0 group-focus-within/session:hidden",
              )}
            />
          )
        )}
        <div className="hidden items-center gap-0.5 group-hover/session:flex group-focus-within/session:flex">
          {/* Git actions overflow menu */}
          {hasGitActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                {onMerge && (
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onSelect={(e) => {
                      e.stopPropagation();
                      onMerge();
                    }}
                  >
                    <GitMerge className="size-3.5" />
                    Merge into...
                  </DropdownMenuItem>
                )}
                {onCreatePr && (
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onSelect={(e) => {
                      e.stopPropagation();
                      onCreatePr();
                    }}
                  >
                    <GitPullRequest className="size-3.5" />
                    Create PR
                  </DropdownMenuItem>
                )}
                {(onMerge || onCreatePr) && (onRemoveWorktree || onDeleteBranch) && (
                  <DropdownMenuSeparator />
                )}
                {onRemoveWorktree && (
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onSelect={(e) => {
                      e.stopPropagation();
                      onRemoveWorktree();
                    }}
                  >
                    Remove worktree
                  </DropdownMenuItem>
                )}
                {onDeleteBranch && (
                  <DropdownMenuItem
                    className="text-xs gap-2 text-destructive focus:text-destructive"
                    onSelect={(e) => {
                      e.stopPropagation();
                      onDeleteBranch();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete branch
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Standard action buttons */}
          {onPin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin();
                  }}
                >
                  {isPinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{isPinned ? "Unpin" : "Pin"}</TooltipContent>
            </Tooltip>
          )}
          {onResume && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResume();
                  }}
                >
                  <Play className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Resume</TooltipContent>
            </Tooltip>
          )}
          {onStop && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop();
                  }}
                >
                  <Square className="size-3 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Stop</TooltipContent>
            </Tooltip>
          )}
          {onRename && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename();
                  }}
                >
                  <PencilLine className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Rename</TooltipContent>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
