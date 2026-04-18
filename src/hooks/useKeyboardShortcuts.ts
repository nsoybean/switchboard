import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// ---------------------------------------------------------------------------
// Zoom (Cmd+= / Cmd+- / Cmd+0)
// ---------------------------------------------------------------------------
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STORAGE_KEY = "switchboard-zoom-level";

function getStoredZoom(): number {
  const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
  if (raw == null) return 1.0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n)) : 1.0;
}

let currentZoom = getStoredZoom();

function applyZoom(level: number) {
  currentZoom = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level)) * 100) / 100;
  localStorage.setItem(ZOOM_STORAGE_KEY, String(currentZoom));
  getCurrentWebviewWindow().setZoom(currentZoom).catch(() => {});
}

/** Restore persisted zoom level on app startup. */
export function initZoom() {
  if (currentZoom !== 1.0) {
    getCurrentWebviewWindow().setZoom(currentZoom).catch(() => {});
  }
}

interface ShortcutHandlers {
  onSwitchSession: (index: number) => void;
  onNextSession: () => void;
  onPrevSession: () => void;
  onNewSession: () => void;
  onCloseSession?: () => void;
  onToggleSidebar: () => void;
  onToggleGitPanel: () => void;
  onFocusTerminal: () => void;
  onToggleFileTree?: () => void;
  onOpenHistory?: () => void;
  /** Called on Escape. Return true if handled (suppresses default onFocusTerminal). */
  onEscape?: () => boolean;
  onCommandPalette?: () => void;
}

/**
 * Global keyboard shortcut handler.
 *
 * Shortcuts:
 * - Ctrl+1..9: Switch to session N
 * - Ctrl+Tab: Next session
 * - Ctrl+Shift+Tab: Previous session
 * - Ctrl+N: New session dialog
 * - Ctrl+W: Close transcript view or stop the active live session
 * - Ctrl+B: Toggle sidebar
 * - Ctrl+G: Toggle workspace inspector
 * - Ctrl+E: Open inspector on Files tab
 * - Ctrl+Shift+H: Open history
 * - Escape: Focus terminal
 * - Ctrl+=: Zoom in
 * - Ctrl+-: Zoom out
 * - Ctrl+0: Reset zoom
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+1..9 — switch sessions
      if ((e.ctrlKey || e.metaKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        handlers.onSwitchSession(parseInt(e.key) - 1);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle sessions
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          handlers.onPrevSession();
        } else {
          handlers.onNextSession();
        }
        return;
      }

      // Ctrl+N — new session
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handlers.onNewSession();
        return;
      }

      // Ctrl+W — close transcript view or stop the active session
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        handlers.onCloseSession?.();
        return;
      }

      // Ctrl+B — toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        handlers.onToggleSidebar();
        return;
      }

      // Ctrl+G — toggle workspace inspector
      if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault();
        handlers.onToggleGitPanel();
        return;
      }

      // Ctrl+E — open Files tab in the inspector
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        handlers.onToggleFileTree?.();
        return;
      }

      // Ctrl+Shift+H — open history
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        handlers.onOpenHistory?.();
        return;
      }

      // Cmd+P / Cmd+Shift+P — command palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlers.onCommandPalette?.();
        return;
      }

      // Cmd/Ctrl + = — zoom in
      if ((e.ctrlKey || e.metaKey) && e.key === "=") {
        e.preventDefault();
        applyZoom(currentZoom + ZOOM_STEP);
        return;
      }

      // Cmd/Ctrl + - — zoom out
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        applyZoom(currentZoom - ZOOM_STEP);
        return;
      }

      // Cmd/Ctrl + 0 — reset zoom
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        applyZoom(1.0);
        return;
      }

      // Escape — custom handler first, then focus terminal
      if (e.key === "Escape") {
        if (handlers.onEscape?.()) return;
        handlers.onFocusTerminal();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handlers]);
}
