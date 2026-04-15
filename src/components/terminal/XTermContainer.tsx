import { memo, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { useTheme } from "@/components/theme-provider";
import "@xterm/xterm/css/xterm.css";
import "../../styles/terminal.css";

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

function areArgsEqual(left: string[] | undefined, right: string[] | undefined) {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function areEnvEqual(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right[key] === value);
}

function stripAnsiDim(data: string): string {
  return data.replace(/\x1b\[([0-9;]*)m/g, (match, params: string) => {
    if (!params) {
      return match;
    }

    const tokens = params.split(";").filter((part) => part.length > 0);
    const nextTokens: string[] = [];

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];

      // Preserve extended color sequences like 38;2;r;g;b and 48;2;r;g;b.
      if (
        (token === "38" || token === "48" || token === "58") &&
        tokens[index + 1] === "2" &&
        tokens.length >= index + 5
      ) {
        nextTokens.push(
          token,
          tokens[index + 1],
          tokens[index + 2],
          tokens[index + 3],
          tokens[index + 4],
        );
        index += 4;
        continue;
      }

      // Preserve indexed color sequences like 38;5;n and 48;5;n.
      if (
        (token === "38" || token === "48" || token === "58") &&
        tokens[index + 1] === "5" &&
        tokens.length >= index + 3
      ) {
        nextTokens.push(token, tokens[index + 1], tokens[index + 2]);
        index += 2;
        continue;
      }

      // Drop standalone dim SGR only.
      if (token === "2") {
        continue;
      }

      nextTokens.push(token);
    }

    if (nextTokens.length === tokens.length) {
      return match;
    }

    if (nextTokens.length === 0) {
      return "";
    }

    return `\x1b[${nextTokens.join(";")}m`;
  });
}

