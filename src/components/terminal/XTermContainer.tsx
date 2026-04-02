import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { useTheme } from "@/components/theme-provider";
import "@xterm/xterm/css/xterm.css";
import "../../styles/terminal.css";

const DARK_THEME = {
  background: "#12181e",
  foreground: "#f2f7fb",
  cursor: "#87e6ff",
  black: "#12181e",
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
  background: "#f6f2ea",
  foreground: "#18212b",
  cursor: "#2d4759",
  black: "#18212b",
  blue: "#2563eb",
  brightBlack: "#6b7280",
  brightBlue: "#60a5fa",
  brightCyan: "#22d3ee",
  brightGreen: "#4ade80",
  brightMagenta: "#c084fc",
  brightRed: "#f87171",
  brightWhite: "#ffffff",
  brightYellow: "#facc15",
  cyan: "#0891b2",
  green: "#16a34a",
  magenta: "#9333ea",
  red: "#dc2626",
  white: "#f8fafc",
  yellow: "#ca8a04",
};

interface XTermContainerProps {
  tileId: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  onStart?: () => void;
  onExit?: (code: number | null) => void;
}

export function XTermContainer({
  tileId,
  command = "/bin/zsh",
  args = [],
  cwd,
  env,
  onStart,
  onExit,
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
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13.5,
      lineHeight: 1.3,
      macOptionIsMeta: true,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
    });

    terminal.attachCustomKeyEventHandler((event) => {
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

    const syncTerminalSize = async () => {
      if (!sessionActiveRef.current) {
        return;
      }

      fitTerminal();

      await invoke("resize_terminal", {
        tileId,
        cols: Math.max(20, terminal.cols),
        rows: Math.max(8, terminal.rows),
      });
    };

    const disposables = [
      terminal.onData((data) => {
        if (!sessionActiveRef.current) {
          return;
        }

        void invoke("write_terminal", { tileId, data }).catch((error) => {
          console.error("Failed to write terminal input", error);
        });
      }),
    ];

    resizeObserverRef.current = new ResizeObserver(() => {
      void syncTerminalSize();
    });
    resizeObserverRef.current.observe(host);

    const startupTimer = window.setTimeout(() => {
      fitTerminal();

      void invoke<{ sessionId: string }>("create_terminal", {
        request: {
          tileId,
          cols: Math.max(20, terminal.cols),
          rows: Math.max(8, terminal.rows),
          command: command || null,
          args,
          startDir: cwd ?? null,
          env: env ?? null,
        },
      })
        .then(() => {
          sessionActiveRef.current = true;
          onStartRef.current?.();
          terminal.focus();
        })
        .catch((error) => {
          terminal.writeln("");
          terminal.writeln(`\u001b[31mFailed to launch terminal: ${String(error)}\u001b[0m`);
        });
    }, 40);

    return () => {
      sessionActiveRef.current = false;
      window.clearTimeout(startupTimer);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      fitAddonRef.current = null;
      terminalRef.current = null;
      disposables.forEach((disposable) => disposable.dispose());
      terminal.dispose();
      void invoke("close_terminal", { tileId }).catch(() => {
        // App shutdown can race with Tauri teardown; ignore cleanup failures.
      });
    };
  }, [args, command, cwd, env, tileId]);

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

          terminalRef.current?.write(event.payload.data);
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
  }, [tileId]);

  return <div ref={containerRef} className="h-full w-full min-h-0 min-w-0 overflow-hidden" />;
}
