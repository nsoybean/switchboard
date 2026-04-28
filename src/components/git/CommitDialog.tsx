import { useState } from "react";
import { flushSync } from "react-dom";
import { ArrowUp, GitBranch, GitCommit, GitPullRequest } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ChangedFile } from "@/lib/tauri-commands";
import { CreatePrDialog } from "./CreatePrDialog";

type NextStep = "commit" | "commit-push" | "commit-pr";

interface CommitDialogProps {
  open: boolean;
  onClose: () => void;
  branch: string;
  files: ChangedFile[];
  additions: number;
  deletions: number;
  cwd: string;
  githubToken: string | null;
  branchActionPending: boolean;
  onCommit: (message: string) => Promise<void>;
  onStageAll: () => Promise<void>;
  onPush: () => Promise<void>;
}

export function CommitDialog({
  open,
  onClose,
  branch,
  files,
  additions,
  deletions,
  cwd,
  githubToken,
  branchActionPending,
  onCommit,
  onStageAll,
  onPush,
}: CommitDialogProps) {
  const [commitMsg, setCommitMsg] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(false);
  const [nextStep, setNextStep] = useState<NextStep>("commit");
  const [pending, setPending] = useState(false);
  const [prDialogOpen, setPrDialogOpen] = useState(false);

  const unstagedCount = files.filter((f) => !f.staged).length;
  const stagedCount = files.filter((f) => f.staged).length;
  const fileCount = includeUnstaged ? files.length : stagedCount;
  const pushLabel = "Push";
  const canPr = !!githubToken;

  const handleContinue = async () => {
    if (!commitMsg.trim() || pending || branchActionPending) return;

    flushSync(() => setPending(true));
    try {
      if (includeUnstaged && unstagedCount > 0) {
        await onStageAll();
      }
      await onCommit(commitMsg.trim());

      if (nextStep === "commit-push") {
        await onPush();
        handleClose();
      } else if (nextStep === "commit-pr") {
        handleClose();
        setPrDialogOpen(true);
      } else {
        handleClose();
      }
    } finally {
      setPending(false);
    }
  };

  const handleClose = () => {
    setCommitMsg("");
    setIncludeUnstaged(true);
    setNextStep("commit");
    setPending(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Commit your changes</DialogTitle>
            <DialogDescription>
              Stage and commit to <span className="font-mono">{branch}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 pt-2">
            {/* Branch + changes summary */}
            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Branch</span>
                <span className="flex items-center gap-1.5 font-mono font-medium">
                  <GitBranch className="size-3 text-muted-foreground" />
                  {branch}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Changes</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{fileCount} {fileCount === 1 ? "file" : "files"}</span>
                  {additions > 0 && (
                    <span className="text-[var(--sb-diff-add-fg)]">+{additions}</span>
                  )}
                  {deletions > 0 && (
                    <span className="text-[var(--sb-diff-del-fg)]">-{deletions}</span>
                  )}
                </span>
              </div>
            </div>

            {/* Include unstaged */}
            {unstagedCount > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={includeUnstaged}
                  onCheckedChange={(v) => setIncludeUnstaged(v === true)}
                  className="size-3.5"
                />
                <span>Include unstaged</span>
                <span className="ml-auto">
                  {unstagedCount} {unstagedCount === 1 ? "file" : "files"}
                </span>
              </label>
            )}

            {/* Commit message */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Commit message
              </label>
              <Textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Describe your changes..."
                rows={3}
                autoFocus
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    void handleContinue();
                  }
                  if (e.key === "Escape") {
                    handleClose();
                  }
                }}
              />
            </div>

            {/* Next steps */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                After commit
              </label>
              <div className="flex flex-col rounded-md border overflow-hidden">
                <NextStepItem
                  icon={<GitCommit className="size-3.5" />}
                  label="Commit"
                  selected={nextStep === "commit"}
                  onSelect={() => setNextStep("commit")}
                />
                <NextStepItem
                  icon={<ArrowUp className="size-3.5" />}
                  label={`Commit & ${pushLabel}`}
                  selected={nextStep === "commit-push"}
                  onSelect={() => setNextStep("commit-push")}
                  bordered
                />
                <NextStepItem
                  icon={<GitPullRequest className="size-3.5" />}
                  label="Commit & Create PR"
                  selected={nextStep === "commit-pr"}
                  disabled={!canPr}
                  disabledReason="Add a GitHub token in Settings to create PRs"
                  onSelect={() => canPr && setNextStep("commit-pr")}
                  bordered
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleContinue()}
                disabled={!commitMsg.trim() || pending || branchActionPending}
              >
                {pending ? (
                  <>
                    <Spinner className="size-3" />
                    Working...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {githubToken && (
        <CreatePrDialog
          open={prDialogOpen}
          onClose={() => setPrDialogOpen(false)}
          cwd={cwd}
          githubToken={githubToken}
        />
      )}
    </>
  );
}

interface NextStepItemProps {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  disabled?: boolean;
  disabledReason?: string;
  bordered?: boolean;
  onSelect: () => void;
}

function NextStepItem({
  icon,
  label,
  selected,
  disabled,
  bordered,
  onSelect,
}: NextStepItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 text-xs transition-colors text-left w-full",
        bordered && "border-t",
        selected
          ? "bg-accent/60 text-foreground"
          : "text-muted-foreground hover:bg-muted/45 hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      <span className={cn(selected ? "text-foreground" : "text-muted-foreground")}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {selected && <span className="text-base leading-none text-muted-foreground">✓</span>}
    </button>
  );
}
