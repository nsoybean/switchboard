import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { BranchPicker } from "@/components/git/BranchPicker";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { getBranchPrefix } from "@/lib/branches";
import type { AgentType } from "../../state/types";
import { gitCommands, type GitBranchInfo } from "../../lib/tauri-commands";

interface NewSessionDialogProps {
  open: boolean;
  projectPath: string | null;
  onClose: () => void;
  onSubmit: (config: {
    agent: AgentType;
    label: string;
    task: string;
    useWorktree: boolean;
    baseBranch: string | null;
  }) => void;
}

const AGENTS: { id: AgentType; name: string }[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "bash", name: "Bash" },
];

export function NewSessionDialog({
  open,
  projectPath,
  onClose,
  onSubmit,
}: NewSessionDialogProps) {
  const [agent, setAgent] = useState<AgentType>("claude-code");
  const [label, setLabel] = useState("");
  const [task, setTask] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [baseBranch, setBaseBranch] = useState("");
  const [createBranchPending, setCreateBranchPending] = useState(false);
  const defaultBranchPrefix = getBranchPrefix(agent);

  useEffect(() => {
    if (!open || !projectPath || !useWorktree) {
      return;
    }

    let cancelled = false;
    setBranchesLoading(true);

    gitCommands
      .listBranches(projectPath)
      .then((nextBranches) => {
        if (cancelled) return;
        setBranches(nextBranches);
        setBaseBranch((currentValue) => {
          if (
            currentValue &&
            nextBranches.some((branch) => branch.name === currentValue)
          ) {
            return currentValue;
          }

          return (
            nextBranches.find((branch) => branch.is_current)?.name ??
            nextBranches[0]?.name ??
            ""
          );
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setBranches([]);
        setBaseBranch("");
        toast.error("Failed to load branches", {
          description: String(error),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setBranchesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, projectPath, useWorktree]);

  const disableSubmit = useWorktree && (branchesLoading || !baseBranch);

  const refreshBranches = async (nextSelectedBranch?: string) => {
    if (!projectPath) return;

    const nextBranches = await gitCommands.listBranches(projectPath);
    setBranches(nextBranches);
    setBaseBranch((currentValue) => {
      if (
        nextSelectedBranch &&
        nextBranches.some((branch) => branch.name === nextSelectedBranch)
      ) {
        return nextSelectedBranch;
      }

      if (
        currentValue &&
        nextBranches.some((branch) => branch.name === currentValue)
      ) {
        return currentValue;
      }

      return (
        nextBranches.find((branch) => branch.is_current)?.name ??
        nextBranches[0]?.name ??
        ""
      );
    });
  };

  const handleCreateBranch = async (branchName: string) => {
    if (!projectPath) return;

    try {
      setCreateBranchPending(true);
      await gitCommands.createBranch(projectPath, branchName);
      await refreshBranches(branchName);
      setCreateBranchOpen(false);
    } catch (error) {
      toast.error("Failed to create branch", {
        description: String(error),
      });
    } finally {
      setCreateBranchPending(false);
    }
  };

  const handleSubmit = () => {
    onSubmit({
      agent,
      label: label.trim() || `${agent}-${Date.now().toString(36)}`,
      task: task.trim(),
      useWorktree,
      baseBranch: useWorktree ? baseBranch : null,
    });
    setLabel("");
    setTask("");
    setUseWorktree(false);
    setBaseBranch("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
          <DialogDescription>
            Launch a new AI coding agent session.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {/* Agent picker */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Agent
            </label>
            <ToggleGroup
              type="single"
              value={agent}
              onValueChange={(v) => v && setAgent(v as AgentType)}
              className="justify-start"
            >
              {AGENTS.map((a) => (
                <ToggleGroupItem
                  key={a.id}
                  value={a.id}
                  className="text-xs data-[state=on]:bg-black data-[state=on]:text-white hover:data-[state=on]:bg-black/90"
                >
                  {a.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Label */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Session Label (optional)
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. auth-refactor"
            />
          </div>

          {/* Task description */}
          {agent !== "bash" && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Instructions (optional)
              </label>
              <Textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Describe what you want the agent to do..."
                rows={3}
              />
            </div>
          )}

          {/* Worktree toggle */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Checkbox
                id="worktree"
                checked={useWorktree}
                onCheckedChange={(checked) =>
                  setUseWorktree(checked === true)
                }
              />
              <label
                htmlFor="worktree"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                New worktree
              </label>
            </div>
            {useWorktree && (
              <div className="pl-6 pt-0.5 space-y-3">
                <p className="text-[11px] text-muted-foreground/70">
                  Create isolated working directory.
                </p>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    From Branch
                  </label>
                  {branchesLoading ? (
                    <BranchPicker
                      branches={branches}
                      loading
                      value={baseBranch}
                      onSelect={setBaseBranch}
                    />
                  ) : (
                    <BranchPicker
                      branches={branches}
                      value={baseBranch}
                      onSelect={setBaseBranch}
                      onCreateBranch={() => setCreateBranchOpen(true)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={disableSubmit}>
              Start Session
            </Button>
          </div>
        </div>
      </DialogContent>

      <CreateBranchDialog
        open={createBranchOpen}
        onOpenChange={setCreateBranchOpen}
        defaultBranchPrefix={defaultBranchPrefix}
        pending={createBranchPending}
        onCreate={handleCreateBranch}
      />
    </Dialog>
  );
}
