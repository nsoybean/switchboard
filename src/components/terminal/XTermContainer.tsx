import { memo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { init, Terminal, FitAddon } from "ghostty-web";
import { fileCommands } from "@/lib/tauri-commands";
import { useTheme } from "@/components/theme-provider";
import "../../styles/terminal.css";

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
  selectionBackground: "#0451a5",
  selectionForeground: "#ffffff",
  selectionInactiveBackground: "#0451a580",
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
// Helpers
// ---------------------------------------------------------------------------

function extensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "png";
}

/** Strip SGR dim (code 2) for light theme readability. */
function stripAnsiDim(data: string): string {
  return data.replace(/\x1b\[([0-9;]*)m/g, (match, params: string) => {
    if (!params) return match;

    const tokens = params.split(";").filter((p) => p.length > 0);
    const next: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if ((t === "38" || t === "48" || t === "58") && tokens[i + 1] === "2" && tokens.length >= i + 5) {
        next.push(t, tokens[i + 1], tokens[i + 2], tokens[i + 3], tokens[i + 4]);
        i += 4;
        continue;
      }
      if ((t === "38" || t === "48" || t === "58") && tokens[i + 1] === "5" && tokens.length >= i + 3) {
        next.push(t, tokens[i + 1], tokens[i + 2]);
        i += 2;
        continue;
      }
      if (t === "2") continue;
      next.push(t);
    }

    if (next.length === tokens.length) return match;
    if (next.length === 0) return "";
    return `\x1b[${next.join(";")}m`;
  });
}

function normalizeOutput(data: string, isDark: boolean): string {
  return isDark ? data : stripAnsiDim(data);
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
// WASM init — started eagerly at module load so it's ready before first render
// ---------------------------------------------------------------------------

const ghosttyReady = init();

const FLUSH_INTERVAL = 5; // ms

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

  const isShellCommand = /(^|\/)(zsh|bash|sh|fish)$/.test(command);

  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);
  useEffect(() => { isVisibleRef.current = isVisible; }, [isVisible]);

  // -----------------------------------------------------------------------
  // Core terminal lifecycle
  // -----------------------------------------------------------------------
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const isMac =
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform);

    // Mutable state shared between run() and cleanup
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
    let removePasteHandler: (() => void) | null = null;

    const run = async () => {
      // Wait for ghostty WASM to be ready before creating Terminal
      await ghosttyReady;
      if (cancelled) return;

      // --- 1. Create terminal instance ---
      const terminal = new Terminal({
        allowTransparency: true,
        cursorBlink: true,
        fontFamily: '"SF Mono", Menlo, Monaco, "JetBrains Mono", monospace',
        fontSize: 13.5,
        scrollback: 200000,
        theme: isDarkRef.current ? DARK_THEME : LIGHT_THEME,
      });

      // --- 2. Custom key handlers ---
      terminal.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown") return true;

        // Shift+Enter → newline (Claude Code / Codex multi-line)
        if (!isShellCommand && event.key === "Enter" && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          if (sessionActiveRef.current) {
            void invoke("write_terminal", { tileId, data: "\n" });
          }
          return false;
        }

        // Alt+Arrow → word navigation (shell)
        if (isMac && isShellCommand && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault();
          if (sessionActiveRef.current) {
            void invoke("write_terminal", { tileId, data: event.key === "ArrowLeft" ? "\u001bb" : "\u001bf" });
          }
          return false;
        }

        // Cmd+Arrow → line start/end (Claude Code / Codex)
        if (isMac && !isShellCommand && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault();
          if (sessionActiveRef.current) {
            void invoke("write_terminal", { tileId, data: event.key === "ArrowLeft" ? "\u0001" : "\u0005" });
          }
          return false;
        }

        // Alt+Backspace → delete word
        if (isMac && event.key === "Backspace" && event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          if (sessionActiveRef.current) {
            void invoke("write_terminal", { tileId, data: "\u0017" });
          }
          return false;
        }

        return true;
      });

      // --- 3. Load FitAddon and open ---
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(host);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      const fit = () => {
        if (!isVisibleRef.current || !canMeasureHost(host)) return false;
        try {
          fitAddon.fit();
          return true;
        } catch {
          return false;
        }
      };

      // --- 4. Resize pipeline ---
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

      // --- 5. Input ---
      disposables.push(
        terminal.onData((data) => {
          if (!sessionActiveRef.current) return;
          void invoke("write_terminal", { tileId, data });
        }),
      );

      // --- 5b. Image paste ---
      const handlePaste = async (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of Array.from(items)) {
          if (!item.type.startsWith("image/")) continue;

          e.preventDefault();
          e.stopPropagation();
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
            // Failed to save image — fall through to default paste
          }
          return;
        }
      };
      host.addEventListener("paste", handlePaste);
      removePasteHandler = () => host.removeEventListener("paste", handlePaste);

      // --- 6. Output buffering ---
      const flushOutput = () => {
        flushTimer = 0;
        if (pendingData && terminal) {
          terminal.write(normalizeOutput(pendingData, isDarkRef.current));
          pendingData = "";
        }
      };

      const bufferOutput = (data: string) => {
        pendingData += data;
        if (!flushTimer) {
          flushTimer = window.setTimeout(flushOutput, FLUSH_INTERVAL);
        }
      };

      // --- 7. Event listeners (registered BEFORE PTY creation) ---
      unsubs.push(
        await listen<{ tileId: string; data: string }>("workspace-output", (event) => {
          if (cancelled || event.payload.tileId !== tileId) return;
          bufferOutput(event.payload.data);
        }),
      );

      unsubs.push(
        await listen<{ tileId: string; code: number | null }>("workspace-exit", (event) => {
          if (cancelled || event.payload.tileId !== tileId) return;
          if (pendingData) {
            window.clearTimeout(flushTimer);
            flushOutput();
          }
          sessionActiveRef.current = false;
          onExitRef.current?.(event.payload.code);
        }),
      );

      if (cancelled) return;

      // --- 8. Create or reconnect PTY ---
      try { await document.fonts.ready; } catch { /* older browsers */ }
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
        const MAX_FRAMES = 10;
        let totalFrames = 0;

        while (stableFrames < 2 && totalFrames < MAX_FRAMES) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          if (cancelled) return;
          totalFrames++;
          const w = host.clientWidth;
          const h = host.clientHeight;
          if (w === prevW && h === prevH) {
            stableFrames++;
          } else {
            stableFrames = 0;
            prevW = w;
            prevH = h;
          }
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
          if (buf) terminal.write(normalizeOutput(buf, isDarkRef.current));
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
        terminal.writeln("");
        terminal.writeln(`\x1b[31mFailed to launch terminal: ${String(error)}\x1b[0m`);
      }
    };

    void run();

    // --- 9. Cleanup ---
    return () => {
      cancelled = true;
      sessionActiveRef.current = false;
      cancelAnimationFrame(resizeRaf);
      window.clearTimeout(flushTimer);
      resizeObserver?.disconnect();
      removePasteHandler?.();
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
  // Theme sync (visual only)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDark]);

  useEffect(() => {
    if (!isVisible) return;

    const host = containerRef.current;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!host || !terminal || !fitAddon) return;

    const frame = requestAnimationFrame(() => {
      if (!canMeasureHost(host)) return;
      try {
        fitAddon.fit();
      } catch {
        return;
      }

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
