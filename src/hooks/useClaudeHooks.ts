import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, type Dispatch } from "react";
import type { AppAction, Session, SessionStatus } from "@/state/types";

interface ClaudeHookEvent {
  session_id: string;
  event_name: string;
}

const EVENT_TO_STATUS: Record<string, SessionStatus> = {
  Stop: "idle",
  StopFailure: "error",
  PermissionRequest: "needs-input",
  Elicitation: "needs-input",
  Notification: "needs-input",
  UserPromptSubmit: "running",
};

/**
 * Listen for Claude hook events and dispatch status updates.
 * Accepts sessions + dispatch as params to avoid subscribing to full AppState.
 */
export function useClaudeHooks(
  sessions: Record<string, Session>,
  dispatch: Dispatch<AppAction>,
) {
  const sessionsRef = useRef(sessions);

  // Keep ref current to avoid stale closures in the event listener
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    const unlisten = listen<ClaudeHookEvent>("claude-hook", (event) => {
      const { session_id, event_name } = event.payload;
      const status = EVENT_TO_STATUS[event_name];
      if (!status) return;

      // Find the Switchboard session matching this Claude session_id.
      const currentSessions = sessionsRef.current;
      const session = Object.values(currentSessions).find(
        (s) => s.resumeTargetId === session_id || s.id === session_id,
      );
      if (!session) return;

      // Skip if status hasn't changed
      if (session.status === status) return;

      dispatch({ type: "UPDATE_STATUS", id: session.id, status });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [dispatch]);
}
