import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { usePty } from "../../hooks/usePty";
import { useTheme } from "@/components/theme-provider";
import { Spinner } from "@/components/ui/spinner";
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
  env?: Record<string, string>;
  isActive?: boolean;
  onSpawn?: (ptyId: number) => void;
  onExit?: (code: number | null) => void;
}

export function XTermContainer({
  command = "/bin/bash",
  args = [],
  cwd,
  env,
  isActive,
  onSpawn,
  onExit,
}: XTermContainerProps) {
  const shouldFit = isActive ?? true;
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const lastSizeRef = useRef<string | null>(null);
  const shouldFitRef = useRef(shouldFit);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [ready, setReady] = useState(false);
  const [hasOutput, setHasOutput] = useState(false);
  const handleFirstOutput = useCallback(() => setHasOutput(true), []);
  const { spawn, resize } = usePty(terminal, onExit, handleFirstOutput);
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

      const sizeKey = `${element.clientWidth}x${element.clientHeight}:${term.cols}x${term.rows}`;

      if (spawnedRef.current) {
        if (syncPty && lastSizeRef.current !== sizeKey) {
          lastSizeRef.current = sizeKey;
          resize(term.cols, term.rows).catch(console.error);
        }
        return true;
      }

      lastSizeRef.current = sizeKey;
      // Double-RAF: first frame lets layout settle, second confirms stability (~32ms)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const liveElement = containerRef.current;
          const liveTerminal = terminalRef.current;

          if (!shouldFitRef.current || !liveElement || !liveTerminal) return;

          const stableSizeKey = `${liveElement.clientWidth}x${liveElement.clientHeight}:${liveTerminal.cols}x${liveTerminal.rows}`;
          if (stableSizeKey === sizeKey) {
            setReady(true);
          }
        });
      });

      return true;
    },
    [resize],
  );

  const scheduleFit = useCallback(
    (syncPty: boolean, attempts = 2) => {
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
      scrollback: 200_000,
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

    // rAF-coalesced resize: cancels pending frame and schedules a new one,
    // so rapid resize events (panel drags) collapse to a single fit per frame
    // (~16ms) instead of the previous 50ms setTimeout debounce.
    let resizeRafId = 0;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => {
          scheduleFit(true, 1);
        });
      }
    });
    observer.observe(containerRef.current);

    if ("fonts" in document) {
      document.fonts.ready.then(() => {
        scheduleFit(true);
      });
    }

    return () => {
      cancelScheduledFit();
      cancelAnimationFrame(resizeRafId);
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
        const ptyId = await spawn({
          command,
          args,
          cwd: cwd ?? undefined,
          cols: terminal.cols,
          rows: terminal.rows,
          env,
        });
        onSpawn?.(ptyId);
      } catch (err) {
        terminal.write(`\r\nError: ${err}\r\n`);
      }
    };
    doSpawn();
  }, [terminal, ready, command, args, cwd, env, spawn, onSpawn]);

  // Note: PTY resize is handled inside fitTerminal(syncPty=true) which
  // deduplicates by sizeKey. No separate terminal.onResize listener needed —
  // that would cause a redundant second pty_resize IPC call per resize.

  return (
    <div className="relative size-full bg-background p-2 border-0">
      <div
        ref={containerRef}
        className="size-full border-0"
      />
      {!hasOutput && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Spinner className="size-5" />
            <span className="text-xs">Starting session…</span>
          </div>
        </div>
      )}
    </div>
  );
}
