import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CircleDot } from "lucide-react";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { formatTokens, formatCost, estimateCost } from "../../lib/pricing";
import type { Session } from "../../state/types";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  "needs-input": "Needs Input",
  done: "Done",
  error: "Error",
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
}

export function SessionCard({ session, isActive, tokenInfo, onClick }: SessionCardProps) {
  const isDone = session.status === "done" || session.status === "error";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 items-start gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors overflow-hidden",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50 text-foreground",
        isDone && !isActive && "opacity-60",
      )}
    >
      <AgentIcon agent={session.agent} className="mt-0.5 size-4" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-[13px]">{session.label}</div>
        {session.branch && (
          <div className="truncate text-[11px] text-muted-foreground mt-0.5">
            {session.branch}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <CircleDot
            className={cn(
              "size-2.5",
              session.status === "running" && "text-[var(--sb-status-running)]",
              session.status === "needs-input" && "text-[var(--sb-status-warning)] animate-pulse",
              session.status === "done" && "text-[var(--sb-status-done)]",
              session.status === "error" && "text-destructive",
            )}
          />
          <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">
            {STATUS_LABELS[session.status] ?? session.status}
          </Badge>
          {tokenInfo && (tokenInfo.inputTokens > 0 || tokenInfo.outputTokens > 0) && (
            <span className="text-[10px] text-muted-foreground/70 ml-auto">
              {formatTokens(tokenInfo.inputTokens + tokenInfo.outputTokens)}
              {" · "}
              {formatCost(estimateCost(tokenInfo.model, tokenInfo.inputTokens, tokenInfo.outputTokens))}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
