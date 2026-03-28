import {
  Layers,
  TerminalSquare,
  GitBranch,
  LayoutGrid,
} from "lucide-react";
import type { ReactNode } from "react";

const features: { icon: ReactNode; title: string; description: string }[] = [
  {
    icon: <Layers className="h-5 w-5" />,
    title: "Parallel Agent Sessions",
    description:
      "Spin up multiple Claude Code, Codex, or custom agent sessions simultaneously — each in its own isolated git worktree.",
  },
  {
    icon: <LayoutGrid className="h-5 w-5" />,
    title: "Focused & Multi-View",
    description:
      "Switch between a single focused session or view all running agents side-by-side in a tiled layout.",
  },
  {
    icon: <TerminalSquare className="h-5 w-5" />,
    title: "Live PTY Terminals",
    description:
      "Full terminal emulation powered by xterm.js — exactly the same experience as running agents in your own shell.",
  },
  {
    icon: <GitBranch className="h-5 w-5" />,
    title: "Git Workflow Manager",
    description:
      "Create branches, review diffs, and manage worktrees directly within the app. No context switching required.",
  },
];

export function Features() {
  return (
    <section className="border-t border-border/40 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          Everything you need to orchestrate AI agents
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm text-muted-foreground">
          A native desktop app built for developers who run multiple coding
          agents at once.
        </p>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border/50 bg-muted/20 p-6 transition-colors hover:border-border hover:bg-muted/40"
            >
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                {f.icon}
              </div>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
