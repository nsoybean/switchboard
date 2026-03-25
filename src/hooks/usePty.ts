import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import type { Terminal } from "@xterm/xterm";

interface SpawnOptions {
  command: string;
  args: string[];
  cwd?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

interface PtyOutput {
  id: number;
  data: number[];
}

interface PtyExit {
  id: number;
  code: number | null;
}

export function usePty(
  terminal: Terminal | null,
  onExit?: (code: number | null) => void,
) {
  const ptyIdRef = useRef<number | null>(null);
  const unlistenOutputRef = useRef<UnlistenFn | null>(null);
  const unlistenExitRef = useRef<UnlistenFn | null>(null);

  const spawn = useCallback(
    async (options: SpawnOptions): Promise<number> => {
      // Spawn PTY process
      const id = await invoke<number>("pty_spawn", { options });
      ptyIdRef.current = id;

      // Listen for output events
      unlistenOutputRef.current = await listen<PtyOutput>(
        "pty-output",
        (event) => {
          if (event.payload.id === id && terminal) {
            terminal.write(new Uint8Array(event.payload.data));
          }
        },
      );

      // Listen for exit events
      unlistenExitRef.current = await listen<PtyExit>(
        "pty-exit",
        (event) => {
          if (event.payload.id === id) {
            onExit?.(event.payload.code);
          }
        },
      );

      // Forward user input from xterm to PTY
      if (terminal) {
        terminal.onData((data: string) => {
          if (ptyIdRef.current !== null) {
            invoke("pty_write", { id: ptyIdRef.current, data }).catch(
              console.error,
            );
          }
        });
      }

      return id;
    },
    [terminal, onExit],
  );

  const resize = useCallback(async (cols: number, rows: number) => {
    if (ptyIdRef.current !== null) {
      await invoke("pty_resize", { id: ptyIdRef.current, cols, rows });
    }
  }, []);

  const kill = useCallback(async () => {
    if (ptyIdRef.current !== null) {
      await invoke("pty_kill", { id: ptyIdRef.current });
      ptyIdRef.current = null;
    }
  }, []);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unlistenOutputRef.current?.();
      unlistenExitRef.current?.();
    };
  }, []);

  return { spawn, resize, kill, ptyId: ptyIdRef };
}
