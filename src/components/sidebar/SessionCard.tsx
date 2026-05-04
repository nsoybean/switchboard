import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { AgentIcon } from "@/components/agents/AgentIcon";
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
  showBranch?: boolean;
  /** Ref from useDraggable — attach to the root element to make it draggable */
  dragRef?: React.Ref<HTMLDivElement>;
  isDragSource?: boolean;
  isOpenInTab?: boolean;
  suppressHover?: boolean;
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
  showBranch = true,
  dragRef,
  isDragSource,
  isOpenInTab,
  suppressHover,
  timestampLabel,
  timestampTitle,
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
  const canManage = Boolean(onPin || onResume || onStop || onRename || onDelete);
  const hasGitActions = Boolean(onMerge || onCreatePr || onRemoveWorktree || onDeleteBranch);
  const showHoverActions = !suppressHover && (canManage || hasGitActions);

  // When this card is the drag source, show a compact solid card
  if (isDragSource) {
    return (
      <div
        ref={dragRef}
        className="inline-flex max-w-[240px] items-center rounded-md bg-card px-2 py-1 shadow-sm ring-1 ring-border"
      >
        <span className="truncate text-[12px] font-medium">
          {session.label || "New session"}
        </span>
      </div>
    );
  }

  const hasBranch = showBranch && Boolean(session.branch);

  return (
    <div
      ref={dragRef}
      className={cn(
        "group/session flex w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-md px-2 py-1.5 font-sans text-sm transition-colors",
        isActive
          ? "bg-accent/80 text-accent-foreground"
          : suppressHover
            ? isOpenInTab
              ? "bg-muted/55 text-foreground"
              : "text-foreground"
          : isOpenInTab
            ? "bg-muted/55 text-foreground hover:bg-accent/55"
            : "text-foreground hover:bg-muted/55",
      )}
      onClick={onClick}
    >
      {/* Row 1: icon · dot · label · timestamp/actions */}
      <div className="flex w-full min-w-0 items-center gap-1.5">
        {/* Agent icon */}
        <AgentIcon agent={session.agent} className="size-3.5 shrink-0" />

        {/* Status dot */}
        <StatusDot status={session.status} />

        {/* Label — truncates to keep single row */}
        <span className={cn(
          "min-w-0 flex-1 truncate text-[13px] font-medium leading-5",
          !session.label && "italic text-muted-foreground",
        )}>
          {session.label || "New agent"}
        </span>

        {/* Right side: keep a stable footprint so hover actions never shift the row */}
        <div className="relative flex h-5 w-[34px] shrink-0 items-center justify-end">
          {/* Timestamp — hidden when hover actions visible */}
          <span
            className={cn(
              "absolute right-0 text-[11px] text-muted-foreground/80 tabular-nums transition-opacity",
              showHoverActions &&
                "group-hover/session:opacity-0 group-focus-within/session:opacity-0",
            )}
            title={timestampTitle}
          >
            {timestampLabel}
          </span>

        <div
          className={cn(
            "absolute right-0 z-10 flex items-center gap-0.5 rounded-md bg-card/95 px-0.5 shadow-sm ring-1 ring-border/70 transition-opacity",
            showHoverActions
              ? "pointer-events-none opacity-0 group-hover/session:pointer-events-auto group-hover/session:opacity-100 group-focus-within/session:pointer-events-auto group-focus-within/session:opacity-100"
              : "pointer-events-none opacity-0",
          )}
        >
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

      {/* Row 2: branch name */}
      {hasBranch && (
        <div className="flex min-w-0 items-center gap-1 pl-[19px] pt-0.5">
          <GitBranch className="size-2.5 shrink-0 text-muted-foreground/60" />
          <span className="truncate text-[11px] text-muted-foreground/70 font-mono">
            {session.branch}
          </span>
        </div>
      )}
    </div>
  );
}
