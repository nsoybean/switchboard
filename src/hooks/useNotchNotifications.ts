import { useEffect, useRef } from "react";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { useAppState } from "@/state/context";
import { useWindowFocus } from "./useWindowFocus";
import { settingsCommands, type NotificationPrefs } from "@/lib/tauri-commands";
import type { SessionStatus } from "@/state/types";

const DEFAULT_PREFS: NotificationPrefs = {
  native_enabled: true,
  notch_enabled: true,
  sound_enabled: false,
  statuses: {
    idle: true,
    done: true,
    error: true,
    needs_input: true,
    stopped: true,
  },
};

/** Statuses that mean "user attention needed" */
const ATTENTION_STATUSES: Set<SessionStatus> = new Set(["idle", "needs-input"]);

function isStatusEnabled(
  status: SessionStatus,
  prefs: NotificationPrefs,
): boolean {
  switch (status) {
    case "idle":
      return prefs.statuses.idle;
    case "done":
      return prefs.statuses.done;
    case "error":
      return prefs.statuses.error;
    case "stopped":
      return prefs.statuses.stopped;
    case "needs-input":
      return prefs.statuses.needs_input;
    default:
      return false;
  }
}

/**
 * Bounce the dock icon when any session needs attention and the window is not focused.
 *
 * Strategy: instead of tracking transitions, simply check on every render whether
 * any sessions are in attention-needing states. If the window is unfocused and
 * there are attention sessions, bounce. When the window regains focus, clear.
 */
export function useDockAttention() {
  const state = useAppState();
  const windowFocused = useWindowFocus();
  const prefsRef = useRef<NotificationPrefs>(DEFAULT_PREFS);

  // Load + poll notification preferences
  useEffect(() => {
    const load = () =>
      settingsCommands
        .getNotificationPrefs()
        .then((prefs) => {
          prefsRef.current = prefs;
        })
        .catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();

    if (windowFocused) {
      // User is back — clear bounce and badge
      win.requestUserAttention(null).catch(() => {});
      win.setBadgeCount().catch(() => {});
      return;
    }

    // Window is unfocused — check if any sessions need attention
    const prefs = prefsRef.current;
    const attentionCount = Object.values(state.sessions).filter(
      (s) =>
        ATTENTION_STATUSES.has(s.status) && isStatusEnabled(s.status, prefs),
    ).length;

    if (attentionCount > 0) {
      win.requestUserAttention(UserAttentionType.Critical).catch(() => {});
      win.setBadgeCount(attentionCount).catch(() => {});
    }
  }, [state.sessions, windowFocused]);
}
