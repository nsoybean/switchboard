import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, useAppDispatch } from "../../state/context";
import { Titlebar } from "./Titlebar";
import { SessionSidebar } from "../sidebar/SessionSidebar";
import { TerminalToolbar } from "../terminal/TerminalToolbar";
import { XTermContainer } from "../terminal/XTermContainer";
import { ScrollView } from "../terminal/ScrollView";
import { NewSessionDialog } from "../dialogs/NewSessionDialog";
import { ProjectPickerDialog } from "../dialogs/ProjectPickerDialog";
import { GitPanel } from "../git/GitPanel";
import { FilePreview } from "../files/FilePreview";
import { SettingsPage } from "../settings/SettingsPage";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { buildSpawnArgs } from "../../lib/agents";
import { worktreeCommands } from "../../lib/tauri-commands";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { FolderOpen, Plus } from "lucide-react";
import type { AgentType, Session, SessionStatus } from "../../state/types";

const MAX_ALIVE_TERMINALS = 8;

export function AppLayout() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [gitPanelOpen, setGitPanelOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sessionsRef = useRef(state.sessions);

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

  useEffect(() => {
    sessionsRef.current = state.sessions;
  }, [state.sessions]);

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
    async (config: {
      agent: AgentType;
      label: string;
      task: string;
      useWorktree: boolean;
    }) => {
      if (!state.projectPath) return;
      const id = crypto.randomUUID();
      let cwd = state.projectPath;
      let worktreePath: string | null = null;
      let branch: string | null = null;

      if (config.useWorktree) {
        try {
          const slug = config.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "untitled";
          const branchName = `sb/${slug}`;
          const info = await worktreeCommands.create(
            state.projectPath,
            branchName,
            config.label,
          );
          cwd = info.path;
          worktreePath = info.path;
          branch = info.branch;
        } catch (err) {
          toast.error("Failed to create worktree", {
            description: String(err),
          });
          return;
        }
      }

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
        worktreePath,
        branch,
        cwd,
        createdAt: new Date().toISOString(),
        exitCode: null,
        command,
        args,
      };
      dispatch({ type: "ADD_SESSION", session });
      persistSession(session);
    },
    [dispatch, persistSession, state.projectPath],
  );

  const handleResumeSession = useCallback(
    (sessionId: string, projectPath: string, label: string) => {
      if (state.sessions[sessionId]) {
        dispatch({ type: "SET_ACTIVE", id: sessionId });
        return;
      }

      const session: Session = {
        id: sessionId,
        agent: "claude-code",
        label,
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
      const currentStatus = sessionsRef.current[sessionId]?.status;
      const status: SessionStatus =
        currentStatus === "stopped"
          ? "stopped"
          : code === 0 || code === null
            ? "done"
            : "error";
      dispatch({ type: "SET_PTY_ID", id: sessionId, ptyId: null });
      dispatch({
        type: "UPDATE_STATUS",
        id: sessionId,
        status,
        exitCode: code,
      });
    },
    [dispatch],
  );

  const handleSessionSpawn = useCallback(
    (sessionId: string, ptyId: number) => {
      dispatch({ type: "SET_PTY_ID", id: sessionId, ptyId });
    },
    [dispatch],
  );

  const handleStopSession = useCallback(
    async (sessionId: string) => {
      const session = sessionsRef.current[sessionId];
      if (!session || session.ptyId === null) return;

      try {
        await invoke("pty_kill", { id: session.ptyId });
        dispatch({ type: "SET_PTY_ID", id: sessionId, ptyId: null });
        dispatch({
          type: "UPDATE_STATUS",
          id: sessionId,
          status: "stopped",
          exitCode: session.exitCode,
        });
      } catch (err) {
        toast.error("Failed to stop session", {
          description: String(err),
        });
      }
    },
    [dispatch],
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, label: string) => {
      const session = state.sessions[sessionId];
      if (!session) return;

      const nextLabel = label.trim();
      if (!nextLabel || nextLabel === session.label) return;

      const updatedSession: Session = { ...session, label: nextLabel };

      try {
        await persistSession(updatedSession);
        dispatch({ type: "RENAME_SESSION", id: sessionId, label: nextLabel });
      } catch (err) {
        toast.error("Failed to rename session", {
          description: String(err),
        });
      }
    },
    [dispatch, persistSession, state.sessions],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const session = state.sessions[sessionId];
      if (!session) return;

      if (session.ptyId !== null) {
        await invoke("pty_kill", { id: session.ptyId }).catch((err) => {
          console.warn("Failed to kill PTY during session deletion:", err);
        });
      }

      try {
        await invoke("delete_session", { id: sessionId });
        dispatch({ type: "REMOVE_SESSION", id: sessionId });
        dispatch({ type: "SET_PREVIEW_FILE", path: null });
      } catch (err) {
        toast.error("Failed to delete session", {
          description: String(err),
        });
      }
    },
    [dispatch, state.sessions],
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
      onToggleViewMode: () => {
        dispatch({
          type: "SET_VIEW_MODE",
          mode: state.viewMode === "focused" ? "scroll" : "focused",
        });
      },
    }),
    [sortedSessionIds, state.activeSessionId, state.viewMode, dispatch],
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
        projectName={
          state.projectPath
            ? state.projectPath.split("/").pop() ?? "switchboard"
            : "switchboard"
        }
        onProjectClick={() => setProjectPickerOpen(true)}
        viewMode={state.viewMode}
        onToggleViewMode={() =>
          dispatch({
            type: "SET_VIEW_MODE",
            mode: state.viewMode === "focused" ? "scroll" : "focused",
          })
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Settings page (full overlay) */}
      {settingsOpen ? (
        <div className="flex-1 min-h-0">
          <SettingsPage onBack={() => setSettingsOpen(false)} />
        </div>
      ) : (
      /* Main content below titlebar */
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <>
            <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
              <SessionSidebar
                onNewSession={() => setDialogOpen(true)}
                onResumeSession={handleResumeSession}
                onStopSession={handleStopSession}
                onRenameSession={handleRenameSession}
                onDeleteSession={handleDeleteSession}
              />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        {/* Main area */}
        <ResizablePanel defaultSize="55%">
          <div className="flex flex-col h-full min-w-0 overflow-hidden">
            <TerminalToolbar
              session={activeSession}
              onStopSession={handleStopSession}
              gitPanelOpen={gitPanelOpen}
              onToggleGitPanel={() => setGitPanelOpen(!gitPanelOpen)}
            />

            <div className="flex-1 relative min-h-0">
              {!state.projectPath ? (
                <div className="h-full flex items-center justify-center bg-background">
                  <div className="text-center max-w-sm">
                    <h2 className="text-lg font-semibold mb-3">
                      Welcome to Switchboard
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                      Manage multiple AI coding agents in parallel.
                      <br />
                      Open a project to get started.
                    </p>
                    <Button onClick={() => setProjectPickerOpen(true)}>
                      <FolderOpen data-icon="inline-start" />
                      Open Project
                    </Button>
                  </div>
                </div>
              ) : sessions.length === 0 ? (
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
              ) : state.viewMode === "scroll" ? (
                <ScrollView
                  sessions={sessions.filter((s) => aliveSessionIds.has(s.id))}
                  onSessionClick={(id) => {
                    dispatch({ type: "SET_ACTIVE", id });
                    dispatch({ type: "SET_VIEW_MODE", mode: "focused" });
                  }}
                  onSessionSpawn={handleSessionSpawn}
                  onSessionExit={handleSessionExit}
                />
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
                        isActive={isActive}
                        onSpawn={(ptyId) => handleSessionSpawn(session.id, ptyId)}
                        onExit={handleSessionExit(session.id)}
                      />
                    </div>
                  );
                })
              )}

              {/* File preview overlay */}
              {state.previewFilePath && (
                <div className="absolute inset-0 z-10">
                  <FilePreview
                    filePath={state.previewFilePath}
                    onClose={() =>
                      dispatch({ type: "SET_PREVIEW_FILE", path: null })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        {/* Git Panel (hidden in scroll view) */}
        {gitPanelOpen && sessions.length > 0 && state.viewMode === "focused" && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="25%" minSize="15%" maxSize="40%">
              <GitPanel
                cwd={activeSession?.cwd ?? state.projectPath ?? ""}
                visible
                githubToken={state.githubToken}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      )}

      {/* New Session Dialog */}
      <NewSessionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleNewSession}
      />

      {/* Project Picker Dialog */}
      <ProjectPickerDialog
        open={projectPickerOpen}
        onClose={() => setProjectPickerOpen(false)}
        onSelect={(path) => {
          dispatch({ type: "SET_PROJECT_PATH", path });
        }}
      />
    </div>
  );
}
