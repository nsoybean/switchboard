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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
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
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [baseBranch, setBaseBranch] = useState("");
  const [branchQuery, setBranchQuery] = useState("");

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

  useEffect(() => {
    if (!branchMenuOpen) {
      setBranchQuery("");
    }
  }, [branchMenuOpen]);

  const normalizedBranchQuery = branchQuery.trim().toLowerCase();
  const localBranches = branches.filter(
    (branch) =>
      !branch.is_remote &&
      (normalizedBranchQuery.length === 0 ||
        branch.name.toLowerCase().includes(normalizedBranchQuery)),
  );
  const remoteBranches = branches.filter(
    (branch) =>
      branch.is_remote &&
      (normalizedBranchQuery.length === 0 ||
        branch.name.toLowerCase().includes(normalizedBranchQuery)),
  );
  const branchSections = [
    { title: "Local branches", branches: localBranches },
    { title: "Remote branches", branches: remoteBranches },
  ].filter((section) => section.branches.length > 0);
  const selectedBranch = branches.find((branch) => branch.name === baseBranch);
  const disableSubmit = useWorktree && (branchesLoading || !baseBranch);

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
                    <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                      Loading branches...
                    </div>
                  ) : branches.length === 0 ? (
                    <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                      No branches available.
                    </div>
                  ) : (
                    <DropdownMenu
                      open={branchMenuOpen}
                      onOpenChange={setBranchMenuOpen}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 w-full justify-between px-3 text-sm font-normal"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">
                              {selectedBranch?.name ?? baseBranch}
                            </span>
                            {selectedBranch?.is_current ? (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-[10px]"
                              >
                                current
                              </Badge>
                            ) : null}
                          </span>
                          <ChevronDownIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] p-0">
                        <div className="border-b p-1">
                          <Input
                            value={branchQuery}
                            onChange={(e) => setBranchQuery(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder="Search branches..."
                            className="h-8 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
                          />
                        </div>
                        <ScrollArea className="h-48">
                          <div className="flex flex-col p-1">
                            {branchSections.length > 0 ? (
                              branchSections.map((section, sectionIndex) => (
                                <div key={section.title} className="flex flex-col">
                                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
                                    {section.title}
                                  </DropdownMenuLabel>
                                  {section.branches.map((branch) => (
                                    <DropdownMenuItem
                                      key={branch.name}
                                      onSelect={() => {
                                        setBaseBranch(branch.name);
                                        setBranchMenuOpen(false);
                                      }}
                                      className={cn(
                                        "flex items-center justify-between gap-3 px-2 py-2 text-sm",
                                        baseBranch === branch.name &&
                                          "bg-muted text-foreground",
                                      )}
                                    >
                                      <span className="truncate">{branch.name}</span>
                                      {branch.is_current ? (
                                        <Badge
                                          variant="outline"
                                          className="shrink-0 text-[10px]"
                                        >
                                          current
                                        </Badge>
                                      ) : null}
                                    </DropdownMenuItem>
                                  ))}
                                  {sectionIndex < branchSections.length - 1 ? (
                                    <DropdownMenuSeparator />
                                  ) : null}
                                </div>
                              ))
                            ) : (
                              <div className="px-2 py-3 text-sm text-muted-foreground">
                                No matching branches.
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
    </Dialog>
  );
}
