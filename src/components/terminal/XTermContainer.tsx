import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { usePty } from "../../hooks/usePty";
import "@xterm/xterm/css/xterm.css";
import "../../styles/terminal.css";

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

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      theme: {
        background: "#0d0d1a",
        foreground: "#e0e0e8",
        cursor: "#4a4aff",
        selectionBackground: "#2a2a50",
        black: "#1a1a2e",
        red: "#ff6b6b",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#4a4aff",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e0e0e8",
        brightBlack: "#555",
        brightRed: "#ff8a8a",
        brightGreen: "#6ee7a0",
        brightYellow: "#fcd34d",
        brightBlue: "#6b6bff",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f0f0f8",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

    // Try WebGL addon, fall back to canvas
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      // Canvas renderer fallback — no action needed
    }

    fitAddon.fit();
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    setTerminal(term);

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

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
      style={{
        width: "100%",
        height: "100%",
        background: "var(--sb-bg-terminal)",
      }}
    />
  );
}
