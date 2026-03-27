import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CircleDot, Square } from "lucide-react";
import { AgentIcon } from "@/components/agents/AgentIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { XTermContainer } from "./XTermContainer";
import type { Session } from "../../state/types";

interface ScrollViewProps {
  sessions: Session[];
  activeSessionId?: string | null;
  onSessionSelect?: (id: string) => void;
  onStopSession?: (id: string) => Promise<void>;
  onSessionSpawn: (id: string, ptyId: number) => void;
  onSessionExit: (id: string) => (code: number | null) => void;
}

export function ScrollView({
  sessions,
  activeSessionId,
  onSessionSelect,
  onStopSession,
  onSessionSpawn,
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
          const isActive = session.id === activeSessionId;
          const canStop =
            session.ptyId !== null &&
            (session.status === "running" || session.status === "needs-input");
          return (
            <div
              key={session.id}
              className={cn(
                "flex flex-col overflow-hidden rounded-md border bg-background transition-colors",
                isActive
                  ? "border-primary shadow-sm"
                  : "hover:border-primary/50",
              )}
              onClick={() => onSessionSelect?.(session.id)}
            >
              {/* Mini header */}
              <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-1.5">
                <AgentIcon agent={session.agent} className="size-3.5" />
                <span className="text-xs font-medium truncate flex-1">
                  {session.label}
                </span>
                {canStop && onStopSession ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onStopSession(session.id);
                        }}
                      >
                        <Square />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Stop session</TooltipContent>
                  </Tooltip>
                ) : null}
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
              </div>
              {/* Terminal */}
              <div className="flex-1 min-h-0">
                <XTermContainer
                  command={session.command}
                  args={session.args}
                  cwd={session.cwd}
                  onSpawn={(ptyId) => onSessionSpawn(session.id, ptyId)}
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
