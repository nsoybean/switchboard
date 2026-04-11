import { useState } from "react";
import { Button } from "@/components/ui/button";
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

  const hasBranch = !!git.branch;
  const hasGitHub = !!githubToken && !!cwd;

  if (!hasGitHub || !hasBranch) {
    return null;
  }

  return (
    <>
      <div className="flex h-7 shrink-0 items-center border-t bg-card px-2 text-[11px]">
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-5 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setCreatePrOpen(true)}
        >
          Create PR
        </Button>
      </div>

      <CreatePrDialog
        open={createPrOpen}
        onClose={() => setCreatePrOpen(false)}
        cwd={cwd!}
        githubToken={githubToken!}
      />
    </>
  );
}