function normalizeTerminalOutput(data: string, isDark: boolean): string {
  if (isDark) {
    return data;
  }

  return stripAnsiDim(data);
}

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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const sessionActiveRef = useRef(false);
  const onStartRef = useRef(onStart);
  const onExitRef = useRef(onExit);
  const { theme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const isShellCommand =
    /(^|\/)(zsh|bash|sh|fish)$/.test(command);

  useEffect(() => {
    onStartRef.current = onStart;
  }, [onStart]);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }

    const isMacPlatform =
      typeof navigator !== "undefined" &&
      /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform);

    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: true,
      cursorBlink: true,
      fontFamily: '"SF Mono", Menlo, Monaco, "JetBrains Mono", monospace',
      fontSize: 13.5,
      fontWeight: "normal",
      fontWeightBold: "bold",
      lineHeight: 1.3,
      macOptionIsMeta: true,
      minimumContrastRatio: isDark ? 1 : 1,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
    });

    terminal.attachCustomKeyEventHandler((event) => {
      // Shift+Enter → newline for Claude Code / Codex multi-line input
      if (
        !isShellCommand &&
        event.type === "keydown" &&
        event.key === "Enter" &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();

        if (sessionActiveRef.current) {
          void invoke("write_terminal", { tileId, data: "\n" }).catch((error) => {
            console.error("Failed to write terminal newline", error);
          });
        }

        return false;
      }

      if (
        isMacPlatform &&
        isShellCommand &&
        event.type === "keydown" &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();

        if (sessionActiveRef.current) {
          const data = event.key === "ArrowLeft" ? "\u001bb" : "\u001bf";
          void invoke("write_terminal", { tileId, data }).catch((error) => {
            console.error("Failed to write terminal shortcut input", error);
          });
        }

        return false;
      }

      if (
        isMacPlatform &&
        !isShellCommand &&
        event.type === "keydown" &&
        event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();

        if (sessionActiveRef.current) {
          const data = event.key === "ArrowLeft" ? "\u0001" : "\u0005";
          void invoke("write_terminal", { tileId, data }).catch((error) => {
            console.error("Failed to write terminal shortcut input", error);
          });
        }

        return false;
      }

      if (
        isMacPlatform &&
        event.type === "keydown" &&
        event.key === "Backspace" &&
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();

        if (sessionActiveRef.current) {
          void invoke("write_terminal", { tileId, data: "\u0017" }).catch((error) => {
            console.error("Failed to write terminal shortcut input", error);
          });
        }

        return false;
      }

      return true;
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);

    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      // WebGL can fail on some GPUs; xterm falls back automatically.
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const fitTerminal = () => {
      try {
        fitAddon.fit();
      } catch {
        // Ignore fit failures while the container is still settling.
      }
    };

    // Batch fit + PTY resize together in a single rAF so xterm.js and
    // the PTY always update atomically — no window where they disagree.
    let lastCols = 0;
    let lastRows = 0;
    let resizeRaf = 0;

    const syncTerminalSize = () => {
      if (!sessionActiveRef.current) {
        return;
      }

      if (resizeRaf) {
        cancelAnimationFrame(resizeRaf);
      }

      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        fitTerminal();

        const cols = Math.max(20, terminal.cols);
        const rows = Math.max(8, terminal.rows);

        if (cols !== lastCols || rows !== lastRows) {
          lastCols = cols;
          lastRows = rows;
          void invoke("resize_terminal", { tileId, cols, rows });
        }
      });
    };

    // Flush any pending resize immediately so the PTY has the correct
    // column count before it processes incoming keystrokes.
    const flushPendingResize = () => {
      if (resizeRaf) {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = 0;
        fitTerminal();

        const cols = Math.max(20, terminal.cols);
        const rows = Math.max(8, terminal.rows);

        if (cols !== lastCols || rows !== lastRows) {
          lastCols = cols;
          lastRows = rows;
          void invoke("resize_terminal", { tileId, cols, rows });
        }
      }
    };

    const disposables = [
      terminal.onData((data) => {
        if (!sessionActiveRef.current) {
          return;
        }

        flushPendingResize();
        void invoke("write_terminal", { tileId, data }).catch((error) => {
          console.error("Failed to write terminal input", error);
        });
      }),
    ];

    resizeObserverRef.current = new ResizeObserver(() => {
      syncTerminalSize();
    });
    resizeObserverRef.current.observe(host);

    // Wait for the container size to stabilize before spawning the PTY
    // so the child process gets accurate column/row dimensions on its
    // first read.  We poll fitAddon until two consecutive frames agree
    // on the same cols/rows (or bail after a timeout).
    let stabilityTimer = 0;
    let stabilityRaf = 0;

    const waitForStableSize = (
      onStable: (cols: number, rows: number) => void,
    ) => {
      let prevCols = 0;
      let prevRows = 0;
      let matchCount = 0;
      const maxAttempts = 15; // ~250ms at 60fps
      let attempts = 0;

      const check = () => {
        fitTerminal();
        const cols = Math.max(20, terminal.cols);
        const rows = Math.max(8, terminal.rows);

        if (cols === prevCols && rows === prevRows) {
          matchCount++;
        } else {
          matchCount = 0;
        }

        prevCols = cols;
        prevRows = rows;
        attempts++;

        if (matchCount >= 2 || attempts >= maxAttempts) {
          onStable(cols, rows);
        } else {
          stabilityRaf = requestAnimationFrame(check);
        }
      };

      // Give the layout one frame to settle before starting checks.
      stabilityTimer = window.setTimeout(() => {
        stabilityRaf = requestAnimationFrame(check);
      }, 20);
    };

    waitForStableSize((stableCols, stableRows) => {
      void invoke<boolean>("terminal_exists", { tileId })
        .then(async (exists) => {
          if (exists) {
            const bufferedOutput = await invoke<string>("get_terminal_buffer", { tileId });
            if (bufferedOutput) {
              terminal.write(normalizeTerminalOutput(bufferedOutput, isDark));
            }

            sessionActiveRef.current = true;
            lastCols = stableCols;
            lastRows = stableRows;
            void invoke("resize_terminal", { tileId, cols: stableCols, rows: stableRows });
            terminal.focus();
            return;
          }

          await invoke<{ sessionId: string }>("create_terminal", {
            request: {
              tileId,
              cols: stableCols,
              rows: stableRows,
              command: command || null,
              args,
              startDir: cwd ?? null,
              env: env ?? null,
            },
          });

          sessionActiveRef.current = true;
          lastCols = stableCols;
          lastRows = stableRows;
          onStartRef.current?.();
          terminal.focus();

          // The child process (e.g. Claude Code) queries terminal
          // dimensions during its own startup which races with
          // layout settling.  Send a follow-up resize after the
          // child has had time to initialize so it picks up
          // correct dimensions via SIGWINCH.
          const postCreationSync = () => {
            if (!sessionActiveRef.current) return;
            fitTerminal();
            const cols = Math.max(20, terminal.cols);
            const rows = Math.max(8, terminal.rows);
            if (cols !== lastCols || rows !== lastRows) {
              lastCols = cols;
              lastRows = rows;
            }
            // Always re-send so the child gets SIGWINCH even if
            // dimensions haven't changed — it may have read stale
            // values during its own init.
            void invoke("resize_terminal", { tileId, cols, rows });
          };
          // Stagger re-syncs to cover font-load and child-init timing.
          setTimeout(postCreationSync, 150);
          setTimeout(postCreationSync, 500);
        })
        .catch((error) => {
          terminal.writeln("");
          terminal.writeln(`\u001b[31mFailed to launch terminal: ${String(error)}\u001b[0m`);
        });
    });

    return () => {
      sessionActiveRef.current = false;
      window.clearTimeout(stabilityTimer);
      cancelAnimationFrame(stabilityRaf);
      if (resizeRaf) {
        cancelAnimationFrame(resizeRaf);
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      fitAddonRef.current = null;
      terminalRef.current = null;
      disposables.forEach((disposable) => disposable.dispose());
      terminal.dispose();
      if (closeOnUnmount) {
        void invoke("close_terminal", { tileId }).catch(() => {
          // App shutdown can race with Tauri teardown; ignore cleanup failures.
        });
      }
    };
  }, [args, closeOnUnmount, command, cwd, env, tileId]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDark]);

  useEffect(() => {
    let mounted = true;
    const unsubscribe: Array<() => void> = [];

    const bind = async () => {
      unsubscribe.push(
        await listen<{ tileId: string; data: string }>("workspace-output", (event) => {
          if (!mounted || event.payload.tileId !== tileId) {
            return;
          }

          terminalRef.current?.write(normalizeTerminalOutput(event.payload.data, isDark));
        }),
      );

      unsubscribe.push(
        await listen<{ tileId: string; code: number | null }>("workspace-exit", (event) => {
          if (!mounted || event.payload.tileId !== tileId) {
            return;
          }

          sessionActiveRef.current = false;
          onExitRef.current?.(event.payload.code);
        }),
      );
    };

    void bind();

    return () => {
      mounted = false;
      unsubscribe.forEach((dispose) => dispose());
    };
  }, [isDark, tileId]);

  return <div ref={containerRef} className="h-full w-full min-h-0 min-w-0 overflow-hidden" />;
}

export const XTermContainer = memo(
  XTermContainerComponent,
  (prevProps, nextProps) =>
    prevProps.tileId === nextProps.tileId &&
    prevProps.command === nextProps.command &&
    prevProps.closeOnUnmount === nextProps.closeOnUnmount &&
    prevProps.cwd === nextProps.cwd &&
    areArgsEqual(prevProps.args, nextProps.args) &&
    areEnvEqual(prevProps.env, nextProps.env),
);
