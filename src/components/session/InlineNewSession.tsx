import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, GitFork } from "lucide-react";
import { toast } from "sonner";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { BranchPicker } from "@/components/git/BranchPicker";
import { CreateBranchDialog } from "@/components/git/CreateBranchDialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBranchPrefix } from "@/lib/branches";
import { gitCommands, type GitBranchInfo } from "@/lib/tauri-commands";
import type { AgentType } from "@/state/types";

const AGENTS: { id: AgentType; name: string }[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "bash", name: "Shell" },
];

export interface InlineNewSessionConfig {
  agent: AgentType;
  label: string;
  isAutoLabel: boolean;
  task: string;
  useWorktree: boolean;
  baseBranch: string | null;
}

interface InlineNewSessionProps {
  projectPath: string | null;
  onSubmit: (config: InlineNewSessionConfig) => void;
}

export function InlineNewSession({ projectPath, onSubmit }: InlineNewSessionProps) {
  const [agent, setAgent] = useState<AgentType>("claude-code");
  const [task, setTask] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [baseBranch, setBaseBranch] = useState("");
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createBranchPending, setCreateBranchPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentBranch = branches.find((b) => b.is_current)?.name ?? "";
  const defaultBranchPrefix = getBranchPrefix(agent);

  // Load branches on mount
  useEffect(() => {
    if (!projectPath) return;

    let cancelled = false;
    setBranchesLoading(true);

    gitCommands
      .listBranches(projectPath)
      .then((nextBranches) => {
        if (cancelled) return;
        setBranches(nextBranches);
        setBaseBranch((current) => {
          if (current && nextBranches.some((b) => b.name === current)) return current;
          return nextBranches.find((b) => b.is_current)?.name ?? nextBranches[0]?.name ?? "";
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setBranches([]);
        setBaseBranch("");
        toast.error("Failed to load branches", { description: String(error) });
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const refreshBranches = useCallback(
    async (nextSelected?: string) => {
      if (!projectPath) return;
      const nextBranches = await gitCommands.listBranches(projectPath);
      setBranches(nextBranches);
      setBaseBranch((current) => {
        if (nextSelected && nextBranches.some((b) => b.name === nextSelected)) return nextSelected;
        if (current && nextBranches.some((b) => b.name === current)) return current;
        return nextBranches.find((b) => b.is_current)?.name ?? nextBranches[0]?.name ?? "";
      });
    },
    [projectPath],
  );

  const handleCreateBranch = useCallback(
    async (branchName: string) => {
      if (!projectPath) return;
      try {
        setCreateBranchPending(true);
        await gitCommands.createBranch(projectPath, branchName);
        await refreshBranches(branchName);
        setCreateBranchOpen(false);
      } catch (error) {
        toast.error("Failed to create branch", { description: String(error) });
      } finally {
        setCreateBranchPending(false);
      }
    },
    [projectPath, refreshBranches],
  );

  const handleSubmit = useCallback(() => {
    const trimmedTask = task.trim();
    if (!trimmedTask && agent !== "bash") return;

    onSubmit({
      agent,
      label: "",
      isAutoLabel: true,
      task: trimmedTask,
      useWorktree,
      baseBranch: useWorktree ? baseBranch : null,
    });

    setTask("");
    setUseWorktree(false);
  }, [agent, task, useWorktree, baseBranch, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const selectedAgent = AGENTS.find((a) => a.id === agent) ?? AGENTS[0];
  const disableSubmit = useWorktree && (branchesLoading || !baseBranch);

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="w-full max-w-xl px-6">
        {/* Badge-style options bar */}
        <div className="mb-3 flex items-center gap-1.5">
          {/* Agent badge */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <AgentIcon agent={agent} className="size-3.5" />
                <span className="font-medium">{selectedAgent.name}</span>
                <ChevronDown className="size-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {AGENTS.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  onSelect={() => setAgent(a.id)}
                  className="gap-2 text-xs"
                >
                  <AgentIcon agent={a.id} className="size-3.5" />
                  {a.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Branch badge */}
          <BranchPicker
            branches={branches}
            loading={branchesLoading}
            value={useWorktree ? baseBranch : currentBranch}
            onSelect={setBaseBranch}
            onCreateBranch={() => setCreateBranchOpen(true)}
            disabled={!useWorktree}
            triggerClassName="h-auto rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground disabled:opacity-50 font-normal w-auto min-w-0 max-w-[200px]"
            showCurrentBadge={false}
            showIcon
          />

          {/* Worktree badge */}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Checkbox
              checked={useWorktree}
              onCheckedChange={(checked) => setUseWorktree(checked === true)}
              className="size-3"
            />
            <GitFork className="size-3" />
            <span>Worktree</span>
          </label>
        </div>

        {/* Chat input */}
        <div className="relative rounded-lg border bg-background shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-ring">
          <textarea
            ref={textareaRef}
            value={task}
            onChange={(e) => {
              setTask(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              agent === "bash"
                ? "Start a shell session..."
                : "Describe a task or ask a question..."
            }
            rows={1}
            className="block w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disableSubmit || (!task.trim() && agent !== "bash")}
            className="absolute bottom-2.5 right-2.5 inline-flex size-7 items-center justify-center rounded-md bg-foreground text-background transition-opacity disabled:opacity-30"
            aria-label="Start session"
          >
            <CornerDownLeft className="size-3.5" />
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground/60">
          Press Enter to start &middot; Shift+Enter for new line
        </p>
      </div>

      <CreateBranchDialog
        open={createBranchOpen}
        onOpenChange={setCreateBranchOpen}
        defaultBranchPrefix={defaultBranchPrefix}
        pending={createBranchPending}
        onCreate={handleCreateBranch}
      />
    </div>
  );
}
