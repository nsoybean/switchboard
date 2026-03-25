import { useCallback, useState } from "react";
import { useAppState, useAppDispatch } from "../../state/context";
import { SessionSidebar } from "../sidebar/SessionSidebar";
import { TerminalToolbar } from "../terminal/TerminalToolbar";
import { XTermContainer } from "../terminal/XTermContainer";
import { NewSessionDialog } from "../dialogs/NewSessionDialog";
import { buildSpawnArgs } from "../../lib/agents";
import type { AgentType, Session, SessionStatus } from "../../state/types";

const MAX_ALIVE_TERMINALS = 8;

export function AppLayout() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [dialogOpen, setDialogOpen] = useState(false);

  const sessions = Object.values(state.sessions);
  const activeSession = state.activeSessionId
    ? state.sessions[state.activeSessionId]
    : null;

  // Keep most recent N terminals alive
  const aliveSessionIds = new Set(
    sessions
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, MAX_ALIVE_TERMINALS)
      .map((s) => s.id),
  );

  const handleNewSession = useCallback(
    (config: {
      agent: AgentType;
      label: string;
      task: string;
      useWorktree: boolean;
    }) => {
      const id = crypto.randomUUID();
      const cwd = "/Users/nyangshawbin/Documents/projects/switchboard"; // TODO: make configurable
      const { command, args } = buildSpawnArgs(config.agent, config.task || undefined);

      const session: Session = {
        id,
        agent: config.agent,
        label: config.label,
        status: "running",
        ptyId: null,
        worktreePath: null,
        branch: null,
        cwd,
        createdAt: new Date().toISOString(),
        exitCode: null,
        command,
        args,
      };

      dispatch({ type: "ADD_SESSION", session });
    },
    [dispatch],
  );

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
      <SessionSidebar onNewSession={() => setDialogOpen(true)} />

      {/* Main area */}
      <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        {/* Toolbar */}
        <TerminalToolbar session={activeSession} />

        {/* Terminal area */}
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          {sessions.length === 0 ? (
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
                  onClick={() => setDialogOpen(true)}
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
                    command={session.command}
                    args={session.args}
                    cwd={session.cwd}
                    onExit={handleSessionExit(session.id)}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* New Session Dialog */}
      <NewSessionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleNewSession}
      />
    </div>
  );
}
