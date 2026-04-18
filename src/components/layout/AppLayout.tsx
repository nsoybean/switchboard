import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useAppState, useAppDispatch } from "../../state/context";
import { Titlebar } from "./Titlebar";
import { PaneWorkspace } from "./PaneWorkspace";
import { SessionSidebar } from "../sidebar/SessionSidebar";
import { SessionTranscriptView } from "../terminal/SessionTranscriptView";
import { NewSessionDialog } from "../dialogs/NewSessionDialog";
import { ProjectPickerDialog } from "../dialogs/ProjectPickerDialog";
import { SettingsPage } from "../settings/SettingsPage";
import {
  WorkspacePanel,
  type WorkspaceContext,
  type WorkspaceTab,
} from "../workspace/WorkspacePanel";
import { CreateBranchDialog } from "../git/CreateBranchDialog";
import { CreatePrDialog } from "../git/CreatePrDialog";
import { useAppUpdater } from "../../hooks/useAppUpdater";
import { useAgentHooks } from "../../hooks/useClaudeHooks";
import { useGitState } from "../../hooks/useGitState";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { buildResumeArgs, buildSpawnArgs } from "../../lib/agents";
import { getBranchPrefix } from "../../lib/branches";
import {
  fileCommands,
  gitCommands,
  hookCommands,
  projectCommands,
  quitCommands,
  worktreeCommands,
} from "../../lib/tauri-commands";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AgentType,
  Session,
  SessionStatus,
  SessionWorkspaceIdentity,
  SessionWorkspaceKind,
} from "../../state/types";
import {
  CanvasView,
  getCanvasBackgroundStyle,
  type CanvasViewHandle,
} from "../canvas/CanvasView";
import { CommandPalette } from "../palette/CommandPalette";
import { QuitConfirmDialog } from "./QuitConfirmDialog";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 520;
const MIN_INSPECTOR_WIDTH = 200;
const MAX_INSPECTOR_WIDTH = 760;

interface HistorySessionSummary {
  session_id: string;
  display: string;
  timestamp: string;
  project_path: string;
}

