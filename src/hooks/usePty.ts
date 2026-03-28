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
  const writeQueueRef = useRef<Uint8Array[]>([]);
  const rafRef = useRef<number | null>(null);

  // Forward user input from xterm to PTY.
  // Lives in its own effect so it is set up exactly once per terminal instance
  // and properly disposed — prevents listener stacking on re-spawn.
  useEffect(() => {
    if (!terminal) return;
    const disposable = terminal.onData((data: string) => {
      if (ptyIdRef.current !== null) {
        invoke("pty_write", { id: ptyIdRef.current, data }).catch(console.error);
      }
    });
    return () => disposable.dispose();
  }, [terminal]);

  const spawn = useCallback(
    async (options: SpawnOptions): Promise<number> => {
      const id = await invoke<number>("pty_spawn", { options });
      ptyIdRef.current = id;

      // Batch incoming output chunks and flush once per animation frame.
      // This prevents hundreds of synchronous terminal.write() calls per
      // second when the agent is producing high-throughput output.
      unlistenOutputRef.current = await listen<PtyOutput>(
        "pty-output",
        (event) => {
          if (event.payload.id !== id || !terminal) return;
          writeQueueRef.current.push(new Uint8Array(event.payload.data));
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null;
              const queue = writeQueueRef.current;
              if (queue.length === 0 || !terminal) return;
              writeQueueRef.current = [];
              if (queue.length === 1) {
                terminal.write(queue[0]!);
              } else {
                const totalLength = queue.reduce((sum, c) => sum + c.length, 0);
                const combined = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of queue) {
                  combined.set(chunk, offset);
                  offset += chunk.length;
                }
                terminal.write(combined);
              }
            });
          }
        },
      );

      unlistenExitRef.current = await listen<PtyExit>(
        "pty-exit",
        (event) => {
          if (event.payload.id === id) {
            onExit?.(event.payload.code);
          }
        },
      );

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

  // Cleanup listeners and any pending RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      unlistenOutputRef.current?.();
      unlistenExitRef.current?.();
    };
  }, []);

  return { spawn, resize, kill, ptyId: ptyIdRef };
}
