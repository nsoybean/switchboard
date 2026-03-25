import { useAppState, useAppDispatch } from "../../state/context";
import { useClaudeSessions } from "../../hooks/useSessions";
import { SessionCard } from "./SessionCard";
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

  // TODO: make project path configurable
  const projectPath = "/Users/nyangshawbin/Documents/projects/switchboard";
  const { sessions: claudeSessions, loading } =
    useClaudeSessions(projectPath);

  // Active Switchboard sessions
  const activeSessions = Object.values(state.sessions).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Past Claude sessions not already active in Switchboard
  const activeSessionIds = new Set(
    activeSessions.map((s) => s.id),
  );
  const pastSessions = claudeSessions.filter(
    (cs) => !activeSessionIds.has(cs.session_id),
  );

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 260,
        minWidth: 260,
        background: "var(--sb-bg-surface)",
        borderRight: "1px solid var(--sb-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--sb-border)",
        }}
      >
        <h1
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.5px",
            color: "var(--sb-text-primary)",
          }}
        >
          SWITCHBOARD
        </h1>
        <button
          onClick={onNewSession}
          style={{
            background: "var(--sb-accent)",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + New
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 8 }}>
        {/* Active sessions */}
        {activeSessions.length > 0 && (
          <>
            {activeSessions.length > 0 && pastSessions.length > 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--sb-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  padding: "8px 12px 4px",
                }}
              >
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
          </>
        )}

        {/* Past Claude sessions */}
        {pastSessions.length > 0 && (
          <>
            <div
              style={{
                fontSize: 10,
                color: "var(--sb-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                padding: "12px 12px 4px",
              }}
            >
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
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--sb-text-tertiary)", fontSize: 12 }}
          >
            <p className="text-center">No sessions yet.</p>
          </div>
        )}

        {/* Loading state */}
        {loading && activeSessions.length === 0 && (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "var(--sb-text-tertiary)", fontSize: 12 }}
          >
            <p>Loading sessions...</p>
          </div>
        )}
      </div>
    </div>
  );
}
