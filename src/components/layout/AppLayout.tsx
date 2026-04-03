import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppState, useAppDispatch } from "../../state/context";
import { Titlebar } from "./Titlebar";
import { SessionSidebar } from "../sidebar/SessionSidebar";
import { SessionTranscriptView } from "../terminal/SessionTranscriptView";
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
import { useAgentHooks } from "../../hooks/useClaudeHooks";
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
import { FolderOpen, Plus } from "lucide-react";
import type {
  AgentType,
  Session,
  SessionStatus,
  SessionWorkspaceIdentity,
  SessionWorkspaceKind,
} from "../../state/types";
import { CanvasView, type CanvasViewHandle } from "../canvas/CanvasView";

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
  const canvasViewRef = useRef<CanvasViewHandle>(null);
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
      .then((port) =>
        Promise.all([
          hookCommands.writeConfig(cwd, port),
          hookCommands.writeCodexConfig(cwd, port),
        ]),
      )
      .then(() => {})
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
          status: session.status,
          exit_code: session.exitCode,
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

      // Ensure hook config is written before spawning, then inject env vars.
      let env: Record<string, string> | undefined;
      if (config.agent === "claude-code" || config.agent === "codex") {
        try {
          await hookConfigReady.current;
          const token = await hookCommands.getToken();
          const port = await hookCommands.getPort();
          env = {
            SWITCHBOARD_HOOK_TOKEN: token,
            SWITCHBOARD_HOOK_PORT: String(port),
          };
        } catch (err) {
          console.warn("Failed to configure agent hooks:", err);
        }
      }

      const session: Session = {
        id,
        agent: config.agent,
        label: config.label,
        status: "idle",
        resumeTargetId,
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

      // Refresh hook token/port so resumed sessions use the current Switchboard
      // instance's values, not stale ones from a prior launch.
      let env = session.env;
      if (session.agent === "claude-code" || session.agent === "codex") {
        try {
          const token = await hookCommands.getToken();
          const port = await hookCommands.getPort();
          env = { ...env, SWITCHBOARD_HOOK_TOKEN: token, SWITCHBOARD_HOOK_PORT: String(port) };
        } catch (err) {
          console.warn("Failed to refresh agent hook env on resume:", err);
        }
      }

      const nextSession: Session = {
        ...session,
        id: resumeTargetId ?? session.id,
        status: "idle",
        resumeTargetId,
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

  const handleSelectProject = useCallback(
    async (path: string) => {
      try {
        await projectCommands.setPath(path);
        dispatch({ type: "SET_PROJECT_PATH", path });
        setViewingSession(null);
        dispatch({ type: "SET_PREVIEW_FILE", path: null });
      } catch (err) {
        toast.error("Failed to switch project", {
          description: String(err),
        });
      }
    },
    [dispatch],
  );

  const handleOpenProject = useCallback(async (path: string) => {
    try {
      await projectCommands.openInFinder(path);
    } catch (err) {
      toast.error("Failed to open project", {
        description: String(err),
      });
    }
  }, []);

  const handleRemoveProject = useCallback(
    async (path: string) => {
      try {
        await projectCommands.removePath(path);
        const [nextProjectPath, projectPaths] = await Promise.all([
          projectCommands.getPath(),
          projectCommands.listPaths(),
        ]);

        dispatch({ type: "SET_PROJECTS", paths: projectPaths });
        dispatch({ type: "SET_PROJECT_PATH", path: nextProjectPath });
        dispatch({ type: "SET_PREVIEW_FILE", path: null });

        const nextActiveSessionId = nextProjectPath
          ? Object.values(sessionsRef.current)
              .filter(
                (session) =>
                  sessionBelongsToProject(session, nextProjectPath) &&
                  (session.status === "running" ||
                    session.status === "idle" ||
                    session.status === "needs-input"),
              )
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              )[0]?.id ?? null
          : null;

        dispatch({ type: "SET_ACTIVE", id: nextActiveSessionId });
        setViewingSession((current) => {
          if (!current || sessionBelongsToProject(current, nextProjectPath)) {
            return current;
          }
          return null;
        });
      } catch (err) {
        toast.error("Failed to remove project", {
          description: String(err),
        });
      }
    },
    [dispatch],
  );

  const handleSelectCanvasSession = useCallback(
    (sessionId: string) => {
      dispatch({ type: "SET_ACTIVE", id: sessionId });
      setViewingSession(null);
    },
    [dispatch],
  );

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
      dispatch({
        type: "UPDATE_STATUS",
        id: sessionId,
        status,
        exitCode: code,
      });

      if (session) {
        void persistSession({
          ...session,
          status,
          exitCode: code,
        });
      }

      if (session?.agent === "codex") {
        void syncCodexResumeTarget(session);
      }
    },
    [dispatch, persistSession, syncCodexResumeTarget],
  );

  const handleSessionStart = useCallback(
    (sessionId: string) => {
      const session = sessionsRef.current[sessionId];
      dispatch({ type: "UPDATE_STATUS", id: sessionId, status: "running" });
      if (session) {
        void persistSession({
          ...session,
          status: "running",
        });
      }
    },
    [dispatch, persistSession],
  );

  const handleStopSession = useCallback(
    async (sessionId: string) => {
      const session = sessionsRef.current[sessionId];
      if (!session) return;

      try {
        await invoke("close_terminal", { tileId: sessionId });
        dispatch({
          type: "UPDATE_STATUS",
          id: sessionId,
          status: "stopped",
          exitCode: session.exitCode,
        });
        void persistSession({
          ...session,
          status: "stopped",
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
    [dispatch, persistSession, syncCodexResumeTarget],
  );

  const handleStopCanvasSession = useCallback(
    (sessionId: string) => {
      void handleStopSession(sessionId);
    },
    [handleStopSession],
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

      try {
        if (localSession) {
          await invoke("close_terminal", { tileId: localSession.id }).catch((err) => {
            console.warn("Failed to close terminal during session deletion:", err);
          });
        }

        if (session.agent === "claude-code") {
          await invoke("delete_claude_session", {
            sessionId: historySessionId,
          });
        } else if (session.agent === "codex") {
          const codexSessionId =
            historySessionId || (localSession ? await syncCodexResumeTarget(localSession) : null);
          if (codexSessionId) {
            await invoke("delete_codex_session", {
              sessionId: codexSessionId,
            });
          }
        }

        if (localSession) {
          await invoke("delete_session", { id: localSession.id });
          dispatch({ type: "REMOVE_SESSION", id: localSession.id });
        }

        if (!localSession) {
          await invoke("delete_session_metadata", {
            sessionId: historySessionId,
          }).catch(() => {
            // Ignore missing overlay metadata when the real source deletion succeeded.
          });
        }

        dispatch({ type: "SET_PREVIEW_FILE", path: null });
      } catch (err) {
        toast.error("Failed to delete session", {
          description: String(err),
        });
      }
    },
    [dispatch, state.sessions, syncCodexResumeTarget],
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
      onEscape: () => {
        if (canvasViewRef.current) {
          canvasViewRef.current.unfocusTile();
          return true;
        }
        return false;
      },
    }),
    [sortedSessionIds, state.activeSessionId, dispatch],
  );
  useKeyboardShortcuts(shortcutHandlers);
  useAgentHooks(state.sessions, dispatch);

  return (
    <div className="flex flex-col h-full bg-background">
      <Titlebar
        sidebarOpen={sidebarOpen}
        inspectorOpen={inspectorOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
        projectPath={state.projectPath}
        onProjectClick={() => setProjectPickerOpen(true)}
        updateVersion={availableUpdate?.version ?? null}
        checkingForUpdates={checkingForUpdates}
        installingUpdate={installingUpdate}
        updateProgress={updateProgress}
        onInstallUpdate={() => void installUpdate()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

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
        <div className="relative flex-1 min-h-0 overflow-hidden bg-background">
          {state.projectPath && liveSessions.length > 0 ? (
            <CanvasView
              ref={canvasViewRef}
              projectPath={state.projectPath}
              sessions={liveSessions}
              activeSessionId={state.activeSessionId}
              onSessionStart={handleSessionStart}
              onSessionExit={handleSessionExit}
              onSelectSession={handleSelectCanvasSession}
              onStopSession={handleStopCanvasSession}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-sm text-center">
                <h2 className="mb-3 text-lg font-semibold">Welcome to Switchboard</h2>
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  {state.projectPath
                    ? "Manage multiple AI coding agents on a smooth shared canvas."
                    : "Manage multiple AI coding agents in parallel. Open a project to get started."}
                </p>
                <Button onClick={() => (state.projectPath ? setDialogOpen(true) : setProjectPickerOpen(true))}>
                  {state.projectPath ? (
                    <Plus data-icon="inline-start" />
                  ) : (
                    <FolderOpen data-icon="inline-start" />
                  )}
                  {state.projectPath ? "Start First Session" : "Open Project"}
                </Button>
              </div>
            </div>
          )}

          {sidebarOpen ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-20 p-4 pr-2">
              <div className="pointer-events-auto h-full w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card/95 shadow-2xl backdrop-blur">
                <SessionSidebar
                  onNewSession={() => setDialogOpen(true)}
                  onAddProject={() => setProjectPickerOpen(true)}
                  onSelectProject={handleSelectProject}
                  onOpenProject={handleOpenProject}
                  onRemoveProject={handleRemoveProject}
                  onViewSession={(session) => {
                    dispatch({ type: "SET_PREVIEW_FILE", path: null });
                    if (state.sessions[session.id]) {
                      dispatch({ type: "SET_ACTIVE", id: session.id });
                    }
                    setViewingSession(session);
                  }}
                  onSelectActiveSession={(sessionId) => {
                    setViewingSession(null);
                    if (sessionId) {
                      canvasViewRef.current?.panToSession(sessionId);
                    }
                  }}
                  onResumeSession={handleResumeSession}
                  onStopSession={handleStopSession}
                  onRenameSession={handleRenameSession}
                  onDeleteSession={handleDeleteSession}
                  selectedSessionId={selectedSessionId}
                />
              </div>
            </div>
          ) : null}

          {state.projectPath ? (
            <div
              className={`pointer-events-none absolute inset-y-0 right-0 z-20 p-4 pl-2 transition-[opacity,transform] duration-150 ${
                inspectorOpen
                  ? "translate-x-0 opacity-100"
                  : "translate-x-3 opacity-0"
              }`}
              aria-hidden={!inspectorOpen}
            >
              <div
                className={`h-full w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card/95 shadow-2xl backdrop-blur transition-opacity duration-150 ${
                  inspectorOpen ? "pointer-events-auto" : "pointer-events-none"
                }`}
              >
                <WorkspacePanel
                  activeTab={workspaceTab}
                  context={workspaceContext}
                  visible={inspectorOpen}
                  session={selectedSession}
                  githubToken={state.githubToken}
                  onOpenSettings={openSettings}
                  onSessionBranchChange={handleSessionBranchChange}
                  onTabChange={setWorkspaceTab}
                />
              </div>
            </div>
          ) : null}

          {viewingSession ? (
            <div className="absolute inset-0 z-30">
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
          ) : null}

          {state.previewFilePath ? (
            <div className="absolute inset-0 z-30">
              <FilePreview
                filePath={state.previewFilePath}
                onClose={() => dispatch({ type: "SET_PREVIEW_FILE", path: null })}
              />
            </div>
          ) : null}
        </div>
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
