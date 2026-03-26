import { useState } from "react";
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
import type { AgentType } from "../../state/types";

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (config: {
    agent: AgentType;
    label: string;
    task: string;
    useWorktree: boolean;
  }) => void;
}

const AGENTS: { id: AgentType; name: string }[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "bash", name: "Bash" },
];

export function NewSessionDialog({
  open,
  onClose,
  onSubmit,
}: NewSessionDialogProps) {
  const [agent, setAgent] = useState<AgentType>("claude-code");
  const [label, setLabel] = useState("");
  const [task, setTask] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);

  const handleSubmit = () => {
    onSubmit({
      agent,
      label: label.trim() || `${agent}-${Date.now().toString(36)}`,
      task: task.trim(),
      useWorktree,
    });
    setLabel("");
    setTask("");
    setUseWorktree(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
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
                <ToggleGroupItem key={a.id} value={a.id} className="text-xs">
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
                Initial Task (optional)
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
              Create isolated worktree for this session
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Start Session</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
