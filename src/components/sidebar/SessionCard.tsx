import { Bot, Terminal, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Session } from "../../state/types";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  "needs-input": "Needs Input",
  done: "Done",
  error: "Error",
};

const AGENT_ICONS: Record<string, typeof Bot> = {
  "claude-code": Bot,
  codex: Bot,
  bash: Terminal,
};

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  isPast?: boolean;
  onClick: () => void;
}

export function SessionCard({ session, isActive, onClick }: SessionCardProps) {
  const isDone = session.status === "done" || session.status === "error";
  const AgentIcon = AGENT_ICONS[session.agent] ?? Terminal;

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
      <AgentIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
        </div>
      </div>
    </button>
  );
}
