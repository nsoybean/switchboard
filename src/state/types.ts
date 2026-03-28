export type AgentType = "claude-code" | "codex" | "bash";
export type SessionWorkspaceKind =
  | "project"
  | "switchboard-worktree"
  | "external-worktree";
export type SessionHeadKind = "branch" | "detached" | "unknown";

export interface SessionWorkspaceIdentity {
  repoRoot: string | null;
  launchRoot: string;
  displayPath: string;
  worktreePath: string | null;
  workspaceKind: SessionWorkspaceKind;
  branchName: string | null;
  baseBranchName: string | null;
  headKind: SessionHeadKind;
}

export type SessionStatus =
  | "running"
  | "idle"
  | "needs-input"
  | "done"
  | "error"
  | "stopped";

export interface Session {
  id: string;
  agent: AgentType;
  label: string;
  status: SessionStatus;
  resumeTargetId: string | null;
  ptyId: number | null;
  worktreePath: string | null;
  branch: string | null;
  workspace: SessionWorkspaceIdentity;
  cwd: string;
  createdAt: string;
  exitCode: number | null;
  /** CLI command to spawn (e.g., "claude", "codex", "/bin/bash") */
  command: string;
  /** CLI arguments */
  args: string[];
  /** Transient env vars for PTY spawn (not persisted) */
  env?: Record<string, string>;
}

export interface AppState {
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  gitPanelOpen: boolean;
  projectPath: string | null;
  projects: string[];
  viewMode: "focused" | "scroll";
  previewFilePath: string | null;
  githubToken: string | null;
}

export type AppAction =
  | { type: "ADD_SESSION"; session: Session }
  | { type: "REMOVE_SESSION"; id: string }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "RENAME_SESSION"; id: string; label: string }
  | {
      type: "UPDATE_STATUS";
      id: string;
      status: SessionStatus;
      exitCode?: number | null;
    }
  | { type: "SET_SESSION_BRANCH"; id: string; branch: string | null }
  | { type: "SET_PTY_ID"; id: string; ptyId: number | null }
  | { type: "SET_RESUME_TARGET"; id: string; resumeTargetId: string | null }
  | { type: "TOGGLE_GIT_PANEL" }
  | { type: "SET_PROJECT_PATH"; path: string | null }
  | { type: "SET_PROJECTS"; paths: string[] }
  | { type: "SET_VIEW_MODE"; mode: "focused" | "scroll" }
  | { type: "SET_PREVIEW_FILE"; path: string | null }
  | { type: "SET_GITHUB_TOKEN"; token: string | null };
