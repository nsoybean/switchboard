import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
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
  onAutoLabel?: (sessionId: string, label: string) => void,
) {
  const sessionsRef = useRef(sessions);
  const onAutoLabelRef = useRef(onAutoLabel);

  // Keep refs current to avoid stale closures in the event listener
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    onAutoLabelRef.current = onAutoLabel;
  }, [onAutoLabel]);

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

      // Auto-label: on first prompt, replace empty label with the prompt text
      if (
        event_name === "UserPromptSubmit" &&
        session.isAutoLabel &&
        (session.agent === "claude-code" || session.agent === "codex")
      ) {
        const nativeSessionId = session.resumeTargetId ?? session.id;
        // Small delay to let history.jsonl be written
        setTimeout(async () => {
          try {
            const prompt = await invoke<string | null>(
              "get_first_prompt_for_session",
              { sessionId: nativeSessionId },
            );
            if (prompt) {
              const label =
                prompt.length > 80 ? prompt.slice(0, 77) + "…" : prompt;
              onAutoLabelRef.current?.(session.id, label);
            }
          } catch {
            // Auto-label is best-effort; don't disrupt the session
          }
        }, 500);
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
