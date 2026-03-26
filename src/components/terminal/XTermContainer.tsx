import { useEffect, useRef, useState } from "react";
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
  onExit?: (code: number | null) => void;
}

export function XTermContainer({
  command = "/bin/bash",
  args = [],
  cwd,
  onExit,
}: XTermContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const { spawn, resize } = usePty(terminal, onExit);
  const spawnedRef = useRef(false);
  const { theme } = useTheme();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

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

    fitAddon.fit();
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    setTerminal(term);

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Update theme dynamically
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? DARK_THEME : LIGHT_THEME;
    }
  }, [isDark]);

  // Spawn PTY when terminal is ready
  useEffect(() => {
    if (!terminal || spawnedRef.current) return;
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
  }, [terminal, command, args, cwd, spawn]);

  // Forward resize events to PTY
  useEffect(() => {
    if (!terminal) return;
    const disposable = terminal.onResize(({ cols, rows }) => {
      resize(cols, rows).catch(console.error);
    });
    return () => disposable.dispose();
  }, [terminal, resize]);

  return (
    <div
      ref={containerRef}
      className="size-full bg-background"
    />
  );
}
