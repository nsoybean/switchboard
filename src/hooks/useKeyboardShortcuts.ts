import { useEffect } from "react";

interface ShortcutHandlers {
  onSwitchSession: (index: number) => void;
  onNextSession: () => void;
  onPrevSession: () => void;
  onNewSession: () => void;
  onToggleSidebar: () => void;
  onToggleGitPanel: () => void;
  onFocusTerminal: () => void;
  onToggleFileTree?: () => void;
  onToggleViewMode?: () => void;
}

/**
 * Global keyboard shortcut handler.
 *
 * Shortcuts:
 * - Ctrl+1..9: Switch to session N
 * - Ctrl+Tab: Next session
 * - Ctrl+Shift+Tab: Previous session
 * - Ctrl+N: New session dialog
 * - Ctrl+B: Toggle sidebar
 * - Ctrl+G: Toggle workspace inspector
 * - Ctrl+E: Open inspector on Files tab
 * - Escape: Focus terminal
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

      // Ctrl+Shift+S — toggle view mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
        e.preventDefault();
        handlers.onToggleViewMode?.();
        return;
      }

      // Escape — focus terminal
      if (e.key === "Escape") {
        handlers.onFocusTerminal();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handlers]);
}
