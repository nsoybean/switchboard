import { memo, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { useTheme } from "@/components/theme-provider";
import "@xterm/xterm/css/xterm.css";
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

/** Strip SGR dim (code 2) for light theme readability. */
function stripAnsiDim(data: string): string {
  return data.replace(/\x1b\[([0-9;]*)m/g, (match, params: string) => {
    if (!params) return match;

    const tokens = params.split(";").filter((p) => p.length > 0);
    const next: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      // Preserve extended color sequences (38;2;r;g;b / 48;2;r;g;b / 38;5;n / 48;5;n)
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
      if (t === "2") continue; // Drop dim
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

// ---------------------------------------------------------------------------
// Props & memo helpers
// ---------------------------------------------------------------------------

interface XTermContainerProps {
  tileId: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
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
  onStart,
  onExit,
  closeOnUnmount = true,
}: XTermContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sessionActiveRef = useRef(false);
  const onStartRef = useRef(onStart);
  const onExitRef = useRef(onExit);
  const { theme } = useTheme();

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  const isShellCommand = /(^|\/)(zsh|bash|sh|fish)$/.test(command);

  const openSearch = useCallback(() => {
    setSearchVisible(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery("");
    searchAddonRef.current?.clearDecorations();
    terminalRef.current?.focus();
  }, []);

  const doSearch = useCallback((query: string, direction: "next" | "prev" = "next") => {
    if (!searchAddonRef.current || !query) return;
    if (direction === "next") {
      searchAddonRef.current.findNext(query);
    } else {
      searchAddonRef.current.findPrevious(query);
    }
  }, []);

  useEffect(() => { onStartRef.current = onStart; }, [onStart]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  // -----------------------------------------------------------------------
  // Core terminal lifecycle — single effect owns PTY + listeners
  // -----------------------------------------------------------------------
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const isMac =
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform);

    // --- 1. Create xterm.js instance ---
    const terminal = new Terminal({
      allowTransparency: true,
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: '"SF Mono", Menlo, Monaco, "JetBrains Mono", monospace',
      fontSize: 13.5,
      fontWeight: "normal",
      fontWeightBold: "bold",
      lineHeight: 1.3,
      macOptionIsMeta: true,
      minimumContrastRatio: 1,
      scrollback: 200000,
      theme: isDarkRef.current ? DARK_THEME : LIGHT_THEME,
    });

    // --- 2. Custom key handlers ---
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      // Cmd+F → open search bar
      if (event.key === "f" && (isMac ? event.metaKey : event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        openSearch();
        return false;
      }

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

    // --- 3. Load addons and open ---
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    terminal.open(host);

    // Unicode 11 for proper character width measurement
    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(unicode11);
    terminal.unicode.activeVersion = "11";

    // WebGL renderer with context loss recovery
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
      });
      terminal.loadAddon(webgl);
    } catch {
      // WebGL can fail; xterm falls back to canvas automatically.
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const fit = () => {
      try { fitAddon.fit(); } catch { /* container settling */ }
    };

    // --- 4. Resize pipeline ---
    //
    // ResizeObserver → fit xterm (visual) → resize PTY (SIGWINCH)
    //
    // The first resize is sent immediately so the child process gets
    // correct dimensions before it draws anything. Subsequent resizes
    // are debounced via rAF so we send at most one per frame — fast
    // enough for smooth window drags, slow enough to avoid flooding
    // the child with SIGWINCH mid-redraw.
    //
    // We never call terminal.clear() — the child process handles its
    // own redraw in response to SIGWINCH. Clearing scrollback causes
    // visible flicker, especially with TUI apps like Claude Code.
    let lastCols = 0;
    let lastRows = 0;
    let resizeRaf = 0;
    let initialResizeDone = false;

    const resizePty = () => {
      if (!sessionActiveRef.current) return;
      const { cols, rows } = dims(terminal);
      if (cols !== lastCols || rows !== lastRows) {
        lastCols = cols;
        lastRows = rows;
        void invoke("resize_terminal", { tileId, cols, rows });
      }
      initialResizeDone = true;
    };

    const observer = new ResizeObserver(() => {
      fit();
      if (!initialResizeDone) {
        cancelAnimationFrame(resizeRaf);
        resizePty();
      } else {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => resizePty());
      }
    });
    observer.observe(host);

    // --- 5. Input ---
    const disposables = [
      terminal.onData((data) => {
        if (!sessionActiveRef.current) return;
        void invoke("write_terminal", { tileId, data });
      }),
    ];

    // --- 6. Output buffering ---
    //
    // Coalesce rapid PTY writes into a single xterm.write() call.
    // Prevents renderer artifacts from high-frequency event bursts
    // (e.g. large command output, TUI redraws).
    let pendingData = "";
    let flushTimer = 0;
    const FLUSH_INTERVAL = 5; // ms

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
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const registerListenersAndInit = async () => {
      // Register listeners FIRST to avoid race with PTY output
      unsubs.push(
        await listen<{ tileId: string; data: string }>("workspace-output", (event) => {
          if (cancelled || event.payload.tileId !== tileId) return;
          bufferOutput(event.payload.data);
        }),
      );

      unsubs.push(
        await listen<{ tileId: string; code: number | null }>("workspace-exit", (event) => {
          if (cancelled || event.payload.tileId !== tileId) return;
          // Flush any remaining buffered output before marking exit
          if (pendingData) {
            window.clearTimeout(flushTimer);
            flushOutput();
          }
          sessionActiveRef.current = false;
          onExitRef.current?.(event.payload.code);
        }),
      );

      if (cancelled) return;

      // --- 8. Create or reconnect PTY (after listeners are ready) ---
      //
      // Wait for the container size to stabilize before measuring.
      // The layout may still be settling (inspector panel mounting,
      // sidebar animation, React re-renders).  We poll until the
      // container width/height is unchanged for 2 consecutive frames,
      // capped at 10 frames (~160ms) to avoid infinite waits.
      try { await document.fonts.ready; } catch { /* older browsers */ }
      if (cancelled) return;

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

    void registerListenersAndInit();

    // --- 9. Cleanup ---
    return () => {
      cancelled = true;
      sessionActiveRef.current = false;
      cancelAnimationFrame(resizeRaf);
      window.clearTimeout(flushTimer);
      observer.disconnect();
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      terminalRef.current = null;
      disposables.forEach((d) => d.dispose());
      unsubs.forEach((fn) => fn());
      terminal.dispose();
      if (closeOnUnmount) {
        void invoke("close_terminal", { tileId }).catch(() => {});
      }
    };
  }, [args, closeOnUnmount, command, cwd, env, openSearch, tileId]);

  // -----------------------------------------------------------------------
  // Theme sync (visual only — no listener re-registration)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDark]);

  return (
    <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
      {searchVisible && (
        <div className="absolute top-1 right-2 z-10 flex items-center gap-1 rounded border border-border bg-background px-2 py-1 shadow-sm">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              doSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                closeSearch();
              } else if (e.key === "Enter") {
                e.preventDefault();
                doSearch(searchQuery, e.shiftKey ? "prev" : "next");
              }
            }}
            placeholder="Search..."
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-6 w-48 border-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            style={{ fontFamily: '"SF Mono", Menlo, Monaco, "JetBrains Mono", monospace' }}
          />
          <button
            onClick={() => doSearch(searchQuery, "prev")}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            title="Previous (Shift+Enter)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9.5V2.5M6 2.5L2.5 6M6 2.5L9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button
            onClick={() => doSearch(searchQuery, "next")}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            title="Next (Enter)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2.5V9.5M6 9.5L2.5 6M6 9.5L9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button
            onClick={closeSearch}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            title="Close (Esc)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}
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
    arrayEq(prev.args, next.args) &&
    recordEq(prev.env, next.env),
);
