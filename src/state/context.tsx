import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { appReducer, initialState } from "./reducer";
import type {
  AppState,
  AppAction,
  AgentType,
  Session,
  SessionHeadKind,
  SessionStatus,
  SessionWorkspaceKind,
} from "./types";
import {
  projectCommands,
  sessionCommands,
  settingsCommands,
  type PersistedSession,
} from "@/lib/tauri-commands";

const AppStateContext = createContext<AppState>(initialState);
const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});

function isAgentType(value: string): value is AgentType {
  return value === "claude-code" || value === "codex" || value === "bash";
}

function toWorkspaceKind(
  value: string | null | undefined,
  worktreePath: string | null,
): SessionWorkspaceKind {
  if (
    value === "project" ||
    value === "switchboard-worktree" ||
    value === "external-worktree"
  ) {
    return value;
  }

  return worktreePath ? "external-worktree" : "project";
}

function toHeadKind(
  value: string | null | undefined,
  branch: string | null,
): SessionHeadKind {
  if (value === "branch" || value === "detached" || value === "unknown") {
    return value;
  }

  return branch ? "branch" : "unknown";
}

function toHydratedStatus(value: string | null | undefined): SessionStatus {
  if (value === "done" || value === "error" || value === "stopped") {
    return value;
  }

  if (value === "running" || value === "idle" || value === "needs-input") {
    return "stopped";
  }

  return "done";
}

function hydratePersistedSession(session: PersistedSession): Session | null {
  if (!isAgentType(session.agent)) {
    return null;
  }

  const repoRoot = session.repo_root ?? null;
  const launchRoot = session.launch_root ?? session.cwd;
  const worktreePath = session.worktree_path ?? null;
  const branch = session.branch ?? null;

  return {
    id: session.id,
    agent: session.agent,
    label: session.label,
    status: toHydratedStatus(session.status),
    resumeTargetId: session.resume_target_id ?? null,
    worktreePath,
    branch,
    workspace: {
      repoRoot,
      launchRoot,
      displayPath: session.display_path ?? launchRoot,
      worktreePath,
      workspaceKind: toWorkspaceKind(session.workspace_kind, worktreePath),
      branchName: branch,
      baseBranchName: session.base_branch ?? null,
      headKind: toHeadKind(session.head_kind, branch),
    },
    cwd: session.cwd,
    createdAt: session.created_at,
    exitCode: session.exit_code ?? null,
    command: session.command,
    args: session.args,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    sessionCommands
      .load()
      .then((sessions) => {
        const hydrated = Object.fromEntries(
          sessions
            .map((session) => hydratePersistedSession(session))
            .filter((session): session is Session => session !== null)
            .map((session) => [session.id, session]),
        );

        dispatch({
          type: "HYDRATE_SESSIONS",
          sessions: hydrated,
          activeSessionId: null,
        });
      })
      .catch((err) => {
        console.error("Failed to load persisted sessions:", err);
        dispatch({ type: "HYDRATE_SESSIONS", sessions: {}, activeSessionId: null });
      });

    projectCommands
      .getPath()
      .then((path) => {
        dispatch({ type: "SET_PROJECT_PATH", path });
      })
      .catch((err) => {
        console.error("Failed to load project path:", err);
      });

    projectCommands
      .listPaths()
      .then((paths) => {
        dispatch({ type: "SET_PROJECTS", paths });
      })
      .catch((err) => {
        console.error("Failed to load project paths:", err);
      });

    settingsCommands
      .getGitHubToken()
      .then((token) => {
        dispatch({ type: "SET_GITHUB_TOKEN", token });
      })
      .catch((err) => {
        console.error("Failed to load GitHub token:", err);
      });
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}

export function useAppDispatch() {
  return useContext(AppDispatchContext);
}
