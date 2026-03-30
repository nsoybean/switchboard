import Image from "next/image";
import { GitBranch, GitPullRequestArrow, RadioTower } from "lucide-react";
import type { ReactNode } from "react";

function MonoVisualFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[0.95rem] border border-border bg-muted p-3">
      <div className="rounded-[0.8rem] border border-border bg-background p-3">
        {children}
      </div>
    </div>
  );
}

function WorktreeVisual() {
  return (
    <MonoVisualFrame>
      <div className="overflow-hidden rounded-[0.75rem] border border-border bg-background">
        <Image
          src="/switchboard/grid_view.png"
          alt="Switchboard grid view showing multiple agent sessions in parallel"
          width={2782}
          height={1786}
          className="w-full"
        />
      </div>
    </MonoVisualFrame>
  );
}

function AttentionVisual() {
  return (
    <MonoVisualFrame>
      <div className="flex min-h-40 items-center justify-center gap-5 py-4">
        <span className="size-6 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_5px_rgba(255,255,255,0.1)]" />
        <span className="size-6 rounded-full bg-sky-500 shadow-[0_0_0_5px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_5px_rgba(255,255,255,0.1)]" />
        <span className="size-7 rounded-full bg-amber-400 shadow-[0_0_0_6px_rgba(255,255,255,0.92)] dark:shadow-[0_0_0_6px_rgba(255,255,255,0.12)] animate-[attention-bob_1.15s_ease-in-out_infinite]" />
        <span className="size-6 rounded-full bg-rose-500 shadow-[0_0_0_5px_rgba(255,255,255,0.9)] dark:shadow-[0_0_0_5px_rgba(255,255,255,0.1)]" />
      </div>
    </MonoVisualFrame>
  );
}

function ReviewVisual() {
  return (
    <div className="rounded-[0.95rem] border border-border bg-muted p-2">
      <div className="overflow-hidden rounded-[0.8rem] border border-border bg-background">
        <Image
          src="/switchboard/git_panel.png"
          alt="Switchboard git panel showing branch, changes, and diff review"
          width={1080}
          height={1032}
          className="block w-full"
        />
      </div>
    </div>
  );
}

const values = [
  {
    title: "Code in parallel worktrees",
    description:
      "Use separate branches and worktrees so multiple tasks can move at once.",
    icon: GitBranch,
    visual: <WorktreeVisual />,
  },
  {
    title: "See what needs attention",
    description:
      "Track running, blocked, and finished sessions without terminal-tab roulette.",
    icon: RadioTower,
    visual: <AttentionVisual />,
  },
  {
    title: "Built-in git workflow",
    description:
      "Inspect diffs, manage branches, and ship changes from the same app.",
    icon: GitPullRequestArrow,
    visual: <ReviewVisual />,
  },
];

export function HowItWorks() {
  return (
    <section id="why-switchboard" className="py-20 sm:py-28">
      <div className="container-shell">
        <div className="mx-auto max-w-3xl text-center">
          <div className="section-eyebrow">Why Switchboard</div>
          <h2 className="mt-6 text-balance text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-5xl">
            Keep the terminal workflow. Lose the coordination mess.
          </h2>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {values.map(({ title, description, icon: Icon, visual }) => (
            <article key={title} className="panel-surface p-6">
              <div className="flex size-10 items-center justify-center rounded-lg bg-foreground text-background">
                <Icon className="size-4" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {description}
              </p>
              <div className="mt-5">{visual}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
