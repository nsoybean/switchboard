import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { usePty } from "../../hooks/usePty";
import { useTheme } from "@/components/theme-provider";
import "@xterm/xterm/css/xterm.css";
import "../../styles/terminal.css";

const DARK_THEME = {
  background: "#1c1917",
  foreground: "#e7e5e4",
  cursor: "#a8a29e",
  selectionBackground: "#44403c",
  black: "#1c1917",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#e7e5e4",
  brightBlack: "#78716c",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#fafaf9",
};

const LIGHT_THEME = {
  background: "#fafaf9",
  foreground: "#1c1917",
  cursor: "#78716c",
  selectionBackground: "#e7e5e4",
  black: "#1c1917",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#fafaf9",
  brightBlack: "#a8a29e",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#ffffff",
};

interface XTermContainerProps {
  command?: string;
  args?: string[];
  cwd?: string;
  isActive?: boolean;
  onExit?: (code: number | null) => void;
}

export function XTermContainer({
  command = "/bin/bash",
  args = [],
  cwd,
  isActive,
  onExit,
}: XTermContainerProps) {
  const shouldFit = isActive ?? true;
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSizeRef = useRef<string | null>(null);
  const shouldFitRef = useRef(shouldFit);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [ready, setReady] = useState(false);
  const { spawn, resize } = usePty(terminal, onExit);
  const spawnedRef = useRef(false);
  const { theme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    shouldFitRef.current = shouldFit;
  }, [shouldFit]);

  const cancelScheduledFit = useCallback(() => {
    if (fitFrameRef.current !== null) {
      cancelAnimationFrame(fitFrameRef.current);
      fitFrameRef.current = null;
    }
    if (readyTimerRef.current) {
      clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }
  }, []);

  const fitTerminal = useCallback(
    (syncPty: boolean) => {
      const element = containerRef.current;
      const term = terminalRef.current;
      const fitAddon = fitAddonRef.current;

      if (!shouldFitRef.current || !element || !term || !fitAddon) return false;
      if (element.clientWidth === 0 || element.clientHeight === 0) return false;

      try {
        fitAddon.fit();
      } catch {
        return false;
      }

      if (term.cols === 0 || term.rows === 0) return false;

      term.refresh(0, Math.max(term.rows - 1, 0));

      const sizeKey = `${element.clientWidth}x${element.clientHeight}:${term.cols}x${term.rows}`;

      if (spawnedRef.current) {
        if (syncPty && lastSizeRef.current !== sizeKey) {
          lastSizeRef.current = sizeKey;
          resize(term.cols, term.rows).catch(console.error);
        }
        return true;
      }

      lastSizeRef.current = sizeKey;
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      readyTimerRef.current = setTimeout(() => {
        const liveElement = containerRef.current;
        const liveTerminal = terminalRef.current;

        if (!shouldFitRef.current || !liveElement || !liveTerminal) return;

        const stableSizeKey = `${liveElement.clientWidth}x${liveElement.clientHeight}:${liveTerminal.cols}x${liveTerminal.rows}`;
        if (stableSizeKey === sizeKey) {
          setReady(true);
        }
      }, 80);

      return true;
    },
    [resize],
  );

  const scheduleFit = useCallback(
    (syncPty: boolean, attempts = 8) => {
      cancelScheduledFit();

      const run = (remainingAttempts: number) => {
        fitFrameRef.current = requestAnimationFrame(() => {
          fitFrameRef.current = null;

          if (fitTerminal(syncPty)) return;
          if (remainingAttempts > 0) run(remainingAttempts - 1);
        });
      };

      run(attempts);
    },
    [cancelScheduledFit, fitTerminal],
  );

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      theme: isDark ? DARK_THEME : LIGHT_THEME,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      // Canvas renderer fallback
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    setTerminal(term);
    scheduleFit(false);

    // Debounced resize to avoid rapid pty_resize calls during panel drags
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        scheduleFit(true, 2);
      }, 50);
    });
    observer.observe(containerRef.current);

    if ("fonts" in document) {
      document.fonts.ready.then(() => {
        scheduleFit(true);
      });
    }

    return () => {
      cancelScheduledFit();
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cancelScheduledFit, scheduleFit]);

  // Update theme dynamically
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDark]);

  // Hidden focused sessions are mounted with display:none, so we wait until
  // the terminal is actually visible and measured before first spawn.
  useEffect(() => {
    if (!terminal || !shouldFit) return;
    scheduleFit(true);
  }, [terminal, shouldFit, scheduleFit]);

  // Spawn PTY only after terminal is fitted with correct dimensions
  useEffect(() => {
    if (!terminal || !ready || spawnedRef.current) return;
    spawnedRef.current = true;

    const doSpawn = async () => {
      try {
        await spawn({
          command,
          args,
          cwd: cwd ?? undefined,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      } catch (err) {
        terminal.write(`\r\nError: ${err}\r\n`);
      }
    };
    doSpawn();
  }, [terminal, ready, command, args, cwd, spawn]);

  // Forward resize events to PTY
  useEffect(() => {
    if (!terminal) return;
    const disposable = terminal.onResize(({ cols, rows }) => {
      resize(cols, rows).catch(console.error);
    });
    return () => disposable.dispose();
  }, [terminal, resize]);

  return (
    <div className="size-full bg-background p-2 border-0">
      <div
        ref={containerRef}
        className="size-full border-0"
      />
    </div>
  );
}
