import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CornerDownLeft, Files, GitFork, X } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getBranchPrefix } from "@/lib/branches";
import { fileCommands, gitCommands, type GitBranchInfo } from "@/lib/tauri-commands";
import type { AgentType } from "@/state/types";

const AGENTS: { id: AgentType; name: string }[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "bash", name: "Shell" },
];

interface PastedImage {
  /** Object URL for thumbnail preview */
  previewUrl: string;
  /** Saved temp file path on disk */
  filePath: string;
}

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

interface InlineBranchContext {
  branch: string;
  ahead: number;
  behind: number;
  dirtyCount: number;
  lastCommitSubject: string | null;
  lastCommitDate: string | null;
}

function extensionFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "png";
}

export function InlineNewSession({ projectPath, onSubmit }: InlineNewSessionProps) {
  const [agent, setAgent] = useState<AgentType>("claude-code");
  const [task, setTask] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchSwitchPending, setBranchSwitchPending] = useState(false);
  const [baseBranch, setBaseBranch] = useState("");
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createBranchPending, setCreateBranchPending] = useState(false);
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [branchContext, setBranchContext] = useState<InlineBranchContext | null>(null);
  const [branchContextLoading, setBranchContextLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);


  const defaultBranchPrefix = getBranchPrefix(agent);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      for (const img of pastedImages) {
        URL.revokeObjectURL(img.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const removeImage = useCallback((index: number) => {
    setPastedImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const currentBranch = useMemo(
    () => branches.find((b) => b.is_current)?.name ?? null,
    [branches],
  );

  const handleSubmit = useCallback(() => {
    // Build the task text, appending image paths if any
    let fullTask = task.trim();
    if (pastedImages.length > 0) {
      const paths = pastedImages.map((img) => img.filePath).join(" ");
      fullTask = fullTask ? `${fullTask} ${paths}` : paths;
    }

    onSubmit({
      agent,
      label: "",
      isAutoLabel: true,
      task: fullTask,
      useWorktree,
      baseBranch: useWorktree ? (baseBranch || currentBranch || null) : null,
    });

    // Clean up
    for (const img of pastedImages) {
      URL.revokeObjectURL(img.previewUrl);
    }
    setTask("");
    setPastedImages([]);
    setUseWorktree(false);
  }, [agent, task, pastedImages, useWorktree, baseBranch, currentBranch, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;

        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        const ext = extensionFromMime(item.type);
        const buffer = await blob.arrayBuffer();
        const data = Array.from(new Uint8Array(buffer));

        try {
          const filePath = await fileCommands.saveTempImage(data, ext);
          const previewUrl = URL.createObjectURL(blob);
          setPastedImages((prev) => [...prev, { previewUrl, filePath }]);
        } catch (error) {
          toast.error("Failed to save image", { description: String(error) });
        }
        break; // Handle one image per paste
      }
    },
    [],
  );

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const selectedAgent = AGENTS.find((a) => a.id === agent) ?? AGENTS[0];
  const displayBranch = useWorktree ? baseBranch : (currentBranch ?? baseBranch);
  const disableSubmit =
    branchSwitchPending || (useWorktree && (branchesLoading || !displayBranch));
  const showBranchDirtyCount = (branchContext?.dirtyCount ?? 0) > 0;
  const showBranchAhead = (branchContext?.ahead ?? 0) > 0;
  const showBranchBehind = (branchContext?.behind ?? 0) > 0;
  const showBranchMetrics = showBranchDirtyCount || showBranchAhead || showBranchBehind;

  const handleBranchSelect = useCallback(
    async (branchName: string) => {
      if (!projectPath) return;

      if (useWorktree) {
        setBaseBranch(branchName);
        return;
      }

      if (branchName === currentBranch || branchSwitchPending) {
        return;
      }

      try {
        setBranchSwitchPending(true);
        await gitCommands.checkoutBranch(projectPath, branchName);
        await refreshBranches(branchName);
      } catch (error) {
        toast.error("Failed to switch branch", { description: String(error) });
      } finally {
        setBranchSwitchPending(false);
      }
    },
    [branchSwitchPending, currentBranch, projectPath, refreshBranches, useWorktree],
  );

  useEffect(() => {
    if (!projectPath || !displayBranch) {
      setBranchContext(null);
      setBranchContextLoading(false);
      return;
    }

    let cancelled = false;
    setBranchContextLoading(true);

    Promise.all([
      gitCommands.statusSummary(projectPath, displayBranch),
      gitCommands.log(projectPath, 1, displayBranch).catch(() => []),
    ])
      .then(([summary, commits]) => {
        if (cancelled) return;
        const lastCommit = commits[0];
        setBranchContext({
          branch: summary.branch,
          ahead: summary.ahead,
          behind: summary.behind,
          dirtyCount: summary.dirty_count,
          lastCommitSubject: lastCommit?.subject ?? null,
          lastCommitDate: lastCommit?.date ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setBranchContext(null);
      })
      .finally(() => {
        if (!cancelled) setBranchContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [displayBranch, projectPath]);

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

          {/* Local badge — hidden until remote sessions are supported */}
          {/* <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                <Monitor className="size-3" />
                <span>Local</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Run locally on this machine</TooltipContent>
          </Tooltip> */}

          {/* Project badge — hidden for now, only one project open at a time */}
          {/* {projectPath && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                  <FolderOpen className="size-3" />
                  <span>{projectPath.split("/").pop()}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{projectPath}</TooltipContent>
            </Tooltip>
          )} */}

          {/* Worktree badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Checkbox
                  checked={useWorktree}
                  onCheckedChange={(checked) => setUseWorktree(checked === true)}
                  className="size-3"
                />
                <GitFork className="size-3" />
                <span>Worktree</span>
              </label>
            </TooltipTrigger>
            <TooltipContent>Work in an isolated copy of the repo</TooltipContent>
          </Tooltip>

          {/* Branch badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <BranchPicker
                  branches={branches}
                  loading={branchesLoading}
                  value={displayBranch}
                  onSelect={(branchName) => {
                    void handleBranchSelect(branchName);
                  }}
                  onCreateBranch={() => setCreateBranchOpen(true)}
                  disabled={branchSwitchPending}
                  triggerClassName="h-auto rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground disabled:opacity-50 font-normal w-auto min-w-0 max-w-[200px]"
                  showCurrentBadge={false}
                  showIcon
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {useWorktree ? "Base branch for the new worktree" : "Current local branch"}
            </TooltipContent>
          </Tooltip>
        </div>

        {(branchContextLoading || branchContext) && (
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-mono text-foreground">
              {branchContext?.branch ?? displayBranch}
            </span>
            {branchContextLoading ? (
              <span>Loading branch context…</span>
            ) : (
              <>
                {branchContext?.lastCommitSubject ? (
                  <span className="truncate max-w-[320px]">
                    last commit: &ldquo;{branchContext.lastCommitSubject}&rdquo;
                    {branchContext.lastCommitDate ? ` (${branchContext.lastCommitDate})` : ""}
                  </span>
                ) : null}
                {showBranchMetrics ? (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    {showBranchDirtyCount ? (
                      <>
                        <Files className="size-3 shrink-0" />
                        <span>{branchContext?.dirtyCount ?? 0}</span>
                      </>
                    ) : null}
                    {showBranchDirtyCount && (showBranchAhead || showBranchBehind) ? (
                      <span aria-hidden="true">·</span>
                    ) : null}
                    {showBranchAhead ? (
                      <span className="text-[var(--sb-diff-add-fg)]">+{branchContext?.ahead ?? 0}</span>
                    ) : null}
                    {showBranchBehind ? (
                      <span className="text-[var(--sb-diff-del-fg)]">-{branchContext?.behind ?? 0}</span>
                    ) : null}
                  </span>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* Chat input */}
        <div className="relative rounded-lg border bg-background shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-ring">
          {/* Pasted image thumbnails */}
          {pastedImages.length > 0 && (
            <div className="flex gap-2 px-4 pt-3">
              {pastedImages.map((img, i) => (
                <div key={img.filePath} className="group relative">
                  <img
                    src={img.previewUrl}
                    alt="Pasted"
                    className="size-14 rounded-md border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-foreground text-background group-hover:inline-flex"
                    aria-label="Remove image"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={task}
            onChange={(e) => {
              setTask(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              agent === "bash"
                ? "Start a shell session..."
                : "Describe a task or ask a question..."
            }
            rows={1}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="block w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disableSubmit}
            className="absolute bottom-2.5 right-2.5 inline-flex size-7 items-center justify-center rounded-md bg-foreground text-background transition-opacity disabled:opacity-30"
            aria-label="Start session"
          >
            <CornerDownLeft className="size-3.5" />
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground/60">
          Enter to start &middot; Shift+Enter for new line
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
