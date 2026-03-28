import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Circle,
  Ellipsis,
  PencilLine,
  Play,
  Square,
  Trash2,
} from "lucide-react";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { formatTokens, formatCost, estimateCost } from "../../lib/pricing";
import type { Session } from "../../state/types";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  idle: "Idle",
  "needs-input": "Needs Input",
  done: "Done",
  error: "Error",
  stopped: "Stopped",
};

interface TokenInfo {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
}

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  isPast?: boolean;
  tokenInfo?: TokenInfo;
  timestampLabel?: string;
  timestampTitle?: string;
  onClick: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

export function SessionCard({
  session,
  isActive,
  tokenInfo,
  timestampLabel,
  timestampTitle,
  onClick,
  onResume,
  onStop,
  onRename,
  onDelete,
}: SessionCardProps) {
  const isDone =
    session.status === "done" ||
    session.status === "error" ||
    session.status === "stopped";
  const canManage = Boolean(onResume || onStop || onRename || onDelete);

  return (
    <div
      className={cn(
        "group/session flex w-full min-w-0 items-start gap-2 rounded-md px-3 py-2 text-sm transition-colors overflow-hidden",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50 text-foreground",
        isDone && !isActive && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
      >
        <AgentIcon agent={session.agent} className="mt-0.5 size-4" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[13px]">
            {session.label}
          </div>
          {session.branch && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {session.branch}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {!isDone && (
              <>
                <Circle
                  className={cn(
                    "size-2.5 fill-current",
                    session.status === "running" &&
                      "text-[var(--sb-status-running)]",
                    session.status === "idle" &&
                      "text-[var(--sb-status-done)]",
                    session.status === "needs-input" &&
                      "text-[var(--sb-status-warning)] animate-pulse",
                  )}
                />
                <Badge
                  variant="secondary"
                  className="h-4 px-1 text-[10px] font-normal"
                >
                  {STATUS_LABELS[session.status] ?? session.status}
                </Badge>
              </>
            )}
            {tokenInfo &&
              (tokenInfo.inputTokens > 0 || tokenInfo.outputTokens > 0) && (
                <span className="text-[10px] text-muted-foreground/70">
                  {formatTokens(tokenInfo.inputTokens + tokenInfo.outputTokens)}
                  {" · "}
                  {formatCost(
                    estimateCost(
                      tokenInfo.model,
                      tokenInfo.inputTokens,
                      tokenInfo.outputTokens,
                    ),
                  )}
                </span>
              )}
          </div>
        </div>
      </button>
      <div className="relative mt-0.5 h-5 w-8 shrink-0 self-start">
        {timestampLabel && (
          <span
            className={cn(
              "absolute inset-0 flex items-start justify-end text-[10px] text-muted-foreground transition-opacity",
              canManage &&
                "group-hover/session:opacity-0 group-focus-within/session:opacity-0",
            )}
            title={timestampTitle}
            aria-label={timestampTitle}
          >
            {timestampLabel}
          </span>
        )}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-0 top-0 opacity-0 transition-opacity pointer-events-none group-hover/session:opacity-100 group-hover/session:pointer-events-auto group-focus-within/session:opacity-100 group-focus-within/session:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <Ellipsis />
                <span className="sr-only">Session actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-36"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenuGroup>
                {onResume && (
                  <DropdownMenuItem onSelect={onResume}>
                    <Play />
                    Resume
                  </DropdownMenuItem>
                )}
                {onStop && (
                  <DropdownMenuItem onSelect={onStop}>
                    <Square />
                    Stop
                  </DropdownMenuItem>
                )}
                {onRename && (
                  <DropdownMenuItem onSelect={onRename}>
                    <PencilLine />
                    Rename
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
