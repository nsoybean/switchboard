import Image from "next/image";
import { Files, FolderTree, GitCompareArrows, History } from "lucide-react";

const productPoints = [
  {
    title: "Workspace identity stays visible",
    description:
      "Session-scoped files and git changes share the same inspected root so you can see which branch, worktree, and path a task actually owns.",
    icon: FolderTree,
  },
  {
    title: "History is part of the workflow",
    description:
      "Reopen Claude Code and Codex sessions from local storage, inspect their structured transcript, then resume back into a live terminal when needed.",
    icon: History,
  },
  {
    title: "Review never leaves the app",
    description:
      "Diffs, staging, commits, pushes, and PR creation all happen in the same product surface that launched the session in the first place.",
    icon: GitCompareArrows,
  },
];

export function ProductShowcase() {
  return (
    <section id="product" className="py-20 sm:py-28">
      <div className="container-shell">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div>
            <div className="section-eyebrow">Product</div>
            <h2 className="mt-6 max-w-xl text-balance text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-5xl">
              One desktop surface for launching, supervising, and shipping agent
              work.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
              The desktop app brings together the three pieces that are usually
              scattered across terminal tabs and side tools: live PTY sessions,
              workspace inspection, and git review.
            </p>

            <div className="mt-8 grid gap-4">
              {productPoints.map(({ title, description, icon: Icon }) => (
                <div key={title} className="panel-surface p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-foreground text-background">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">{title}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-surface overflow-hidden p-3 sm:p-4">
            <div className="rounded-[1.6rem] border border-border bg-panel-muted p-3">
              <div className="flex items-center justify-between rounded-[1.2rem] border border-border bg-panel px-4 py-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Files className="size-4" />
                  session workspace inspector
                </div>
                <span className="rounded-full border border-border px-2 py-1">
                  worktree scoped
                </span>
              </div>

              <div className="relative mt-3 overflow-hidden rounded-[1.3rem] border border-border bg-terminal">
                <Image
                  src="/switchboard/main_dark_mode.png"
                  alt="Switchboard in dark mode showing the main workspace, session list, and git panel"
                  width={2784}
                  height={1788}
                  className="w-full"
                />
                <div className="pointer-events-none absolute left-4 top-4 rounded-2xl border border-white/10 bg-black/65 px-3 py-2 text-[0.72rem] text-white/80 shadow-xl">
                  <p className="uppercase tracking-[0.18em] text-white/45">
                    session
                  </p>
                  <p className="mt-1">codex/archive-in-repo-details</p>
                </div>
                <div className="pointer-events-none absolute bottom-4 right-4 rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-[0.72rem] text-white/80 shadow-xl">
                  <p className="uppercase tracking-[0.18em] text-white/45">
                    review surface
                  </p>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      10 changes
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      ready to merge
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.2rem] border border-border bg-panel px-4 py-3">
                  <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Session source
                  </p>
                  <p className="mt-2 text-sm">Live PTY + transcript history</p>
                </div>
                <div className="rounded-[1.2rem] border border-border bg-panel px-4 py-3">
                  <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Git model
                  </p>
                  <p className="mt-2 text-sm">Stage, commit, push, PR</p>
                </div>
                <div className="rounded-[1.2rem] border border-border bg-panel px-4 py-3">
                  <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Launch root
                  </p>
                  <p className="mt-2 text-sm">Project or isolated worktree</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
