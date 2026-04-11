import { useMemo, useState } from "react";
import { ArrowRight, ChevronUp, ExternalLink, GitBranch, GitPullRequest } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreatePrDialog } from "@/components/git/CreatePrDialog";
import type { GitState } from "@/hooks/useGitState";

interface StatusBarProps {
  git: GitState;
  cwd: string | null;
  githubToken?: string | null;
}

export function StatusBar({
  git,
  cwd,
  githubToken,
}: StatusBarProps) {
  const [createPrOpen, setCreatePrOpen] = useState(false);
  const [targetBranch, setTargetBranch] = useState("origin/main");

  const hasBranch = !!git.branch;
  const hasGitHub = !!githubToken && !!cwd;

  const remoteBranches = useMemo(
    () =>
      git.branches
        .filter((b) => b.is_remote && b.name !== `origin/${git.branch}`)
        .map((b) => b.name),
    [git.branches, git.branch],
  );

  if (!hasBranch) {
    return null;
  }

  return (
    <>
      <div className="group/statusbar flex h-7 shrink-0 items-center border-t bg-card px-3 text-[11px]">
        {/* Left: branch → target */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <GitBranch className="size-3 shrink-0" />
          <span className="font-medium text-foreground">{git.branch}</span>

          <ArrowRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover/statusbar:opacity-100" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/statusbar:opacity-100"
              >
                {targetBranch}
                <ChevronUp className="size-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
              {remoteBranches.length > 0 ? (
                remoteBranches.map((branch) => (
                  <DropdownMenuItem
                    key={branch}
                    onSelect={() => setTargetBranch(branch)}
                    className="text-xs"
                  >
                    {branch}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled className="text-xs">
                  No remote branches
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Create PR */}
        {hasGitHub && (
          <Button
            variant="outline"
            size="sm"
            className="h-5 gap-1.5 px-2 text-[11px] opacity-0 transition-opacity group-hover/statusbar:opacity-100"
            onClick={() => setCreatePrOpen(true)}
          >
            <GitPullRequest className="size-3" />
            Create PR
            <ExternalLink className="size-2.5" />
          </Button>
        )}
      </div>

      {hasGitHub && cwd && (
        <CreatePrDialog
          open={createPrOpen}
          onClose={() => setCreatePrOpen(false)}
          cwd={cwd}
          githubToken={githubToken!}
        />
      )}
    </>
  );
}
