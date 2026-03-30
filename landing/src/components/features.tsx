import {
  ArrowUpRight,
  FolderTree,
  GitBranch,
  History,
  Keyboard,
  PanelsTopLeft,
} from "lucide-react";
import type { ReactNode } from "react";

type Feature = {
  title: string;
  description: string;
  icon: ReactNode;
  visual: ReactNode;
};

const features: Feature[] = [
  {
    title: "Parallel sessions without branch collisions",
    description:
      "Keep implementation, investigation, and shell tasks running at the same time while each session keeps a clear launch root.",
    icon: <PanelsTopLeft className="size-5" />,
    visual: (
      <div className="grid gap-2">
        {[
          ["claude/refactor-ui", "running"],
          ["codex/workspace-identity", "needs input"],
          ["bash/release-check", "done"],
        ].map(([name, status]) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-2xl border border-border bg-panel px-3 py-2 text-xs"
          >
            <span>{name}</span>
            <span className="text-muted-foreground">{status}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Worktree-aware from the moment you launch",
    description:
      "Project root, isolated worktree, and branch identity are part of the experience instead of hidden git trivia.",
    icon: <FolderTree className="size-5" />,
    visual: (
      <div className="rounded-[1.4rem] border border-border bg-panel p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">workspace strategy</span>
          <span className="rounded-full border border-border px-2 py-1">
            new isolated worktree
          </span>
        </div>
        <div className="mt-3 rounded-2xl bg-muted px-3 py-3">
          <p>.switchboard-worktrees/codex-auth</p>
          <p className="mt-1 text-muted-foreground">branch: codex/auth-refactor</p>
        </div>
      </div>
    ),
  },
  {
    title: "Transcript and history continuity",
    description:
      "Resume local Claude Code and Codex sessions, inspect structured transcripts, and keep past work part of the same operating surface.",
    icon: <History className="size-5" />,
    visual: (
      <div className="grid gap-2">
        {["live terminal", "transcript view", "file preview"].map((tab) => (
          <div
            key={tab}
            className="flex items-center justify-between rounded-2xl border border-border bg-panel px-3 py-2 text-xs"
          >
            <span>{tab}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Built-in git workflow",
    description:
      "Inspect diffs, stage files, commit, push, and open pull requests from the same window that launched the work.",
    icon: <GitBranch className="size-5" />,
    visual: (
      <div className="rounded-[1.4rem] border border-border bg-panel p-3 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>git panel</span>
          <span>10 changes</span>
        </div>
        <div className="mt-3 grid gap-2">
          {["src/App.tsx", "src/lib/agents.ts", "src/components/git/GitPanel.tsx"].map(
            (file, index) => (
              <div
                key={file}
                className="flex items-center justify-between rounded-2xl bg-muted px-3 py-2"
              >
                <span>{file}</span>
                <span>{index === 0 ? "+2 -1" : "+12 -4"}</span>
              </div>
            ),
          )}
        </div>
      </div>
    ),
  },
  {
    title: "Keyboard-friendly control surface",
    description:
      "Switch sessions, open the workspace inspector, and move through the app quickly without sacrificing the terminal-first workflow.",
    icon: <Keyboard className="size-5" />,
    visual: (
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["new session", "cmd+n"],
          ["toggle inspector", "cmd+g"],
          ["focus files", "cmd+e"],
          ["switch session", "ctrl+tab"],
        ].map(([action, shortcut]) => (
          <div
            key={action}
            className="rounded-2xl border border-border bg-panel px-3 py-2 text-xs"
          >
            <p>{action}</p>
            <p className="mt-2 text-muted-foreground">{shortcut}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Local-first by design",
    description:
      "Session persistence, Claude/Codex history reads, and metadata overlays all live on your machine, not behind a hosted black box.",
    icon: <History className="size-5" />,
    visual: (
      <div className="rounded-[1.4rem] border border-border bg-panel p-3 text-xs">
        <p className="text-muted-foreground">local data sources</p>
        <div className="mt-3 grid gap-2">
          {["~/.switchboard", "~/.claude", "~/.codex", "git CLI"].map((item) => (
            <div key={item} className="rounded-2xl bg-muted px-3 py-2">
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="container-shell">
        <div className="mx-auto max-w-3xl text-center">
          <div className="section-eyebrow">Features</div>
          <h2 className="mt-6 text-balance text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-5xl">
            Designed for the awkward realities of multi-agent coding.
          </h2>
          <p className="mt-5 text-base leading-8 text-muted-foreground">
            The strongest parts of the product are not generic AI features.
            They are the operational details that make parallel coding actually
            manageable day to day.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {features.map((feature) => (
            <article key={feature.title} className="panel-surface p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-foreground text-background">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                {feature.description}
              </p>
              <div className="mt-5">{feature.visual}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
