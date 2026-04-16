import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GitBranch, PencilLine, Play, Square, Trash2 } from "lucide-react";
import type { Session } from "../../state/types";

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  isPast?: boolean;
  index?: number;
  timestampLabel?: string;
  timestampTitle?: string;
  diffStats?: { additions: number; deletions: number } | null;
  onClick: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

export function SessionCard({
  session,
  isActive,
  index,
  timestampLabel,
  timestampTitle,
  diffStats,
  onClick,
  onResume,
  onStop,
  onRename,
  onDelete,
}: SessionCardProps) {
  const isRunning = session.status === "running";
  const canManage = Boolean(onResume || onStop || onRename || onDelete);

  return (
    <div
      className={cn(
        "group/session flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors overflow-hidden cursor-pointer",
        isActive
          ? "bg-accent text-accent-foreground"
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
          <span className={cn(
            "truncate text-[13px] font-medium",
            !session.label && "italic text-muted-foreground",
          )}>
            {session.label || "New session"}
          </span>
        </div>
        <div
          className="mt-0.5 text-[11px] text-muted-foreground"
          title={timestampTitle}
        >
          {timestampLabel}
        </div>
      </div>

      {/* Right side: diff stats or action buttons */}
      <div className="relative mt-0.5 shrink-0 self-start">
        {diffStats && (diffStats.additions > 0 || diffStats.deletions > 0) ? (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] font-medium tabular-nums transition-opacity",
              canManage &&
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
          !canManage ? null : (
            <span
              className={cn(
                "flex items-start justify-end text-[10px] text-muted-foreground transition-opacity",
                "group-hover/session:opacity-0 group-hover/session:hidden group-focus-within/session:opacity-0 group-focus-within/session:hidden",
              )}
            />
          )
        )}
        {canManage && (
          <div className="hidden items-center gap-0.5 group-hover/session:flex group-focus-within/session:flex">
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
        )}
      </div>
    </div>
  );
}
