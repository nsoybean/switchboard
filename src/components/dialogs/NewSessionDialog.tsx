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
import { GitFork } from "lucide-react";
import { toast } from "sonner";
import { BranchPicker } from "@/components/git/BranchPicker";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { ProjectPicker } from "@/components/projects/ProjectPicker";
import { getBranchPrefix } from "@/lib/branches";
import type { AgentType } from "../../state/types";
import { gitCommands, type GitBranchInfo } from "../../lib/tauri-commands";

interface NewSessionDialogProps {
  open: boolean;
  projectPath: string | null;
  projectPaths: string[];
  onClose: () => void;
  onSubmit: (config: {
    projectPath: string;
    agent: AgentType;
    label: string;
    isAutoLabel: boolean;
    task: string;
    useWorktree: boolean;
    baseBranch: string | null;
  }) => void;
}

const AGENTS: { id: AgentType; name: string }[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "bash", name: "Shell" },
];

export function NewSessionDialog({
  open,
  projectPath,
  projectPaths,
  onClose,
  onSubmit,
}: NewSessionDialogProps) {
  const [agent, setAgent] = useState<AgentType>("claude-code");
  const [label, setLabel] = useState("");
  const [task, setTask] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(projectPath);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [baseBranch, setBaseBranch] = useState("");
  const [createBranchPending, setCreateBranchPending] = useState(false);
  const defaultBranchPrefix = getBranchPrefix(agent);

  useEffect(() => {
    if (!open) return;

    setSelectedProjectPath((current) => {
      if (current && projectPaths.includes(current)) {
        return current;
      }
      if (projectPath && projectPaths.includes(projectPath)) {
        return projectPath;
      }
      return projectPaths[0] ?? null;
    });
  }, [open, projectPath, projectPaths]);

  useEffect(() => {
    if (!open || !selectedProjectPath) {
      return;
    }

    let cancelled = false;
    setBranchesLoading(true);

    gitCommands
      .listBranches(selectedProjectPath)
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
  }, [open, selectedProjectPath]);

  const disableSubmit = !selectedProjectPath || (useWorktree && (branchesLoading || !baseBranch));

  const refreshBranches = async (nextSelectedBranch?: string) => {
    if (!selectedProjectPath) return;

    const nextBranches = await gitCommands.listBranches(selectedProjectPath);
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
    if (!selectedProjectPath) return;

    try {
      setCreateBranchPending(true);
      await gitCommands.createBranch(selectedProjectPath, branchName);
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
    if (!selectedProjectPath) return;

    const trimmedLabel = label.trim();
    onSubmit({
      projectPath: selectedProjectPath,
      agent,
      label: trimmedLabel,
      isAutoLabel: !trimmedLabel,
      task: task.trim(),
      useWorktree,
      baseBranch: baseBranch || null,
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
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Project
            </label>
            <ProjectPicker
              projects={projectPaths}
              value={selectedProjectPath}
              onSelect={setSelectedProjectPath}
            />
          </div>

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

          {/* Branch selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Branch
            </label>
            <BranchPicker
              branches={branches}
              loading={branchesLoading}
              value={baseBranch}
              onSelect={setBaseBranch}
              onCreateBranch={branchesLoading ? undefined : () => setCreateBranchOpen(true)}
            />
          </div>

          {/* Worktree toggle */}
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
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer"
            >
              <GitFork className="size-3.5" />
              New worktree
            </label>
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
