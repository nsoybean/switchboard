import { memo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { init, Terminal, FitAddon } from "ghostty-web";

// ---------------------------------------------------------------------------
// WASM init — started eagerly at module load so it's ready before first render
// ---------------------------------------------------------------------------

const ghosttyReady = init();

const FLUSH_INTERVAL = 5; // ms

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dims(terminal: Terminal) {
  return {
    cols: Math.max(20, terminal.cols),
    rows: Math.max(8, terminal.rows),
  };
}

function canMeasureHost(host: HTMLDivElement) {
  if (!host.isConnected) return false;
  const rect = host.getBoundingClientRect();
  return rect.width >= 2 && rect.height >= 2;
}

// ---------------------------------------------------------------------------
// Props & memo helpers
// ---------------------------------------------------------------------------

interface XTermContainerProps {
  tileId: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  isVisible?: boolean;
  onStart?: () => void;
  onExit?: (code: number | null) => void;
  closeOnUnmount?: boolean;
}

function arrayEq(a: string[] | undefined, b: string[] | undefined) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function recordEq(a: Record<string, string> | undefined, b: Record<string, string> | undefined) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const ae = Object.entries(a);
  if (ae.length !== Object.keys(b).length) return false;
  return ae.every(([k, v]) => b[k] === v);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function XTermContainerComponent({
  tileId,
  command = "/bin/zsh",
  args = [],
  cwd,
  env,
  isVisible = true,
  onStart,
  onExit,
  closeOnUnmount = true,
}: XTermContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionActiveRef = useRef(false);
  const isVisibleRef = useRef(isVisible);
  const onStartRef = useRef(onStart);
  const onExitRef = useRef(onExit);

  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);
  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);

  // -----------------------------------------------------------------------
  // Core terminal lifecycle
  // -----------------------------------------------------------------------
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let cancelled = false;
    let resizeRaf = 0;
    let lastCols = 0;
    let lastRows = 0;
    let initialResizeDone = false;
    let pendingData = "";
    let flushTimer = 0;
    const unsubs: Array<() => void> = [];
    const disposables: Array<{ dispose(): void }> = [];
    let resizeObserver: ResizeObserver | null = null;

    const run = async () => {
      await ghosttyReady;
      if (cancelled) return;

      // --- 1. Create terminal ---
      const terminal = new Terminal({
        cursorBlink: true,
        scrollback: 10000,
      });

      // --- 2. Load FitAddon and open ---
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(host);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // --- 3. Resize pipeline ---
      const fit = () => {
        if (!isVisibleRef.current || !canMeasureHost(host)) return false;
        try { fitAddon.fit(); return true; } catch { return false; }
      };

      const resizePty = () => {
        if (!sessionActiveRef.current || !isVisibleRef.current || !canMeasureHost(host)) return;
        const { cols, rows } = dims(terminal);
        if (cols !== lastCols || rows !== lastRows) {
          lastCols = cols;
          lastRows = rows;
          void invoke("resize_terminal", { tileId, cols, rows });
        }
        initialResizeDone = true;
      };

      resizeObserver = new ResizeObserver(() => {
        if (!fit()) return;
        if (!initialResizeDone) {
          cancelAnimationFrame(resizeRaf);
          resizePty();
        } else {
          cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(() => resizePty());
        }
      });
      resizeObserver.observe(host);

      // --- 4. Input → PTY ---
      disposables.push(
        terminal.onData((data) => {
          if (!sessionActiveRef.current) return;
          void invoke("write_terminal", { tileId, data });
        }),
      );

      // --- 5. Output buffering ---
      const flushOutput = () => {
        flushTimer = 0;
        if (pendingData) {
          terminal.write(pendingData);
          pendingData = "";
        }
      };

      const bufferOutput = (data: string) => {
        pendingData += data;
        if (!flushTimer) {
          flushTimer = window.setTimeout(flushOutput, FLUSH_INTERVAL);
        }
      };

      // --- 6. Tauri event listeners (before PTY creation) ---
      unsubs.push(
        await listen<{ tileId: string; data: string }>("workspace-output", (event) => {
          if (cancelled || event.payload.tileId !== tileId) return;
          bufferOutput(event.payload.data);
        }),
      );

      unsubs.push(
        await listen<{ tileId: string; code: number | null }>("workspace-exit", (event) => {
          if (cancelled || event.payload.tileId !== tileId) return;
          if (pendingData) { window.clearTimeout(flushTimer); flushOutput(); }
          sessionActiveRef.current = false;
          onExitRef.current?.(event.payload.code);
        }),
      );

      if (cancelled) return;

      // --- 7. Wait for layout then create/reconnect PTY ---
      try { await document.fonts.ready; } catch { /* ignore */ }
      if (cancelled) return;

      const waitForVisibleLayout = async () => {
        while (!cancelled && (!isVisibleRef.current || !canMeasureHost(host))) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
      };

      const waitForStableLayout = async () => {
        let prevW = host.clientWidth;
        let prevH = host.clientHeight;
        let stableFrames = 0;
        let totalFrames = 0;
        while (stableFrames < 2 && totalFrames < 10) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (cancelled) return;
          totalFrames++;
          const w = host.clientWidth;
          const h = host.clientHeight;
          if (w === prevW && h === prevH) { stableFrames++; }
          else { stableFrames = 0; prevW = w; prevH = h; }
        }
      };

      await waitForVisibleLayout();
      if (cancelled) return;
      await waitForStableLayout();
      if (cancelled) return;

      fit();
      const { cols, rows } = dims(terminal);
      lastCols = cols;
      lastRows = rows;

      try {
        const exists = await invoke<boolean>("terminal_exists", { tileId });
        if (cancelled) return;

        if (exists) {
          const buf = await invoke<string>("get_terminal_buffer", { tileId });
          if (buf) terminal.write(buf);
          sessionActiveRef.current = true;
          void invoke("resize_terminal", { tileId, cols, rows });
          terminal.focus();
          return;
        }

        await invoke<{ sessionId: string }>("create_terminal", {
          request: {
            tileId,
            cols,
            rows,
            command: command || null,
            args,
            startDir: cwd ?? null,
            env: env ?? null,
          },
        });

        if (cancelled) return;
        sessionActiveRef.current = true;
        onStartRef.current?.();
        terminal.focus();
      } catch (error) {
        if (cancelled) return;
        terminal.writeln(`\x1b[31mFailed to launch terminal: ${String(error)}\x1b[0m`);
      }
    };

    void run();

    // --- Cleanup ---
    return () => {
      cancelled = true;
      sessionActiveRef.current = false;
      cancelAnimationFrame(resizeRaf);
      window.clearTimeout(flushTimer);
      resizeObserver?.disconnect();
      fitAddonRef.current = null;
      disposables.forEach((d) => d.dispose());
      unsubs.forEach((fn) => fn());
      terminalRef.current?.dispose();
      terminalRef.current = null;
      if (closeOnUnmount) {
        void invoke("close_terminal", { tileId }).catch(() => {});
      }
    };
  }, [args, closeOnUnmount, command, cwd, env, tileId]);

  // -----------------------------------------------------------------------
  // Visibility change — refit and refocus
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isVisible) return;

    const host = containerRef.current;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!host || !terminal || !fitAddon) return;

    const frame = requestAnimationFrame(() => {
      if (!canMeasureHost(host)) return;
      try { fitAddon.fit(); } catch { return; }
      if (sessionActiveRef.current) {
        const { cols, rows } = dims(terminal);
        void invoke("resize_terminal", { tileId, cols, rows });
      }
      terminal.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [isVisible, tileId]);

  return (
    <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden px-3 py-2">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

export const XTermContainer = memo(
  XTermContainerComponent,
  (prev, next) =>
    prev.tileId === next.tileId &&
    prev.command === next.command &&
    prev.closeOnUnmount === next.closeOnUnmount &&
    prev.cwd === next.cwd &&
    prev.isVisible === next.isVisible &&
    arrayEq(prev.args, next.args) &&
    recordEq(prev.env, next.env),
);
