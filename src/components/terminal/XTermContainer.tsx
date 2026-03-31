import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
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

  // Simple fit: just call fitAddon.fit(). No scroll hacks, no sizeKey
  // deduplication. PTY resize is handled by term.onResize listener (below),
  // matching collab-public's approach exactly.
  const doFit = useCallback(() => {
    const element = containerRef.current;
    const fitAddon = fitAddonRef.current;
    if (!shouldFitRef.current || !element || !fitAddon) return;
    if (element.clientWidth === 0 || element.clientHeight === 0) return;
    try {
      fitAddon.fit();
    } catch {
      // ignore
    }
  }, []);

  // Schedule initial fit with retry for layout settling
  const scheduleFit = useCallback(
    (attempts = 2) => {
      cancelScheduledFit();

      const run = (remainingAttempts: number) => {
        fitFrameRef.current = requestAnimationFrame(() => {
          fitFrameRef.current = null;
          doFit();

          // Before first spawn, confirm layout is stable via double-RAF
          if (!spawnedRef.current) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const el = containerRef.current;
                const term = terminalRef.current;
                if (shouldFitRef.current && el && term && el.clientWidth > 0 && term.cols > 0) {
                  setReady(true);
                }
              });
            });
            return;
          }

          if (remainingAttempts > 0) run(remainingAttempts - 1);
        });
      };

      run(attempts);
    },
    [cancelScheduledFit, doFit],
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
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    // WebGL renderer: double-buffered canvas avoids partial-paint
    // artifacts the DOM renderer can show during rapid sequential writes.
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      // DOM renderer fallback
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    setTerminal(term);
    scheduleFit();

    // rAF-coalesced resize: cancels pending frame and schedules a new one,
    // so rapid resize events (panel drags) collapse to a single fit per frame
    // (~16ms). Calls doFit directly — no wrapper overhead.
    let resizeRafId = 0;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        cancelAnimationFrame(resizeRafId);
        resizeRafId = requestAnimationFrame(() => doFit());
      }
    });
    observer.observe(containerRef.current);

    // PTY resize via term.onResize — fires synchronously after fit()
    // changes cols/rows. Matches collab-public's approach. This is the
    // fastest path: no sizeKey checks, no async wrapper overhead.
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      resize(cols, rows).catch(console.error);
    });

    if ("fonts" in document) {
      document.fonts.ready.then(() => scheduleFit());
    }

    return () => {
      cancelScheduledFit();
      cancelAnimationFrame(resizeRafId);
      resizeDisposable.dispose();
      observer.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cancelScheduledFit, scheduleFit, doFit, resize]);

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
    scheduleFit();
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

  return (
    <div className="relative size-full bg-background p-2 border-0">
      <div ref={containerRef} className="size-full border-0" />
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
