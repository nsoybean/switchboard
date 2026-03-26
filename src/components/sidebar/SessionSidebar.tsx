import { Plus } from "lucide-react";
import { useAppState, useAppDispatch } from "../../state/context";
import { useClaudeSessions } from "../../hooks/useSessions";
import { SessionCard } from "./SessionCard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Session } from "../../state/types";

interface SessionSidebarProps {
  onNewSession: () => void;
  onResumeSession?: (sessionId: string, projectPath: string) => void;
}

export function SessionSidebar({
  onNewSession,
  onResumeSession,
}: SessionSidebarProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const projectPath = "/Users/nyangshawbin/Documents/projects/switchboard";
  const { sessions: claudeSessions, loading } =
    useClaudeSessions(projectPath);

  const activeSessions = Object.values(state.sessions).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const activeSessionIds = new Set(activeSessions.map((s) => s.id));
  const pastSessions = claudeSessions.filter(
    (cs) => !activeSessionIds.has(cs.session_id),
  );

  return (
    <div className="flex flex-col h-full w-full bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="text-sm font-semibold tracking-wide">SWITCHBOARD</h1>
        <Button size="sm" onClick={onNewSession}>
          <Plus data-icon="inline-start" />
          New
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-0.5 p-2">
          {/* Active sessions */}
          {activeSessions.length > 0 && pastSessions.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Active
            </div>
          )}
          {activeSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={state.activeSessionId === session.id}
              onClick={() =>
                dispatch({ type: "SET_ACTIVE", id: session.id })
              }
            />
          ))}

          {/* Past Claude sessions */}
          {pastSessions.length > 0 && (
            <>
              <Separator className="my-2" />
              <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Past Sessions
              </div>
              {pastSessions.map((cs) => {
                const pseudoSession: Session = {
                  id: cs.session_id,
                  agent: "claude-code",
                  label: cs.display,
                  status: "done",
                  ptyId: null,
                  worktreePath: null,
                  branch: null,
                  cwd: cs.project_path,
                  createdAt: cs.timestamp,
                  exitCode: null,
                  command: "claude",
                  args: ["--resume", cs.session_id],
                };
                return (
                  <SessionCard
                    key={cs.session_id}
                    session={pseudoSession}
                    isActive={state.activeSessionId === cs.session_id}
                    isPast
                    onClick={() => {
                      if (onResumeSession) {
                        onResumeSession(cs.session_id, cs.project_path);
                      }
                    }}
                  />
                );
              })}
            </>
          )}

          {/* Empty state */}
          {activeSessions.length === 0 && pastSessions.length === 0 && !loading && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No sessions yet.
            </div>
          )}

          {/* Loading state */}
          {loading && activeSessions.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Loading sessions...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
