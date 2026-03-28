import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Tracks whether the Tauri application window is currently focused.
 * Returns `true` when the window has OS-level focus, `false` otherwise.
 */
export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let cancelled = false;

    // Seed with current focus state
    appWindow.isFocused().then((val) => {
      if (!cancelled) setFocused(val);
    });

    const unlistenFocus = appWindow.onFocusChanged(({ payload: isFocused }) => {
      setFocused(isFocused);
    });

    return () => {
      cancelled = true;
      unlistenFocus.then((fn) => fn());
    };
  }, []);

  return focused;
}
