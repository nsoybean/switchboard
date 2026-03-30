import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, useAppDispatch } from "../../state/context";
import { Titlebar } from "./Titlebar";
import { SessionSidebar } from "../sidebar/SessionSidebar";
import { SessionTranscriptView } from "../terminal/SessionTranscriptView";
import { XTermContainer } from "../terminal/XTermContainer";
import { GridView } from "../terminal/GridView";
import { NewSessionDialog } from "../dialogs/NewSessionDialog";
import { ProjectPickerDialog } from "../dialogs/ProjectPickerDialog";
import { FilePreview } from "../files/FilePreview";
import { SettingsPage } from "../settings/SettingsPage";
import {
  WorkspacePanel,
  type WorkspaceContext,
  type WorkspaceTab,
} from "../workspace/WorkspacePanel";
import { useAppUpdater } from "../../hooks/useAppUpdater";
import { useClaudeHooks } from "../../hooks/useClaudeHooks";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { buildResumeArgs, buildSpawnArgs } from "../../lib/agents";
import { getBranchPrefix } from "../../lib/branches";
import {
  fileCommands,
  hookCommands,
  projectCommands,
  worktreeCommands,
} from "../../lib/tauri-commands";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { FolderOpen, Plus, Square } from "lucide-react";
import { AgentIcon } from "@/components/agents/AgentIcon";
import type {
  AgentType,
  Session,
  SessionStatus,
  SessionWorkspaceIdentity,
  SessionWorkspaceKind,
} from "../../state/types";

const MAX_ALIVE_TERMINALS = 8;

interface HistorySessionSummary {
  session_id: string;
  display: string;
  timestamp: string;
  project_path: string;
}

function getCodexInitialPrompt(session: Session): string | null {
  if (session.agent !== "codex" || session.args.length === 0) {
    return null;
  }

  const [firstArg] = session.args;
  if (!firstArg || firstArg.startsWith("-") || firstArg === "resume") {
    return null;
  }

  return firstArg;
}

function isPathWithinRoot(path: string, rootPath: string): boolean {
  return path === rootPath || path.startsWith(`${rootPath}/`);
}

function sessionBelongsToProject(
  session: Session,
  projectPath: string | null,
): boolean {
  if (!projectPath) return true;
  if (session.workspace.repoRoot) {
    return session.workspace.repoRoot === projectPath;
  }
  return session.cwd === projectPath || session.cwd.startsWith(`${projectPath}/`);
}

function slugifyLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

function getWorkspaceDisplayPath(path: string, repoRoot: string | null): string {
  if (!repoRoot) return path;
  if (path === repoRoot) return ".";
  if (path.startsWith(`${repoRoot}/`)) {
    return path.slice(repoRoot.length + 1);
  }
  return path;
}

function getWorkspaceKind(
  repoRoot: string | null,
  worktreePath: string | null,
): SessionWorkspaceKind {
  if (!worktreePath) return "project";
  if (!repoRoot) return "external-worktree";
  if (worktreePath.startsWith(`${repoRoot}/.switchboard-worktrees/`)) {
    return "switchboard-worktree";
  }
  return "external-worktree";
}

function buildWorkspaceIdentity(config: {
  repoRoot: string | null;
  launchRoot: string;
  worktreePath: string | null;
  branchName: string | null;
  baseBranchName?: string | null;
}): SessionWorkspaceIdentity {
  const workspaceKind = getWorkspaceKind(config.repoRoot, config.worktreePath);
  return {
    repoRoot: config.repoRoot,
    launchRoot: config.launchRoot,
    displayPath: getWorkspaceDisplayPath(config.launchRoot, config.repoRoot),
    worktreePath: config.worktreePath,
    workspaceKind,
    branchName: config.branchName,
    baseBranchName: config.baseBranchName ?? null,
    headKind: config.branchName ? "branch" : "unknown",
  };
}

