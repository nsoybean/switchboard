import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, type Dispatch } from "react";
import type { AppAction, Session, SessionStatus } from "@/state/types";

interface AgentHookEvent {
  session_id: string;
  event_name: string;
  switchboard_session_id?: string | null;
}

const EVENT_TO_STATUS: Record<string, SessionStatus> = {
  Stop: "idle",
  StopFailure: "error",
  PermissionRequest: "needs-input",
  Elicitation: "needs-input",
  Notification: "needs-input",
  UserPromptSubmit: "running",
  SessionStart: "running", // Codex
};

/**
 * Listen for agent hook events (Claude Code + Codex) and dispatch status updates.
 * Accepts sessions + dispatch as params to avoid subscribing to full AppState.
 */
export function useAgentHooks(
  sessions: Record<string, Session>,
  dispatch: Dispatch<AppAction>,
) {
  const sessionsRef = useRef(sessions);

  // Keep ref current to avoid stale closures in the event listener
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    const unlisten = listen<AgentHookEvent>("agent-hook", (event) => {
      const { session_id, event_name, switchboard_session_id } = event.payload;
      const status = EVENT_TO_STATUS[event_name];
      if (!status) return;

      const currentSessions = sessionsRef.current;
      const session =
        (switchboard_session_id
          ? currentSessions[switchboard_session_id]
          : undefined) ??
        Object.values(currentSessions).find(
          (s) => s.resumeTargetId === session_id || s.id === session_id,
        );
      if (!session) return;

      if (
        event_name === "SessionStart" &&
        session.agent === "codex" &&
        session.resumeTargetId !== session_id
      ) {
        dispatch({
          type: "SET_RESUME_TARGET",
          id: session.id,
          resumeTargetId: session_id,
        });
      }

      // Skip if status hasn't changed
      if (session.status === status) return;

      dispatch({ type: "UPDATE_STATUS", id: session.id, status });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [dispatch]);
}
