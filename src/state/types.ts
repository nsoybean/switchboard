export type AgentType = "claude-code" | "codex" | "bash";

export type SessionStatus = "running" | "needs-input" | "done" | "error";

export interface Session {
  id: string;
  agent: AgentType;
  label: string;
  status: SessionStatus;
  ptyId: number | null;
  worktreePath: string | null;
  branch: string | null;
  cwd: string;
  createdAt: string;
  exitCode: number | null;
}

export interface AppState {
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  gitPanelOpen: boolean;
}

export type AppAction =
  | { type: "ADD_SESSION"; session: Session }
  | { type: "REMOVE_SESSION"; id: string }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "UPDATE_STATUS"; id: string; status: SessionStatus; exitCode?: number | null }
  | { type: "SET_PTY_ID"; id: string; ptyId: number }
  | { type: "TOGGLE_GIT_PANEL" };