export function AppLayout() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<Session | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("files");
  const sessionsRef = useRef(state.sessions);
  const hookConfigReady = useRef<Promise<void>>(Promise.resolve());
  const {
    currentVersion,
    availableUpdate,
    checkingForUpdates,
    installingUpdate,
    updateProgress,
    checkForUpdates,
    installUpdate,
  } = useAppUpdater();

  const sessions = Object.values(state.sessions);
  const projectSessions = sessions.filter((session) =>
    sessionBelongsToProject(session, state.projectPath),
  );
  const liveSessions = projectSessions.filter(
    (session) =>
      session.status === "running" ||
      session.status === "idle" ||
      session.status === "needs-input",
  );
  const sortedSessionIds = useMemo(
    () =>
      liveSessions
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .map((s) => s.id),
    [liveSessions],
  );
  const activeSessionCandidate = state.activeSessionId
    ? state.sessions[state.activeSessionId]
    : null;
  const activeSession =
    activeSessionCandidate &&
    sessionBelongsToProject(activeSessionCandidate, state.projectPath)
      ? activeSessionCandidate
      : null;
  const viewingSessionInProject =
    viewingSession &&
    sessionBelongsToProject(viewingSession, state.projectPath)
      ? viewingSession
      : null;
  const selectedSession = viewingSessionInProject
    ? (state.sessions[viewingSessionInProject.id] ?? viewingSessionInProject)
    : activeSession;
  const selectedSessionId = viewingSessionInProject?.id ?? activeSession?.id ?? null;
  const projectLabel = state.projectPath
    ? (state.projectPath.split("/").pop() ?? "Project")
    : "Project";
  const workspaceCandidate = useMemo<WorkspaceContext | null>(() => {
    if (!state.projectPath) {
      return null;
    }

    if (!selectedSession) {
      return {
        kind: "project",
        rootPath: null,
        label: projectLabel,
        branch: null,
        availability: "resolving",
        source: "project",
        isWorktree: false,
      };
    }

    const isLive = Boolean(state.sessions[selectedSession.id]);
    const source: WorkspaceContext["source"] = selectedSession.worktreePath
      ? "worktreePath"
      : isLive
        ? "cwd"
        : "history";

    return {
      kind: "session",
      rootPath: null,
      label: selectedSession.label,
      branch: selectedSession.branch,
      availability: "resolving",
      source,
      isWorktree: Boolean(selectedSession.worktreePath),
    };
    // Only depend on workspace-relevant fields, not the full sessions object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectLabel,
    selectedSession?.id,
    selectedSession?.label,
    selectedSession?.branch,
    selectedSession?.worktreePath,
    selectedSession?.cwd,
    state.projectPath,
    // We need to know if the session is live (in state.sessions) but we don't
    // want every status update to trigger a recompute. Check presence only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    selectedSession ? Boolean(state.sessions[selectedSession.id]) : false,
  ]);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(
    workspaceCandidate,
  );

  const aliveSessionIds = new Set(
    sortedSessionIds.slice(0, MAX_ALIVE_TERMINALS),
  );

  useEffect(() => {
    if (viewingSession && !sessionBelongsToProject(viewingSession, state.projectPath)) {
      setViewingSession(null);
    }
  }, [state.projectPath, viewingSession]);

  useEffect(() => {
    if (
      state.activeSessionId &&
      activeSessionCandidate &&
      !sessionBelongsToProject(activeSessionCandidate, state.projectPath)
    ) {
      dispatch({ type: "SET_ACTIVE", id: liveSessions[0]?.id ?? null });
    }
  }, [
    activeSessionCandidate,
    dispatch,
    liveSessions,
    state.activeSessionId,
    state.projectPath,
  ]);

  useEffect(() => {
    sessionsRef.current = state.sessions;
  }, [state.sessions]);

  // Write hook config for the current project on startup / project change.
  // Sessions await hookConfigReady before spawning to avoid a race.
  useEffect(() => {
    if (!state.projectPath) return;
    const cwd = state.projectPath;
    hookConfigReady.current = hookCommands
      .getPort()
      .then((port) => hookCommands.writeConfig(cwd, port))
      .catch((err) => console.warn("Failed to write hook config on startup:", err));
  }, [state.projectPath]);

  useEffect(() => {
    let cancelled = false;

    setWorkspaceContext(workspaceCandidate);

    if (!state.projectPath) {
      return () => {
        cancelled = true;
      };
    }

    const resolveWorkspace = async () => {
      try {
        if (!selectedSession) {
          const projectPath = state.projectPath;
          if (!projectPath) return;

          const status = await fileCommands.inspectDirectory(projectPath);
          if (cancelled) return;

          setWorkspaceContext({
            kind: "project",
            rootPath:
              status.exists && status.is_dir
                ? (status.canonical_path ?? projectPath)
                : null,
            label: projectLabel,
            branch: null,
            availability:
              status.exists && status.is_dir ? "ready" : "missing",
            source: "project",
            isWorktree: false,
          });
          return;
        }

        const wcSource = workspaceCandidate?.source;
        const sessionSource: Exclude<WorkspaceContext["source"], "project"> =
          wcSource === "worktreePath" || wcSource === "history"
            ? wcSource
            : "cwd";
        const preferredRoots: Array<{
          path: string;
          source: Exclude<WorkspaceContext["source"], "project">;
          isWorktree: boolean;
        }> = [];

        if (selectedSession.worktreePath) {
          preferredRoots.push({
            path: selectedSession.worktreePath,
            source: "worktreePath",
            isWorktree: true,
          });
        }

        if (selectedSession.cwd) {
          preferredRoots.push({
            path: selectedSession.cwd,
            source: sessionSource,
            isWorktree: false,
          });
        }

        for (const candidate of preferredRoots) {
          const status = await fileCommands.inspectDirectory(candidate.path);
          if (cancelled) return;
          if (!status.exists || !status.is_dir) {
            continue;
          }

          setWorkspaceContext({
            kind: "session",
            rootPath: status.canonical_path ?? candidate.path,
            label: selectedSession.label,
            branch: selectedSession.branch,
            availability: "ready",
            source: candidate.source,
            isWorktree: candidate.isWorktree,
          });
          return;
        }

        if (cancelled) return;

        setWorkspaceContext({
          kind: "session",
          rootPath: null,
          label: selectedSession.label,
          branch: selectedSession.branch,
          availability: "missing",
          source: selectedSession.worktreePath ? "worktreePath" : sessionSource,
          isWorktree: Boolean(selectedSession.worktreePath),
        });
      } catch (error) {
        if (cancelled) return;

        console.error("Failed to resolve workspace context:", error);
        setWorkspaceContext({
          ...(workspaceCandidate ?? {
            kind: "project",
            rootPath: null,
            label: projectLabel,
            branch: null,
            availability: "missing",
            source: "project",
            isWorktree: false,
          }),
          rootPath: null,
          availability: "missing",
        });
      }
    };

    void resolveWorkspace();

    return () => {
      cancelled = true;
    };
    // Only re-resolve when workspace-relevant data changes, not on every
    // session status update.  workspaceCandidate already filters this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectLabel,
    state.projectPath,
    workspaceCandidate,
  ]);

  useEffect(() => {
    if (!state.previewFilePath) return;
    if (!workspaceContext || workspaceContext.availability !== "ready" || !workspaceContext.rootPath) {
      dispatch({ type: "SET_PREVIEW_FILE", path: null });
      return;
    }

    if (!isPathWithinRoot(state.previewFilePath, workspaceContext.rootPath)) {
      dispatch({ type: "SET_PREVIEW_FILE", path: null });
    }
  }, [dispatch, state.previewFilePath, workspaceContext]);

  const persistSession = useCallback(async (session: Session) => {
    try {
      await invoke("save_session", {
        session: {
          id: session.id,
          agent: session.agent,
          label: session.label,
          resume_target_id: session.resumeTargetId,
          worktree_path: session.worktreePath,
          branch: session.branch,
          repo_root: session.workspace.repoRoot,
          launch_root: session.workspace.launchRoot,
          display_path: session.workspace.displayPath,
          workspace_kind: session.workspace.workspaceKind,
          base_branch: session.workspace.baseBranchName,
          head_kind: session.workspace.headKind,
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
      baseBranch: string | null;
    }) => {
      if (!state.projectPath) return;
      const id = crypto.randomUUID();
      let cwd = state.projectPath;
      let worktreePath: string | null = null;
      let branch: string | null = null;
      let baseBranchName: string | null = null;

      if (config.useWorktree) {
        try {
          const slug = slugifyLabel(config.label);
          const branchName = `${getBranchPrefix(config.agent)}${slug}`;
          const info = await worktreeCommands.create(
            state.projectPath,
            branchName,
            config.label,
            config.baseBranch,
          );
          cwd = info.path;
          worktreePath = info.path;
          branch = info.branch;
          baseBranchName = config.baseBranch;
        } catch (err) {
          toast.error("Failed to create worktree", {
            description: String(err),
          });
          return;
        }
      }

      const { command, args, resumeTargetId } = buildSpawnArgs(
        config.agent,
        config.task || undefined,
        id,
      );

      // For Claude sessions, ensure hook config is written before spawning,
      // then inject the current token as an env var.
      let env: Record<string, string> | undefined;
      if (config.agent === "claude-code") {
        try {
          await hookConfigReady.current;
          const token = await hookCommands.getToken();
          env = { SWITCHBOARD_HOOK_TOKEN: token };
        } catch (err) {
          console.warn("Failed to configure Claude hooks:", err);
        }
      }

      const session: Session = {
        id,
        agent: config.agent,
        label: config.label,
        status: "running",
        resumeTargetId,
        ptyId: null,
        worktreePath,
        branch,
        workspace: buildWorkspaceIdentity({
          repoRoot: state.projectPath,
          launchRoot: cwd,
          worktreePath,
          branchName: branch,
          baseBranchName,
        }),
        cwd,
        createdAt: new Date().toISOString(),
        exitCode: null,
        command,
        args,
        env,
      };
      dispatch({ type: "ADD_SESSION", session });
      persistSession(session);
    },
    [dispatch, persistSession, state.projectPath],
  );

  const syncCodexResumeTarget = useCallback(
    async (session: Session) => {
      if (session.agent !== "codex" || session.resumeTargetId) {
        return session.resumeTargetId;
      }

      try {
        const createdAtSecs = Math.floor(
          new Date(session.createdAt).getTime() / 1000,
        );
        const match = await invoke<HistorySessionSummary | null>(
          "find_codex_session",
          {
            cwd: session.cwd,
            createdAtSecs,
            prompt: getCodexInitialPrompt(session),
          },
        );

        if (!match?.session_id) {
          return null;
        }

        dispatch({
          type: "SET_RESUME_TARGET",
          id: session.id,
          resumeTargetId: match.session_id,
        });
        await persistSession({
          ...session,
          resumeTargetId: match.session_id,
        });
        return match.session_id;
      } catch (err) {
        console.warn("Failed to sync Codex resume target:", err);
        return null;
      }
    },
    [dispatch, persistSession],
  );

  const handleResumeSession = useCallback(
    async (session: Session) => {
      const existingSession = state.sessions[session.id];
      if (
        existingSession &&
        (existingSession.status === "running" ||
          existingSession.status === "idle" ||
          existingSession.status === "needs-input")
      ) {
        dispatch({ type: "SET_ACTIVE", id: existingSession.id });
        return;
      }

      const resumeTargetId =
        session.resumeTargetId ?? (await syncCodexResumeTarget(session));
      const resumeConfig = buildResumeArgs(session.agent, resumeTargetId);
      if (!resumeConfig) {
        return;
      }

      // Refresh hook token so resumed sessions use the current Switchboard
      // instance's token, not a stale one from a prior launch.
      let env = session.env;
      if (session.agent === "claude-code") {
        try {
          const token = await hookCommands.getToken();
          env = { ...env, SWITCHBOARD_HOOK_TOKEN: token };
        } catch (err) {
          console.warn("Failed to refresh Claude hook token on resume:", err);
        }
      }

      const nextSession: Session = {
        ...session,
        id: resumeTargetId ?? session.id,
        status: "running",
        resumeTargetId,
        ptyId: null,
        createdAt: new Date().toISOString(),
        exitCode: null,
        command: resumeConfig.command,
        args: resumeConfig.args,
        env,
      };

      if (existingSession) {
        await invoke("delete_session", { id: existingSession.id }).catch(
          (err) =>
            console.warn("Failed to delete ended session before resume:", err),
        );
        dispatch({ type: "REMOVE_SESSION", id: existingSession.id });
      }

      dispatch({ type: "ADD_SESSION", session: nextSession });
      await persistSession(nextSession);
    },
    [dispatch, persistSession, state.sessions, syncCodexResumeTarget],
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const handleSessionBranchChange = useCallback(
    async (sessionId: string, branch: string | null) => {
      const session = state.sessions[sessionId];
      if (!session) return;

      const updatedSession: Session = {
        ...session,
        branch,
        workspace: {
          ...session.workspace,
          branchName: branch,
          headKind: branch ? "branch" : "unknown",
        },
      };

      dispatch({ type: "SET_SESSION_BRANCH", id: sessionId, branch });
      await persistSession(updatedSession);
    },
    [dispatch, persistSession, state.sessions],
  );

  const handleSessionExit = useCallback(
    (sessionId: string) => (code: number | null) => {
      const session = sessionsRef.current[sessionId];
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

      if (session?.agent === "codex") {
        void syncCodexResumeTarget(session);
      }
    },
    [dispatch, syncCodexResumeTarget],
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
        if (session.agent === "codex") {
          void syncCodexResumeTarget(session);
        }
      } catch (err) {
        toast.error("Failed to stop session", {
          description: String(err),
        });
      }
    },
    [dispatch, syncCodexResumeTarget],
  );

  const handleRenameSession = useCallback(
    async (session: Session, label: string) => {
      const localSession = state.sessions[session.id];
      const historySessionId = session.resumeTargetId ?? session.id;
      if (!localSession) {
        try {
          await invoke("rename_session_metadata", {
            sessionId: historySessionId,
            label,
          });
        } catch (err) {
          toast.error("Failed to rename session", {
            description: String(err),
          });
        }
        return;
      }

      const nextLabel = label.trim();
      if (!nextLabel || nextLabel === localSession.label) return;

      const updatedSession: Session = { ...localSession, label: nextLabel };

      try {
        await persistSession(updatedSession);
        dispatch({ type: "RENAME_SESSION", id: session.id, label: nextLabel });
      } catch (err) {
        toast.error("Failed to rename session", {
          description: String(err),
        });
      }
    },
    [dispatch, persistSession, state.sessions],
  );

  const handleDeleteSession = useCallback(
    async (session: Session) => {
      const localSession = state.sessions[session.id];
      const historySessionId = session.resumeTargetId ?? session.id;
      if (!localSession) {
        try {
          await invoke("delete_session_metadata", {
            sessionId: historySessionId,
          });
        } catch (err) {
          toast.error("Failed to delete session", {
            description: String(err),
          });
        }
        return;
      }

      if (localSession.ptyId !== null) {
        await invoke("pty_kill", { id: localSession.ptyId }).catch((err) => {
          console.warn("Failed to kill PTY during session deletion:", err);
        });
      }

      try {
        await invoke("delete_session", { id: localSession.id });
        dispatch({ type: "REMOVE_SESSION", id: localSession.id });
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
      onToggleGitPanel: () => setInspectorOpen((prev) => !prev),
      onToggleFileTree: () => {
        setInspectorOpen(true);
        setWorkspaceTab("files");
      },
      onFocusTerminal: () => {
        const termEl = document.querySelector(".xterm-helper-textarea");
        if (termEl instanceof HTMLElement) termEl.focus();
      },
      onToggleViewMode: () => {
        dispatch({
          type: "SET_VIEW_MODE",
          mode: state.viewMode === "focused" ? "grid" : "focused",
        });
      },
    }),
    [sortedSessionIds, state.activeSessionId, state.viewMode, dispatch],
  );
  useKeyboardShortcuts(shortcutHandlers);
  useClaudeHooks(state.sessions, dispatch);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Custom titlebar */}
      <Titlebar
        sidebarOpen={sidebarOpen}
        inspectorOpen={inspectorOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
        projectPath={state.projectPath}
        onProjectClick={() => setProjectPickerOpen(true)}
        viewMode={state.viewMode}
        updateVersion={availableUpdate?.version ?? null}
        checkingForUpdates={checkingForUpdates}
        installingUpdate={installingUpdate}
        updateProgress={updateProgress}
        onInstallUpdate={() => void installUpdate()}
        onToggleViewMode={() =>
          dispatch({
            type: "SET_VIEW_MODE",
            mode: state.viewMode === "focused" ? "grid" : "focused",
          })
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Settings page (full overlay) */}
      {settingsOpen ? (
        <div className="flex-1 min-h-0">
          <SettingsPage
            onBack={() => setSettingsOpen(false)}
            currentVersion={currentVersion}
            updateVersion={availableUpdate?.version ?? null}
            updateNotes={availableUpdate?.body}
            checkingForUpdates={checkingForUpdates}
            installingUpdate={installingUpdate}
            updateProgress={updateProgress}
            onCheckForUpdates={() => void checkForUpdates()}
            onInstallUpdate={() => void installUpdate()}
          />
        </div>
      ) : (
        /* Main content below titlebar */
        <ResizablePanelGroup
          orientation="horizontal"
          className="flex-1 min-h-0"
        >
          {/* Sidebar */}
          {sidebarOpen && (
            <>
              <ResizablePanel defaultSize="20%" minSize="15%" maxSize="35%">
                <SessionSidebar
                  onNewSession={() => setDialogOpen(true)}
                  onAddProject={() => setProjectPickerOpen(true)}
                  onSelectProject={(path) => {
                    void projectCommands
                      .setPath(path)
                      .then(() => {
                        dispatch({ type: "SET_PROJECT_PATH", path });
                        setViewingSession(null);
                        dispatch({ type: "SET_PREVIEW_FILE", path: null });
                      })
                      .catch((err) => {
                        toast.error("Failed to switch project", {
                          description: String(err),
                        });
                      });
                  }}
                  onViewSession={(session) => {
                    dispatch({ type: "SET_PREVIEW_FILE", path: null });
                    if (state.sessions[session.id]) {
                      dispatch({ type: "SET_ACTIVE", id: session.id });
                    }
                    setViewingSession(session);
                  }}
                  onSelectActiveSession={() => setViewingSession(null)}
                  onResumeSession={handleResumeSession}
                  onStopSession={handleStopSession}
                  onRenameSession={handleRenameSession}
                  onDeleteSession={handleDeleteSession}
                  selectedSessionId={selectedSessionId}
                />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* Main area */}
          <ResizablePanel defaultSize="55%">
            <div className="flex flex-col h-full min-w-0 overflow-hidden">
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
                ) : liveSessions.length === 0 ? (
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
                ) : state.viewMode === "grid" ? (
                  <GridView
                    sessions={liveSessions.filter((s) =>
                      aliveSessionIds.has(s.id),
                    )}
                    activeSessionId={state.activeSessionId}
                    onSessionSelect={(id) => {
                      dispatch({ type: "SET_ACTIVE", id });
                      setViewingSession(null);
                    }}
                    onStopSession={handleStopSession}
                    onSessionSpawn={handleSessionSpawn}
                    onSessionExit={handleSessionExit}
                  />
                ) : (
                  liveSessions.map((session) => {
                    if (!aliveSessionIds.has(session.id)) return null;
                    const isActive = session.id === state.activeSessionId;

                    return (
                      <div
                        key={session.id}
                        className="absolute inset-0 flex flex-col bg-background"
                        style={{ display: isActive ? "flex" : "none" }}
                      >
                        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 text-sm">
                          <AgentIcon agent={session.agent} className="size-4 shrink-0" />
                          <span
                            className="min-w-0 max-w-[40ch] truncate font-semibold"
                            title={session.label}
                          >
                            {session.label}
                          </span>
                          <div className="ml-auto flex shrink-0 items-center gap-2">
                            {session.ptyId !== null &&
                              (session.status === "running" ||
                                session.status === "idle" ||
                                session.status === "needs-input") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() =>
                                    void handleStopSession(session.id)
                                  }
                                >
                                  <Square data-icon="inline-start" />
                                  Stop
                                </Button>
                              )}
                          </div>
                        </div>
                        <div className="flex-1 min-h-0">
                          <XTermContainer
                            command={session.command}
                            args={session.args}
                            cwd={session.cwd}
                            env={session.env}
                            isActive={isActive}
                            onSpawn={(ptyId) =>
                              handleSessionSpawn(session.id, ptyId)
                            }
                            onExit={handleSessionExit(session.id)}
                          />
                        </div>
                      </div>
                    );
                  })
                )}

                {viewingSession && (
                  <div className="absolute inset-0 z-10">
                    <SessionTranscriptView
                      key={`${viewingSession.agent}:${viewingSession.resumeTargetId ?? viewingSession.id}`}
                      session={viewingSession}
                      onClose={() => setViewingSession(null)}
                      onResume={() => {
                        void handleResumeSession(viewingSession);
                        setViewingSession(null);
                      }}
                    />
                  </div>
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

          {/* Workspace inspector (hidden in grid view) */}
          {inspectorOpen && state.projectPath && state.viewMode === "focused" && (
              <>
                <ResizableHandle />
                <ResizablePanel defaultSize="25%" minSize="15%" maxSize="40%">
                  <WorkspacePanel
                    activeTab={workspaceTab}
                    context={workspaceContext}
                    session={selectedSession}
                    githubToken={state.githubToken}
                    onOpenSettings={openSettings}
                    onSessionBranchChange={handleSessionBranchChange}
                    onTabChange={setWorkspaceTab}
                  />
                </ResizablePanel>
              </>
            )}
        </ResizablePanelGroup>
      )}

      {/* New Session Dialog */}
      <NewSessionDialog
        open={dialogOpen}
        projectPath={state.projectPath}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleNewSession}
      />

      {/* Project Picker Dialog */}
      <ProjectPickerDialog
        open={projectPickerOpen}
        onClose={() => setProjectPickerOpen(false)}
        onSelect={async (path) => {
          const [selectedPath, projectPaths] = await Promise.all([
            fileCommands.inspectDirectory(path).then((status) => status.canonical_path ?? path),
            projectCommands.listPaths(),
          ]);
          dispatch({ type: "SET_PROJECT_PATH", path: selectedPath });
          dispatch({ type: "SET_PROJECTS", paths: projectPaths });
        }}
      />
    </div>
  );
}
