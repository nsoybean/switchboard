import { useCallback } from "react";
import { useAppState, useAppDispatch } from "../../state/context";
import { SessionSidebar } from "../sidebar/SessionSidebar";
import { TerminalToolbar } from "../terminal/TerminalToolbar";
import { XTermContainer } from "../terminal/XTermContainer";
import type { Session, SessionStatus } from "../../state/types";

const MAX_ALIVE_TERMINALS = 8;

function generateId(): string {
  return crypto.randomUUID();
}

export function AppLayout() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const sessions = Object.values(state.sessions);
  const activeSession = state.activeSessionId
    ? state.sessions[state.activeSessionId]
    : null;

  // Determine which terminals to keep alive (most recently active, capped at 8)
  const aliveSessionIds = new Set(
    sessions
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, MAX_ALIVE_TERMINALS)
      .map((s) => s.id),
  );

  const handleNewSession = useCallback(() => {
    const id = generateId();
    const cwd = "/Users/nyangshawbin/Documents/projects/switchboard";
    const session: Session = {
      id,
      agent: "bash",
      label: `bash-${sessions.length + 1}`,
      status: "running",
      ptyId: null,
      worktreePath: null,
      branch: null,
      cwd,
      createdAt: new Date().toISOString(),
      exitCode: null,
    };
    dispatch({ type: "ADD_SESSION", session });
  }, [dispatch, sessions.length]);

  const handleSessionExit = useCallback(
    (sessionId: string) => (code: number | null) => {
      const status: SessionStatus =
        code === 0 || code === null ? "done" : "error";
      dispatch({
        type: "UPDATE_STATUS",
        id: sessionId,
        status,
        exitCode: code,
      });
    },
    [dispatch],
  );

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <SessionSidebar onNewSession={handleNewSession} />

      {/* Main area */}
      <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        {/* Toolbar */}
        <TerminalToolbar session={activeSession} />

        {/* Terminal area */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          {sessions.length === 0 ? (
            /* Empty state */
            <div
              className="h-full flex items-center justify-center"
              style={{ background: "var(--sb-bg-terminal)" }}
            >
              <div className="text-center" style={{ maxWidth: 400 }}>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: "var(--sb-text-primary)",
                    marginBottom: 12,
                  }}
                >
                  Welcome to Switchboard
                </h2>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--sb-text-secondary)",
                    marginBottom: 24,
                    lineHeight: 1.6,
                  }}
                >
                  Manage multiple AI coding agents in parallel.
                  <br />
                  Each session gets its own interactive terminal.
                </p>
                <button
                  onClick={handleNewSession}
                  style={{
                    background: "var(--sb-accent)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "10px 24px",
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Start First Session
                </button>
              </div>
            </div>
          ) : (
            /* Terminal instances — keep alive, show/hide */
            sessions.map((session) => {
              if (!aliveSessionIds.has(session.id)) return null;
              const isActive = session.id === state.activeSessionId;

              return (
                <div
                  key={session.id}
                  className="absolute inset-0"
                  style={{
                    display: isActive ? "block" : "none",
                    background: "var(--sb-bg-terminal)",
                  }}
                >
                  <XTermContainer
                    command="/bin/bash"
                    cwd={session.cwd}
                    onExit={handleSessionExit(session.id)}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
