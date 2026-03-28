import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useAppState, useAppDispatch } from "@/state/context";
import { useWindowFocus } from "./useWindowFocus";
import type { NotchNotificationItem } from "@/components/layout/NotchNotification";
import type { SessionStatus } from "@/state/types";

let notifCounter = 0;

const NOTIFIABLE_STATUSES: SessionStatus[] = [
  "done",
  "error",
  "stopped",
  "needs-input",
];

function statusToNativeTitle(status: SessionStatus): string {
  switch (status) {
    case "done":
      return "Session Finished";
    case "error":
      return "Session Error";
    case "stopped":
      return "Session Stopped";
    case "needs-input":
      return "Session Needs Input";
    default:
      return "Session Update";
  }
}

export function useNotchNotifications() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const windowFocused = useWindowFocus();

  const [notifications, setNotifications] = useState<NotchNotificationItem[]>(
    [],
  );

  // Track the previous status of each session so we only fire on *transitions*
  const prevStatusRef = useRef<Record<string, SessionStatus>>({});
  // Track whether native notification permission has been acquired
  const nativePermRef = useRef<boolean | null>(null);

  // Request notification permission once on mount
  useEffect(() => {
    (async () => {
      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === "granted";
      }
      nativePermRef.current = granted;
    })();
  }, []);

  // Watch for session status transitions
  useEffect(() => {
    const prev = prevStatusRef.current;
    const next: Record<string, SessionStatus> = {};

    for (const session of Object.values(state.sessions)) {
      next[session.id] = session.status;
      const oldStatus = prev[session.id];

      // Only fire on a *transition* to a notifiable status
      if (oldStatus === session.status) continue;
      if (!NOTIFIABLE_STATUSES.includes(session.status)) continue;

      // Don't notify for sessions that just appeared (initial load)
      if (oldStatus === undefined) continue;

      const isBackground = session.id !== state.activeSessionId;
      const shouldNotchNotify = isBackground || !windowFocused;

      if (shouldNotchNotify) {
        const id = `notch-${++notifCounter}`;
        setNotifications((n) => [
          ...n,
          {
            id,
            sessionId: session.id,
            label: session.label,
            status: session.status,
          },
        ]);
      }

      // Send native OS notification when the window is not focused
      if (!windowFocused && nativePermRef.current) {
        sendNotification({
          title: statusToNativeTitle(session.status),
          body: session.label,
        });
      }
    }

    prevStatusRef.current = next;
  }, [state.sessions, state.activeSessionId, windowFocused]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((n) => n.filter((item) => item.id !== id));
  }, []);

  const handleNotificationClick = useCallback(
    (sessionId: string) => {
      dispatch({ type: "SET_ACTIVE", id: sessionId });
    },
    [dispatch],
  );

  return {
    notifications,
    dismissNotification,
    handleNotificationClick,
  };
}
