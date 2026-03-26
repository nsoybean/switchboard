import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CircleDot } from "lucide-react";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { XTermContainer } from "./XTermContainer";
import type { Session } from "../../state/types";

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  bash: "bash",
};

interface ScrollViewProps {
  sessions: Session[];
  onSessionClick: (id: string) => void;
  onSessionExit: (id: string) => (code: number | null) => void;
}

export function ScrollView({
  sessions,
  onSessionClick,
  onSessionExit,
}: ScrollViewProps) {
  if (sessions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        No active sessions.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-2">
      <div
        className="grid gap-2 h-full"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(400px, 1fr))`,
          gridAutoRows: "minmax(300px, 1fr)",
        }}
      >
        {sessions.map((session) => {
          return (
            <div
              key={session.id}
              className="flex flex-col border rounded-md overflow-hidden bg-background cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => onSessionClick(session.id)}
            >
              {/* Mini header */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-card shrink-0">
                <AgentIcon agent={session.agent} className="size-3.5" />
                <span className="text-xs font-medium truncate flex-1">
                  {session.label}
                </span>
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {AGENT_LABELS[session.agent] ?? session.agent}
                </Badge>
                <CircleDot
                  className={cn(
                    "size-2.5",
                    session.status === "running" && "text-[var(--sb-status-running)]",
                    session.status === "needs-input" && "text-[var(--sb-status-warning)] animate-pulse",
                    session.status === "done" && "text-[var(--sb-status-done)]",
                    session.status === "error" && "text-destructive",
                  )}
                />
              </div>
              {/* Terminal */}
              <div className="flex-1 min-h-0">
                <XTermContainer
                  command={session.command}
                  args={session.args}
                  cwd={session.cwd}
                  onExit={onSessionExit(session.id)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