function getDurableHistorySessionId(session: Session): string | null {
  if (session.agent === "claude-code") {
    return session.resumeTargetId ?? session.id;
  }

  if (session.agent === "codex") {
    return session.resumeTargetId;
  }

  return null;
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
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createPrOpen, setCreatePrOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workspaceShellMode, setWorkspaceShellMode] = useState<"pane" | "canvas">("pane");
  const [viewingSession, setViewingSession] = useState<Session | null>(null);
  const [openTabSessionIds, setOpenTabSessionIds] = useState<string[]>([]);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const pendingQuitRef = useRef<(() => void) | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("files");
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const sessionsRef = useRef(state.sessions);
  const hookConfigReady = useRef<Promise<void>>(Promise.resolve());
  const canvasViewRef = useRef<CanvasViewHandle>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
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
  const liveSessions = sessions.filter(
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
  const activeSession = activeSessionCandidate ?? null;
  const resolvedViewingSession = viewingSession
    ? (state.sessions[viewingSession.id] ?? viewingSession)
    : null;
  const selectedSession = viewingSession ? resolvedViewingSession : activeSession;
  const selectedSessionId = viewingSession?.id ?? activeSession?.id ?? null;
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


  // Clear active session when it is no longer live (stopped/done/error)
  // so the sidebar highlight and inspector panel disappear.
  useEffect(() => {
    if (
      state.activeSessionId &&
      activeSessionCandidate &&
      activeSessionCandidate.status !== "running" &&
      activeSessionCandidate.status !== "idle" &&
      activeSessionCandidate.status !== "needs-input"
    ) {
      const nextLive = liveSessions[0]?.id ?? null;
      dispatch({ type: "SET_ACTIVE", id: nextLive });
    }
  }, [activeSessionCandidate, dispatch, liveSessions, state.activeSessionId]);

  useEffect(() => {
    sessionsRef.current = state.sessions;
  }, [state.sessions]);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
    },
    [],
  );

  // Intercept window close to show quit confirmation if sessions are live
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    let unlisten: (() => void) | null = null;
    appWindow.onCloseRequested((event) => {
      const liveIds = Object.values(sessionsRef.current).filter(
        (s) => s.status === "running" || s.status === "idle" || s.status === "needs-input",
      );
      if (liveIds.length === 0) {
        void quitCommands.quitWithCleanup([]);
        return;
      }
      event.preventDefault();
      pendingQuitRef.current = () => {
        void quitCommands.quitWithCleanup(liveIds.map((s) => s.id));
      };
      setQuitDialogOpen(true);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

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

    // Only reset to the unresolved candidate when the session or project
    // actually changed — not on every re-render.  Setting the "resolving"
    // candidate unconditionally would briefly make hasWorkspaceRoot false,
    // which unmounts the inspector panel and causes a visible width flicker
    // as the terminal fills the gap then shrinks back.
    setWorkspaceContext((prev) => {
      if (!prev || prev.availability !== "ready") return workspaceCandidate;
      // Same session — keep the already-resolved context while re-resolving
      const prevKey = prev.kind === "session" ? prev.label : "project";
      const nextKey = workspaceCandidate?.kind === "session"
        ? workspaceCandidate.label
        : "project";
      if (prevKey === nextKey) return prev;
      return workspaceCandidate;
    });

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
      isAutoLabel: boolean;
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
          const slug = slugifyLabel(config.label || `session-${Date.now().toString(36)}`);
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
      } else if (config.baseBranch) {
        // Checkout selected branch in the shared working directory.
        // Branch is not persisted on the session — useGitState polls the
        // real HEAD and keeps all local sessions up to date.
        try {
          await gitCommands.checkoutBranch(state.projectPath, config.baseBranch);
        } catch (err) {
          toast.error("Failed to checkout branch", {
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
            SWITCHBOARD_SESSION_ID: id,
          };
        } catch (err) {
          console.warn("Failed to configure agent hooks:", err);
        }
      }

      const session: Session = {
        id,
        agent: config.agent,
        label: config.label,
        isAutoLabel: config.isAutoLabel,
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
      dispatch({ type: "SET_ACTIVE", id: session.id });
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
          env = {
            ...env,
            SWITCHBOARD_HOOK_TOKEN: token,
            SWITCHBOARD_HOOK_PORT: String(port),
            SWITCHBOARD_SESSION_ID: resumeTargetId ?? session.id,
          };
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
        setHistoryOpen(false);
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
        setHistoryOpen(false);
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

  const startPanelResize = useCallback(
    (panel: "sidebar" | "inspector", event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      resizeCleanupRef.current?.();

      const startX = event.clientX;
      const startWidth = panel === "sidebar" ? sidebarWidth : inspectorWidth;

      const updateWidth = (nextWidth: number) => {
        if (panel === "sidebar") {
          setSidebarWidth(
            Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, nextWidth)),
          );
          return;
        }

        setInspectorWidth(
          Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, nextWidth)),
        );
      };

      const previousUserSelect = document.body.style.userSelect;
      const previousCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        updateWidth(panel === "sidebar" ? startWidth + delta : startWidth - delta);
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        resizeCleanupRef.current = null;
      };

      resizeCleanupRef.current = cleanup;
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
    },
    [inspectorWidth, sidebarWidth],
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

      // Auto-clean empty Claude sessions that never produced a conversation.
      if (session?.agent === "claude-code") {
        void invoke<boolean>("claude_session_file_exists", {
          sessionId: session.resumeTargetId ?? sessionId,
        }).then((exists) => {
          if (!exists) {
            void invoke("delete_session", { id: sessionId }).catch(() => {});
            dispatch({ type: "REMOVE_SESSION", id: sessionId });
          }
        }).catch(() => {});
      }

      void invoke("close_terminal", { tileId: sessionId }).catch(() => {
        // Terminal records can already be gone if the session was stopped manually.
      });
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
      const nextLabel = label.trim();
      if (!nextLabel) return;

      const metadataSessionId =
        getDurableHistorySessionId(localSession ?? session) ??
        (localSession?.agent === "codex"
          ? await syncCodexResumeTarget(localSession)
          : null);

      if (!localSession) {
        if (!metadataSessionId) {
          toast.error("Failed to rename session", {
            description: "Could not resolve the durable session id for metadata.",
          });
          return;
        }

        try {
          await invoke("rename_session_metadata", {
            sessionId: metadataSessionId,
            label: nextLabel,
          });
        } catch (err) {
          toast.error("Failed to rename session", {
            description: String(err),
          });
        }
        return;
      }

      if (nextLabel === localSession.label) return;

      const updatedSession: Session = { ...localSession, label: nextLabel };

      try {
        await persistSession(updatedSession);
        dispatch({ type: "RENAME_SESSION", id: session.id, label: nextLabel });
        if (metadataSessionId) {
          await invoke("rename_session_metadata", {
            sessionId: metadataSessionId,
            label: nextLabel,
          });
        }
      } catch (err) {
        toast.error("Failed to rename session", {
          description: String(err),
        });
      }
    },
    [dispatch, persistSession, state.sessions, syncCodexResumeTarget],
  );

  const handleDeleteSession = useCallback(
    async (session: Session) => {
      const localSession = state.sessions[session.id];
      const metadataSessionId =
        getDurableHistorySessionId(localSession ?? session) ??
        (localSession?.agent === "codex"
          ? await syncCodexResumeTarget(localSession)
          : null);

      try {
        if (localSession) {
          await invoke("close_terminal", { tileId: localSession.id }).catch((err) => {
            console.warn("Failed to close terminal during session deletion:", err);
          });
        }

        if (metadataSessionId) {
          if (session.agent === "claude-code") {
            await invoke("delete_claude_session", {
              sessionId: metadataSessionId,
            }).catch(() => {});
          } else if (session.agent === "codex") {
            await invoke("delete_codex_session", {
              sessionId: metadataSessionId,
            }).catch(() => {});
          }
        }

        if (localSession) {
          await invoke("delete_session", { id: localSession.id });
          dispatch({ type: "REMOVE_SESSION", id: localSession.id });
        }

        if (metadataSessionId) {
          await invoke("delete_session_metadata", {
            sessionId: metadataSessionId,
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

  const handleDeleteSessionsBatch = useCallback(
    async (sessions: Session[]) => {
      if (sessions.length === 0) return;

      // Resolve metadata IDs and group by agent type.
      const claudeIds: string[] = [];
      const codexIds: string[] = [];
      const metadataIds: string[] = [];
      const switchboardIds: string[] = [];

      for (const session of sessions) {
        const localSession = state.sessions[session.id];
        const metadataSessionId =
          getDurableHistorySessionId(localSession ?? session) ??
          (localSession?.agent === "codex"
            ? await syncCodexResumeTarget(localSession).catch(() => null)
            : null);

        if (localSession) {
          await invoke("close_terminal", { tileId: localSession.id }).catch(() => {});
          switchboardIds.push(localSession.id);
        }

        if (metadataSessionId) {
          metadataIds.push(metadataSessionId);
          if (session.agent === "claude-code") {
            claudeIds.push(metadataSessionId);
          } else if (session.agent === "codex") {
            codexIds.push(metadataSessionId);
          }
        }
      }

      try {
        // Run agent-side batch deletes in parallel.
        await Promise.all([
          claudeIds.length > 0
            ? invoke("delete_claude_sessions_batch", { sessionIds: claudeIds }).catch(() => {})
            : null,
          codexIds.length > 0
            ? invoke("delete_codex_sessions_batch", { sessionIds: codexIds }).catch(() => {})
            : null,
          switchboardIds.length > 0
            ? invoke("delete_sessions_batch", { ids: switchboardIds })
            : null,
          metadataIds.length > 0
            ? invoke("delete_session_metadata_batch", { sessionIds: metadataIds }).catch(() => {})
            : null,
        ]);

        for (const id of switchboardIds) {
          dispatch({ type: "REMOVE_SESSION", id });
        }
        dispatch({ type: "SET_PREVIEW_FILE", path: null });
      } catch (err) {
        toast.error("Failed to delete sessions", {
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
      onCloseSession: () => {
        // Close file tab first if one is open
        if (openFilePath) {
          setOpenFilePath(null);
          return;
        }

        if (viewingSession) {
          setViewingSession(null);
          return;
        }

        if (
          activeSession &&
          (activeSession.status === "running" ||
            activeSession.status === "idle" ||
            activeSession.status === "needs-input")
        ) {
          void handleStopSession(activeSession.id);
        }
      },
      onToggleSidebar: () => setSidebarOpen((prev) => !prev),
      onToggleGitPanel: () => setInspectorOpen((prev) => !prev),
      onToggleFileTree: () => {
        setInspectorOpen(true);
        setWorkspaceTab("files");
      },
      onOpenHistory: () => setHistoryOpen(true),
      onCommandPalette: () => setCommandPaletteOpen(true),
      onFocusTerminal: () => {
        const termEl = document.querySelector(".xterm-helper-textarea");
        if (termEl instanceof HTMLElement) termEl.focus();
      },
      onEscape: () => {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return true;
        }
        if (canvasViewRef.current) {
          canvasViewRef.current.unfocusTile();
          return true;
        }
        return false;
      },
    }),
    [
      activeSession,
      commandPaletteOpen,
      dispatch,
      handleStopSession,
      sortedSessionIds,
      state.activeSessionId,
      viewingSession,
    ],
  );
  useKeyboardShortcuts(shortcutHandlers);

  const handleAutoLabel = useCallback(
    async (sessionId: string, label: string) => {
      const session = state.sessions[sessionId];
      if (!session || !session.isAutoLabel) return;

      const updated: Session = { ...session, label, isAutoLabel: false };
      dispatch({ type: "RENAME_SESSION", id: sessionId, label });
      await persistSession(updated);
    },
    [dispatch, persistSession, state.sessions],
  );

  useAgentHooks(state.sessions, dispatch, handleAutoLabel);

  const hasWorkspaceRoot = workspaceContext?.availability === "ready" && !!workspaceContext.rootPath;
  const createBranchPrefix = workspaceContext?.kind === "session" && selectedSession?.agent
    ? getBranchPrefix(selectedSession.agent)
    : undefined;
  const git = useGitState({
    cwd: hasWorkspaceRoot ? workspaceContext!.rootPath! : "",
    visible: hasWorkspaceRoot && inspectorOpen,
    sessionId: workspaceContext?.kind === "session" ? selectedSession?.id : null,
    onSessionBranchChange: handleSessionBranchChange,
  });

  const sidebarContent = (
    <SessionSidebar
      onNewSession={() => setDialogOpen(true)}
      onAddProject={() => setProjectPickerOpen(true)}
      onSelectProject={handleSelectProject}
      onOpenProject={handleOpenProject}
      onRemoveProject={handleRemoveProject}
      onViewSession={async (session) => {
        dispatch({ type: "SET_PREVIEW_FILE", path: null });
        if (state.sessions[session.id]) {
          dispatch({ type: "SET_ACTIVE", id: session.id });
        }

        if (session.agent === "codex" && !session.resumeTargetId) {
          const resumeTargetId = await syncCodexResumeTarget(session);
          setViewingSession(
            resumeTargetId
              ? {
                  ...session,
                  resumeTargetId,
                }
              : session,
          );
          return;
        }

        setViewingSession(session);
      }}
      onSelectActiveSession={(sessionId) => {
        setViewingSession(null);
        if (sessionId && workspaceShellMode === "canvas") {
          canvasViewRef.current?.panToSession(sessionId);
        }
      }}
      onResumeSession={handleResumeSession}
      onStopSession={handleStopSession}
      onRenameSession={handleRenameSession}
      onDeleteSession={handleDeleteSession}
      onDeleteSessionsBatch={handleDeleteSessionsBatch}
      selectedSessionId={selectedSessionId}
      historyOpen={historyOpen}
      onHistoryOpenChange={setHistoryOpen}
      openTabSessionIds={openTabSessionIds}
    />
  );

  const inspectorContent = state.projectPath ? (
    <WorkspacePanel
      activeTab={workspaceTab}
      context={workspaceContext}
      git={git}
      githubToken={state.githubToken}
      onFileSelect={setOpenFilePath}
      onTabChange={setWorkspaceTab}
    />
  ) : null;

  const welcomeShell = (
    <div
      className={cn(
        "h-full",
        workspaceShellMode === "canvas" ? "sb-canvas" : "flex items-center justify-center bg-background",
      )}
      style={
        workspaceShellMode === "canvas"
          ? getCanvasBackgroundStyle({ panX: 0, panY: 0, zoom: 1 })
          : undefined
      }
    >
      <div
        className={cn(
          "flex h-full items-center justify-center",
          workspaceShellMode === "canvas" ? "relative z-[1]" : "",
        )}
      >
        <div className="max-w-sm text-center">
          <h2 className="mb-3 text-lg font-semibold">Welcome to Switchboard</h2>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            {state.projectPath
              ? workspaceShellMode === "canvas"
                ? "Manage multiple AI coding agents on a smooth shared canvas."
                : "Manage multiple AI coding agents in a structured pane workspace."
              : "Manage multiple AI coding agents in parallel. Open a project to get started."}
          </p>
          <Button onClick={() => (state.projectPath ? setDialogOpen(true) : setProjectPickerOpen(true))}>
            {state.projectPath ? null : <FolderOpen data-icon="inline-start" />}
            {state.projectPath ? "Start First Session" : "Open Project"}
            {state.projectPath ? (
              <kbd className="ml-1 inline-flex items-center rounded border border-primary-foreground/20 px-1.5 py-0.5 font-mono text-[10px] leading-none opacity-80">
                ⌘ N
              </kbd>
            ) : null}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <Titlebar
        sidebarOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
        inspectorOpen={inspectorOpen}
        workspaceShellMode={workspaceShellMode}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleInspector={() => setInspectorOpen(!inspectorOpen)}
        onWorkspaceShellModeChange={setWorkspaceShellMode}
        projectPath={state.projectPath}
        hasActiveSession={liveSessions.length > 0}
        git={hasWorkspaceRoot ? git : undefined}
        githubToken={state.githubToken}
        cwd={workspaceContext?.rootPath}
        onCreateBranch={() => setCreateBranchOpen(true)}
        onCreatePr={() => setCreatePrOpen(true)}
        updateVersion={availableUpdate?.version ?? null}
        checkingForUpdates={checkingForUpdates}
        installingUpdate={installingUpdate}
        updateProgress={updateProgress}
        onInstallUpdate={() => void installUpdate()}
        onOpenSettings={openSettings}
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
        workspaceShellMode === "pane" ? (
          <div className="flex flex-1 min-h-0 overflow-hidden bg-background">
            {sidebarOpen ? (
              <>
                <div
                  className="h-full shrink-0 overflow-hidden border-r bg-card"
                  style={{ width: sidebarWidth }}
                >
                  {sidebarContent}
                </div>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize session sidebar"
                  className="w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 relative"
                  onPointerDown={(event) => startPanelResize("sidebar", event)}
                />
              </>
            ) : null}

            <div className="min-w-0 flex-1 overflow-hidden">
              {state.projectPath ? (
                <PaneWorkspace
                  activeSession={activeSession}
                  liveSessions={liveSessions}
                  transcriptSession={resolvedViewingSession}
                  openFilePath={openFilePath}
                  projectPath={state.projectPath}
                  onInlineNewSession={handleNewSession}
                  onSelectLiveSession={(sessionId) =>
                    dispatch({ type: "SET_ACTIVE", id: sessionId })
                  }
                  onCloseSession={(sessionId) => void handleStopSession(sessionId)}
                  onCloseTranscript={() => setViewingSession(null)}
                  onCloseFile={(filePath) =>
                    setOpenFilePath((current) => (current === filePath ? null : current))
                  }
                  onResumeTranscript={
                    resolvedViewingSession
                      ? () => {
                          void handleResumeSession(resolvedViewingSession);
                          setViewingSession(null);
                        }
                      : undefined
                  }
                  onSessionStart={handleSessionStart}
                  onSessionExit={handleSessionExit}
                  onOpenTabIdsChange={setOpenTabSessionIds}
                />
              ) : (
                welcomeShell
              )}
            </div>

            {state.projectPath && inspectorOpen && selectedSession ? (
              <>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize inspector panel"
                  className="w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 relative"
                  onPointerDown={(event) => startPanelResize("inspector", event)}
                />
                <div
                  className="h-full shrink-0 overflow-hidden border-l bg-card"
                  style={{ width: inspectorWidth }}
                >
                  {hasWorkspaceRoot ? inspectorContent : null}
                </div>
              </>
            ) : null}
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
              welcomeShell
            )}

            {sidebarOpen ? (
              <div className="pointer-events-none absolute inset-y-0 left-0 z-20 flex max-w-[calc(100vw-2rem)]">
                <div
                  className="pointer-events-auto h-full shrink-0 overflow-hidden border-r bg-card"
                  style={{ width: sidebarWidth }}
                >
                  {sidebarContent}
                </div>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize session sidebar"
                  className="pointer-events-auto relative w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2"
                  onPointerDown={(event) => startPanelResize("sidebar", event)}
                />
              </div>
            ) : null}

            {state.projectPath && inspectorOpen && selectedSession && hasWorkspaceRoot ? (
              <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex max-w-[calc(100vw-2rem)]">
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize inspector panel"
                  className="pointer-events-auto relative w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2"
                  onPointerDown={(event) => startPanelResize("inspector", event)}
                />
                <div
                  className="pointer-events-auto h-full shrink-0 overflow-hidden border-l bg-card"
                  style={{ width: inspectorWidth }}
                >
                  {inspectorContent}
                </div>
              </div>
            ) : null}

            {resolvedViewingSession ? (
              <div className="absolute inset-0 z-30">
                <SessionTranscriptView
                  key={`${resolvedViewingSession.agent}:${resolvedViewingSession.resumeTargetId ?? resolvedViewingSession.id}`}
                  session={resolvedViewingSession}
                  onClose={() => setViewingSession(null)}
                  onResume={() => {
                    void handleResumeSession(resolvedViewingSession);
                    setViewingSession(null);
                  }}
                />
              </div>
            ) : null}
          </div>
        )
      )}

      {/* New Session Dialog */}
      <NewSessionDialog
        open={dialogOpen}
        projectPath={state.projectPath}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleNewSession}
      />

      {/* Create Branch Dialog */}
      {hasWorkspaceRoot ? (
        <CreateBranchDialog
          open={createBranchOpen}
          onOpenChange={setCreateBranchOpen}
          defaultBranchPrefix={createBranchPrefix}
          pending={git.branchActionPending}
          onCreate={async (branchName) => {
            await git.createBranch(branchName);
            setCreateBranchOpen(false);
          }}
        />
      ) : null}

      {/* Create PR Dialog */}
      {state.githubToken && workspaceContext?.rootPath && (
        <CreatePrDialog
          open={createPrOpen}
          onClose={() => setCreatePrOpen(false)}
          cwd={workspaceContext.rootPath}
          githubToken={state.githubToken}
        />
      )}

      {/* Quit confirmation dialog */}
      <QuitConfirmDialog
        open={quitDialogOpen}
        liveSessions={liveSessions}
        onConfirm={() => {
          setQuitDialogOpen(false);
          pendingQuitRef.current?.();
          pendingQuitRef.current = null;
        }}
        onCancel={() => {
          setQuitDialogOpen(false);
          pendingQuitRef.current = null;
        }}
      />

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectSession={(session) => {
          dispatch({ type: "SET_ACTIVE", id: session.id });
          setViewingSession(null);
        }}
        onNewSessionInProject={(projectPath) => {
          dispatch({ type: "SET_PROJECT_PATH", path: projectPath });
          setDialogOpen(true);
        }}
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
