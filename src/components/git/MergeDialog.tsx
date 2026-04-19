import { useState } from "react";
import { GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { GitBranchInfo, MergeStrategy } from "@/lib/tauri-commands";

interface MergeDialogProps {
  open: boolean;
  onClose: () => void;
  /** The branch that will be merged IN (source). Null → picker mode */
  sourceBranch?: string | null;
  /** The branch that will receive the merge (target = current branch) */
  targetBranch: string;
  branches: GitBranchInfo[];
  onMerge: (sourceBranch: string, strategy: MergeStrategy) => Promise<void>;
  /** Show worktree cleanup option */
  worktreePath?: string | null;
  onCleanup?: (deleteRemote: boolean) => Promise<void>;
}

const STRATEGY_LABELS: Record<MergeStrategy, { label: string; description: string }> = {
  merge: { label: "Merge commit", description: "Creates a merge commit preserving branch history" },
  squash: { label: "Squash merge", description: "Squashes all commits into one before merging" },
  rebase: { label: "Rebase", description: "Replays commits on top of the target branch" },
};

export function MergeDialog({
  open,
  onClose,
  sourceBranch,
  targetBranch,
  branches,
  onMerge,
  worktreePath,
  onCleanup,
}: MergeDialogProps) {
  const [selectedSource, setSelectedSource] = useState(sourceBranch ?? "");
  const [strategy, setStrategy] = useState<MergeStrategy>("merge");
  const [cleanupAfter, setCleanupAfter] = useState(true);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [merging, setMerging] = useState(false);
  const [step, setStep] = useState<"config" | "done">("config");

  const localBranches = branches.filter((b) => !b.is_remote && b.name !== targetBranch);
  const effectiveSource = sourceBranch ?? selectedSource;

  const handleMerge = async () => {
    if (!effectiveSource || merging) return;
    setMerging(true);
    try {
      await onMerge(effectiveSource, strategy);
      if (cleanupAfter && onCleanup && worktreePath) {
        await onCleanup(deleteRemote);
      }
      setStep("done");
    } finally {
      setMerging(false);
    }
  };

  const handleClose = () => {
    setStep("config");
    setMerging(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <GitMerge className="size-4" />
            Merge branch
          </DialogTitle>
        </DialogHeader>

        {step === "done" ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Merge complete</p>
            <p className="mt-1 text-xs">
              {effectiveSource} was merged into {targetBranch}.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {/* Source branch */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Source branch</label>
              {sourceBranch ? (
                <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 font-mono text-xs">
                  {sourceBranch}
                </div>
              ) : (
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="h-9 font-mono text-xs">
                    <SelectValue placeholder="Select branch to merge..." />
                  </SelectTrigger>
                  <SelectContent>
                    {localBranches.map((b) => (
                      <SelectItem key={b.name} value={b.name} className="font-mono text-xs">
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="text-[11px] text-muted-foreground">
                → into <span className="font-mono text-foreground">{targetBranch}</span>
              </span>
            </div>

            {/* Strategy */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Strategy</label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as MergeStrategy)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(STRATEGY_LABELS) as [MergeStrategy, { label: string; description: string }][]).map(
                    ([key, { label }]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {STRATEGY_LABELS[strategy].description}
              </p>
            </div>

            {/* Cleanup option (only when worktree context) */}
            {worktreePath && onCleanup && (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={cleanupAfter}
                    onCheckedChange={(v) => setCleanupAfter(v === true)}
                    className="size-3.5"
                  />
                  <span className="text-xs">Remove worktree and delete branch after merge</span>
                </label>
                {cleanupAfter && (
                  <label className="flex cursor-pointer items-center gap-2 pl-5">
                    <Checkbox
                      checked={deleteRemote}
                      onCheckedChange={(v) => setDeleteRemote(v === true)}
                      className="size-3.5"
                    />
                    <span className="text-xs text-muted-foreground">Also delete remote branch</span>
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "done" ? (
            <Button size="sm" onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleClose} disabled={merging}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void handleMerge()}
                disabled={!effectiveSource || merging}
              >
                {merging ? (
                  <>
                    <Spinner className="size-3" />
                    Merging...
                  </>
                ) : (
                  "Merge"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
