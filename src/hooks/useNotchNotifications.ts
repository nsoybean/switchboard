import { useCallback, useEffect, useRef, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useAppState, useAppDispatch } from "@/state/context";
import { useWindowFocus } from "./useWindowFocus";
import { settingsCommands, type NotificationPrefs } from "@/lib/tauri-commands";
import type { NotchNotificationItem } from "@/components/layout/NotchNotification";
import type { SessionStatus } from "@/state/types";

let notifCounter = 0;

const DEFAULT_PREFS: NotificationPrefs = {
  native_enabled: true,
  notch_enabled: true,
  sound_enabled: false,
  statuses: {
    done: true,
    error: true,
    needs_input: true,
    stopped: true,
  },
};

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

function isStatusEnabled(
  status: SessionStatus,
  prefs: NotificationPrefs,
): boolean {
  switch (status) {
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
  // Notification preferences
  const prefsRef = useRef<NotificationPrefs>(DEFAULT_PREFS);

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

  // Load notification preferences
  useEffect(() => {
    settingsCommands
      .getNotificationPrefs()
      .then((prefs) => {
        prefsRef.current = prefs;
      })
      .catch(() => {});
  }, []);

  // Reload prefs periodically (picks up settings changes without restart)
  useEffect(() => {
    const interval = setInterval(() => {
      settingsCommands
        .getNotificationPrefs()
        .then((prefs) => {
          prefsRef.current = prefs;
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Watch for session status transitions
  // Notifications only fire when app is NOT focused
  useEffect(() => {
    const prev = prevStatusRef.current;
    const next: Record<string, SessionStatus> = {};
    const prefs = prefsRef.current;

    for (const session of Object.values(state.sessions)) {
      next[session.id] = session.status;
      const oldStatus = prev[session.id];

      // Only fire on a *transition* to a notifiable status
      if (oldStatus === session.status) continue;
      if (!isStatusEnabled(session.status, prefs)) continue;

      // Don't notify for sessions that just appeared (initial load)
      if (oldStatus === undefined) continue;

      // Only notify when app is NOT focused
      if (windowFocused) continue;

      // Notch notification
      if (prefs.notch_enabled) {
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

      // Native OS notification
      if (prefs.native_enabled && nativePermRef.current) {
        sendNotification({
          title: statusToNativeTitle(session.status),
          body: session.label,
        });
      }

      // Sound notification
      if (prefs.sound_enabled) {
        try {
          const audio = new Audio("/notification.mp3");
          audio.volume = 0.5;
          audio.play().catch(() => {});
        } catch {
          // Audio playback not available
        }
      }
    }

    prevStatusRef.current = next;
  }, [state.sessions, windowFocused]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((n) => n.filter((item) => item.id !== id));
  }, []);

  const handleNotificationClick = useCallback(
    (sessionId: string) => {
      // Dismiss all notifications for this session
      setNotifications((n) => n.filter((item) => item.sessionId !== sessionId));
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
