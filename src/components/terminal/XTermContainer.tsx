import { memo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { init, Terminal, FitAddon } from "ghostty-web";
import { fileCommands } from "@/lib/tauri-commands";
import { useTheme } from "@/components/theme-provider";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const DARK_THEME = {
  background: "#000000",
  foreground: "#f2f7fb",
  cursor: "#87e6ff",
  black: "#000000",
  blue: "#58c5ff",
  brightBlack: "#496476",
  brightBlue: "#89dbff",
  brightCyan: "#b0fff2",
  brightGreen: "#89ffc3",
  brightMagenta: "#d5c4ff",
  brightRed: "#ff8f8f",
  brightWhite: "#ffffff",
  brightYellow: "#ffd29b",
  cyan: "#5ff3dd",
  green: "#7ce6a7",
  magenta: "#bc9cff",
  red: "#ff7f7f",
  white: "#dde8ee",
  yellow: "#ffbf73",
};

const LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#1a1a1a",
  cursor: "#1a1a1a",
  cursorAccent: "#ffffff",
  black: "#1a1a1a",
  blue: "#0451a5",
  brightBlack: "#4b4b4b",
  brightBlue: "#0366d6",
  brightCyan: "#0b7285",
  brightGreen: "#1a7f37",
  brightMagenta: "#7c3aed",
  brightRed: "#cf222e",
  brightWhite: "#d4d4d4",
  brightYellow: "#9a6700",
  cyan: "#0b6e6e",
  green: "#116329",
  magenta: "#7c3aed",
  red: "#b31d28",
  white: "#a0a0a0",
  yellow: "#845306",
};

// ---------------------------------------------------------------------------
// WASM init — started eagerly at module load
// ---------------------------------------------------------------------------

const ghosttyReady = init();

const FLUSH_INTERVAL = 5; // ms

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "png";
}

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
  const { theme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  // Whether the command is a bare shell (vs claude-code / codex)
  const isShellCommand = /(^|\/)(zsh|bash|sh|fish)$/.test(command);
  const isShellCommandRef = useRef(isShellCommand);
  isShellCommandRef.current = isShellCommand;

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

    // --- Shift+Enter: capture-phase keydown so we intercept before ghostty-web ---
    // attachCustomKeyEventHandler was blocking all input in ghostty-web,
    // so we handle Shift+Enter at the DOM level instead.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isShellCommandRef.current
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (sessionActiveRef.current) {
          void invoke("write_terminal", { tileId, data: "\n" });
        }
      }
    };
    host.addEventListener("keydown", handleKeyDown, { capture: true });

    // --- Image paste: intercept clipboard images before ghostty-web handles paste ---
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;

        e.preventDefault();
        e.stopImmediatePropagation();
        const blob = item.getAsFile();
        if (!blob) continue;

        const ext = extensionFromMime(item.type);
        const buffer = await blob.arrayBuffer();
        const data = Array.from(new Uint8Array(buffer));

        try {
          const filePath = await fileCommands.saveTempImage(data, ext);
          if (sessionActiveRef.current) {
            void invoke("write_terminal", { tileId, data: filePath });
          }
        } catch {
          // Failed to save — fall through to default paste behavior
        }
        return;
      }
    };
    host.addEventListener("paste", handlePaste, { capture: true });

    const run = async () => {
      await ghosttyReady;
      if (cancelled) return;

      // --- 1. Create terminal ---
      const terminal = new Terminal({
        cursorBlink: true,
        scrollback: 10000,
        theme: isDarkRef.current ? DARK_THEME : LIGHT_THEME,
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
      host.removeEventListener("keydown", handleKeyDown, { capture: true });
      host.removeEventListener("paste", handlePaste, { capture: true });
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
  // Theme sync
  // -----------------------------------------------------------------------
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
  }, [isDark]);

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
