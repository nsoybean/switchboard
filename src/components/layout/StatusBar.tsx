import { useState } from "react";
import { GitBranch, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { BranchPicker } from "@/components/git/BranchPicker";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { CreatePrDialog } from "@/components/git/CreatePrDialog";
import type { GitState, GitActions } from "@/hooks/useGitState";

interface StatusBarProps {
  git: GitState & GitActions;
  cwd: string | null;
  branchPrefix?: string;
  githubToken?: string | null;
  onNewSession?: () => void;
  onOpenSettings?: () => void;
}

export function StatusBar({
  git,
  cwd,
  branchPrefix,
  githubToken,
  onNewSession,
  onOpenSettings,
}: StatusBarProps) {
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createPrOpen, setCreatePrOpen] = useState(false);

  const hasBranch = !!git.branch;
  const hasGitHub = !!githubToken && !!cwd;

  return (
    <>
      <div className="flex h-7 shrink-0 items-center border-t bg-card px-2 text-[11px]">
        {/* Left section */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-5 text-muted-foreground hover:text-foreground"
                onClick={onOpenSettings}
              >
                <Settings className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-3" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-5 text-muted-foreground hover:text-foreground"
                onClick={onNewSession}
              >
                <Plus className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Session</TooltipContent>
          </Tooltip>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Center: branch picker */}
        {hasBranch && cwd && (
          <div className="flex items-center gap-1.5">
            <GitBranch className="size-3 text-muted-foreground" />
            <BranchPicker
              branches={git.branches}
              loading={git.branchesLoading && git.branches.length === 0}
              value={git.branch}
              disabled={git.branchActionPending}
              triggerClassName="h-5 min-w-0 max-w-[200px] gap-1.5 border-0 bg-transparent px-1 text-[11px] font-medium shadow-none hover:bg-accent/50"
              createLabel="Create branch..."
              onSelect={(branchName) => void git.switchBranch(branchName)}
              onCreateBranch={() => setCreateBranchOpen(true)}
            />
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right section */}
        <div className="flex items-center gap-1">
          {hasGitHub && hasBranch && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setCreatePrOpen(true)}
            >
              Create PR
            </Button>
          )}

        </div>
      </div>

      {/* Dialogs */}
      {cwd && (
        <CreateBranchDialog
          open={createBranchOpen}
          onOpenChange={setCreateBranchOpen}
          defaultBranchPrefix={branchPrefix}
          pending={git.branchActionPending}
          onCreate={async (branchName) => {
            await git.createBranch(branchName);
            setCreateBranchOpen(false);
          }}
        />
      )}

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
