import type { Session, SessionStatus } from "@/state/types";

export type SessionRailBucket = "active" | "ready-for-review" | "history";

export type AgentState = "running" | "idle" | "needs-input" | "finished" | "failed";

export function getAgentState(status: SessionStatus): AgentState {
  switch (status) {
    case "running":
      return "running";
    case "idle":
      return "idle";
    case "needs-input":
      return "needs-input";
    case "done":
    case "stopped":
      return "finished";
    case "error":
      return "failed";
    default:
      return "finished";
  }
}

export function getSessionRailBucket(status: SessionStatus): SessionRailBucket {
  switch (status) {
    case "running":
      return "active";
    case "idle":
    case "needs-input":
      return "ready-for-review";
    case "done":
    case "error":
    case "stopped":
      return "history";
    default:
      return "history";
  }
}

export function getSessionStatusLabel(status: SessionStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "idle":
      return "Idle";
    case "needs-input":
      return "Needs input";
    case "done":
    case "stopped":
      return "Finished";
    case "error":
      return "Failed";
    default:
      return status;
  }
}

export function getSessionAttentionHint(session: Session): string | null {
  switch (session.status) {
    case "running":
      return "Working";
    case "idle":
      return "Turn complete";
    case "needs-input":
      return "Question waiting";
    case "error":
      return "Needs recovery";
    default:
      return null;
  }
}
