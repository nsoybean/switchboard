import type { Session, SessionStatus } from "@/state/types";

export type SessionRailBucket = "active" | "ready-for-review" | "history";

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
    case "needs-input":
      return "Ready for review";
    case "done":
      return "Done";
    case "error":
      return "Error";
    case "stopped":
      return "Stopped";
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
