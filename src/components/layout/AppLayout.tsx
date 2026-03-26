import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, useAppDispatch } from "../../state/context";
import { Titlebar } from "./Titlebar";
import { SessionSidebar } from "../sidebar/SessionSidebar";
import { TerminalToolbar } from "../terminal/TerminalToolbar";
import { XTermContainer } from "../terminal/XTermContainer";
import { NewSessionDialog } from "../dialogs/NewSessionDialog";
import { GitPanel } from "../git/GitPanel";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { buildSpawnArgs } from "../../lib/agents";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { AgentType, Session, SessionStatus } from "../../state/types";

const MAX_ALIVE_TERMINALS = 8;

export function AppLayout() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [gitPanelOpen, setGitPanelOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const sessions = Object.values(state.sessions);
  const sortedSessionIds = useMemo(
    () =>
      sessions
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .map((s) => s.id),
    [sessions],
  );
  const activeSession = state.activeSessionId
    ? state.sessions[state.activeSessionId]
    : null;

  const aliveSessionIds = new Set(sortedSessionIds.slice(0, MAX_ALIVE_TERMINALS));

  const persistSession = useCallback(async (session: Session) => {
    try {
      await invoke("save_session", {
        session: {
          id: session.id,
          agent: session.agent,
          label: session.label,
          worktree_path: session.worktreePath,
          branch: session.branch,
          cwd: session.cwd,
          created_at: session.createdAt,
          command: session.command,
          args: session.args,
        },
      });
    } catch (err) {
      console.error("Failed to persist session:", err);
    }
  }, []);

  const handleNewSession = useCallback(
    (config: {
      agent: AgentType;
      label: string;
      task: string;
      useWorktree: boolean;
    }) => {
      const id = crypto.randomUUID();
      const cwd = "/Users/nyangshawbin/Documents/projects/switchboard";
      const { command, args } = buildSpawnArgs(
        config.agent,
        config.task || undefined,
      );

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
      persistSession(session);
    },
    [dispatch, persistSession],
  );

  const handleResumeSession = useCallback(
    (sessionId: string, projectPath: string) => {
      if (state.sessions[sessionId]) {
        dispatch({ type: "SET_ACTIVE", id: sessionId });
        return;
      }

      const session: Session = {
        id: sessionId,
        agent: "claude-code",
        label: `resumed-${sessionId.slice(0, 8)}`,
        status: "running",
        ptyId: null,
        worktreePath: null,
        branch: null,
        cwd: projectPath,
        createdAt: new Date().toISOString(),
        exitCode: null,
        command: "claude",
        args: ["--resume", sessionId],
      };
      dispatch({ type: "ADD_SESSION", session });
      persistSession(session);
    },
    [dispatch, state.sessions, persistSession],
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

  const shortcutHandlers = useMemo(
    () => ({
      onSwitchSession: (index: number) => {
        if (index < sortedSessionIds.length) {
          dispatch({ type: "SET_ACTIVE", id: sortedSessionIds[index] });
        }
      },
      onNextSession: () => {
        if (sortedSessionIds.length === 0 || !state.activeSessionId) return;
        const currentIdx = sortedSessionIds.indexOf(state.activeSessionId);
        const nextIdx = (currentIdx + 1) % sortedSessionIds.length;
        dispatch({ type: "SET_ACTIVE", id: sortedSessionIds[nextIdx] });
      },
      onPrevSession: () => {
        if (sortedSessionIds.length === 0 || !state.activeSessionId) return;
        const currentIdx = sortedSessionIds.indexOf(state.activeSessionId);
        const prevIdx =
          (currentIdx - 1 + sortedSessionIds.length) % sortedSessionIds.length;
        dispatch({ type: "SET_ACTIVE", id: sortedSessionIds[prevIdx] });
      },
      onNewSession: () => setDialogOpen(true),
      onToggleSidebar: () => setSidebarOpen((prev) => !prev),
      onToggleGitPanel: () => setGitPanelOpen((prev) => !prev),
      onFocusTerminal: () => {
        const termEl = document.querySelector(".xterm-helper-textarea");
        if (termEl instanceof HTMLElement) termEl.focus();
      },
    }),
    [sortedSessionIds, state.activeSessionId, dispatch],
  );
  useKeyboardShortcuts(shortcutHandlers);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Custom titlebar */}
      <Titlebar
        sidebarOpen={sidebarOpen}
        gitPanelOpen={gitPanelOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleGitPanel={() => setGitPanelOpen(!gitPanelOpen)}
        branch={activeSession?.branch ?? undefined}
      />

      {/* Main content below titlebar */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <SessionSidebar
            onNewSession={() => setDialogOpen(true)}
            onResumeSession={handleResumeSession}
          />
        )}

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <TerminalToolbar
            session={activeSession}
            gitPanelOpen={gitPanelOpen}
            onToggleGitPanel={() => setGitPanelOpen(!gitPanelOpen)}
          />

          {/* Terminal area */}
          <div className="flex-1 relative min-h-0">
            {sessions.length === 0 ? (
              <div className="h-full flex items-center justify-center bg-background">
                <div className="text-center max-w-sm">
                  <h2 className="text-lg font-semibold mb-3">
                    Welcome to Switchboard
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    Manage multiple AI coding agents in parallel.
                    <br />
                    Each session gets its own interactive terminal.
                  </p>
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus data-icon="inline-start" />
                    Start First Session
                  </Button>
                </div>
              </div>
            ) : (
              sessions.map((session) => {
                if (!aliveSessionIds.has(session.id)) return null;
                const isActive = session.id === state.activeSessionId;

                return (
                  <div
                    key={session.id}
                    className="absolute inset-0 bg-background"
                    style={{ display: isActive ? "block" : "none" }}
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

        {/* Git Panel */}
        <GitPanel
          cwd={
            activeSession?.cwd ??
            "/Users/nyangshawbin/Documents/projects/switchboard"
          }
          visible={gitPanelOpen && sessions.length > 0}
        />
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
