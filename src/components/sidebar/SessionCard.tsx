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
import { CircleDot, Ellipsis, PencilLine, Square, Trash2 } from "lucide-react";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { formatTokens, formatCost, estimateCost } from "../../lib/pricing";
import type { Session } from "../../state/types";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
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
  onClick: () => void;
  onStop?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

export function SessionCard({
  session,
  isActive,
  isPast,
  tokenInfo,
  onClick,
  onStop,
  onRename,
  onDelete,
}: SessionCardProps) {
  const isDone =
    session.status === "done" ||
    session.status === "error" ||
    session.status === "stopped";
  const canManage = !isPast && (onStop || onRename || onDelete);

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
          <div className="truncate font-medium text-[13px]">{session.label}</div>
          {session.branch && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {session.branch}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            <CircleDot
              className={cn(
                "size-2.5",
                session.status === "running" && "text-[var(--sb-status-running)]",
                session.status === "needs-input" && "text-[var(--sb-status-warning)] animate-pulse",
                session.status === "done" && "text-[var(--sb-status-done)]",
                session.status === "stopped" && "text-muted-foreground",
                session.status === "error" && "text-destructive",
              )}
            />
            <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">
              {STATUS_LABELS[session.status] ?? session.status}
            </Badge>
            {tokenInfo && (tokenInfo.inputTokens > 0 || tokenInfo.outputTokens > 0) && (
              <span className="ml-auto text-[10px] text-muted-foreground/70">
                {formatTokens(tokenInfo.inputTokens + tokenInfo.outputTokens)}
                {" · "}
                {formatCost(estimateCost(tokenInfo.model, tokenInfo.inputTokens, tokenInfo.outputTokens))}
              </span>
            )}
          </div>
        </div>
      </button>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mt-0.5 opacity-0 transition-opacity group-hover/session:opacity-100 group-focus-within/session:opacity-100 data-[state=open]:opacity-100"
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
  )
}
