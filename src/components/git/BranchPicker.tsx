import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  CornerDownLeft,
  Eye,
  FileText,
  GitBranch,
  GitFork,
  GitMerge,
  GitPullRequest,
  MoreHorizontal,
  PlusIcon,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DiffView } from "./DiffView";
import type { GitBranchInfo, StashEntry } from "../../lib/tauri-commands";
import type { Session } from "@/state/types";

interface BranchPickerProps {
  branches: GitBranchInfo[];
  loading?: boolean;
  value: string;
  onSelect: (branchName: string) => void;
  onCreateBranch?: (branchName?: string) => void;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  triggerClassName?: string;
  createLabel?: string;
  emptyLabel?: string;
  /** Show git branch icon in trigger. Default true. */
  showIcon?: boolean;
  /** Show "current" badge in trigger and dropdown. Default true. */
  showCurrentBadge?: boolean;
  stashes?: StashEntry[];
  stashesLoading?: boolean;
  currentBranchUpstreamStatus?: "none" | "tracking" | "gone";
  currentAheadBehind?: { ahead: number; behind: number };
  pendingAction?: string | null;
  sessions?: Session[];
  githubToken?: string | null;
  onFetch?: () => Promise<void> | void;
  onPull?: () => Promise<void> | void;
  onPush?: () => Promise<void> | void;
  onCreatePr?: () => void;
  onMergeBranch?: (branchName: string) => Promise<void> | void;
  onSquashMergeBranch?: (branchName: string) => Promise<void> | void;
  onRebaseBranch?: (branchName: string) => Promise<void> | void;
  onCreateWorktree?: (branchName: string) => void;
  onDeleteBranch?: (branchName: string, force: boolean) => Promise<void> | void;
  onDeleteRemoteBranch?: (branchName: string) => Promise<void> | void;
  onStashTabOpen?: () => void;
  onStashApply?: (index: number) => Promise<void> | void;
  onStashPop?: (index: number) => Promise<void> | void;
  onStashDrop?: (index: number) => Promise<void> | void;
  onStashOpen?: (stash: StashEntry) => Promise<void> | void;
  onStashView?: (index: number) => Promise<string>;
  compact?: boolean;
}

export function BranchPicker({
  branches,
  loading = false,
  value,
  onSelect,
  onCreateBranch,
  disabled = false,
  align = "start",
  triggerClassName,
  createLabel = "Create and checkout new branch...",
  emptyLabel = "No branches available.",
  showIcon = true,
  showCurrentBadge = true,
  stashes = [],
  stashesLoading = false,
  currentBranchUpstreamStatus = "tracking",
  currentAheadBehind,
  pendingAction = null,
  sessions = [],
  githubToken = null,
  onFetch,
  onPull,
  onPush,
  onCreatePr,
  onMergeBranch,
  onSquashMergeBranch,
  onRebaseBranch,
  onCreateWorktree,
  onDeleteBranch,
  onDeleteRemoteBranch,
  onStashTabOpen,
  onStashApply,
  onStashPop,
  onStashDrop,
  onStashOpen,
  onStashView,
  compact = false,
}: BranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"branches" | "stash">("branches");
  const [expandedStash, setExpandedStash] = useState<number | null>(null);
  const [stashDiff, setStashDiff] = useState("");
  const [stashDiffLoading, setStashDiffLoading] = useState(false);
  const onStashTabOpenRef = useRef(onStashTabOpen);
  const onStashViewRef = useRef(onStashView);

  useEffect(() => {
    onStashTabOpenRef.current = onStashTabOpen;
    onStashViewRef.current = onStashView;
  }, [onStashTabOpen, onStashView]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setTab("branches");
      setExpandedStash(null);
      setStashDiff("");
    }
  }, [open]);

  useEffect(() => {
    if (open && tab === "stash") {
      onStashTabOpenRef.current?.();
    }
  }, [open, tab]);

  const normalizedQuery = query.trim().toLowerCase();
  const trimmedQuery = query.trim();
  const filteredBranches = useMemo(
    () =>
      branches.filter(
        (branch) =>
          normalizedQuery.length === 0 ||
          branch.name.toLowerCase().includes(normalizedQuery),
      ),
    [branches, normalizedQuery],
  );
  const filteredStashes = useMemo(
    () =>
      stashes.filter(
        (stash) =>
          normalizedQuery.length === 0 ||
          stash.message.toLowerCase().includes(normalizedQuery) ||
          stash.ref_name.toLowerCase().includes(normalizedQuery),
      ),
    [normalizedQuery, stashes],
  );
  const selectedBranch = branches.find((branch) => branch.name === value);
  const localBranches = filteredBranches.filter((branch) => !branch.is_remote);
  const hasExactBranchMatch = branches.some(
    (branch) => branch.name.toLowerCase() === normalizedQuery,
  );
  const showInlineCreate =
    Boolean(onCreateBranch) &&
    tab === "branches" &&
    trimmedQuery.length > 0 &&
    !hasExactBranchMatch;
  const hasBranchManagement = Boolean(
    onFetch ||
      onPull ||
      onPush ||
      onCreatePr ||
      onMergeBranch ||
      onSquashMergeBranch ||
      onRebaseBranch ||
      onCreateWorktree ||
      onDeleteBranch ||
      onDeleteRemoteBranch,
  );
  const sessionsByBranch = useMemo(() => {
    const map = new Map<string, Session[]>();
    sessions.forEach((session) => {
      const branchName = session.workspace.branchName ?? session.branch;
      if (!branchName) return;
      const current = map.get(branchName) ?? [];
      current.push(session);
      map.set(branchName, current);
    });
    return map;
  }, [sessions]);

  useEffect(() => {
    const loadStashView = onStashViewRef.current;
    if (!open || tab !== "stash" || expandedStash === null || !loadStashView) {
      setStashDiff("");
      setStashDiffLoading(false);
      return;
    }

    let cancelled = false;
    setStashDiff("");
    setStashDiffLoading(true);

    loadStashView(expandedStash)
      .then((diff) => {
        if (!cancelled) setStashDiff(diff);
      })
      .catch((err) => {
        if (!cancelled) setStashDiff(`Unable to load stash diff: ${String(err)}`);
      })
      .finally(() => {
        if (!cancelled) setStashDiffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expandedStash, open, tab]);

  if (loading) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className={cn(
          "h-8 w-full justify-between px-2.5 font-sans text-xs font-medium",
          triggerClassName,
        )}
      >
        Loading branches...
      </Button>
    );
  }

  if (branches.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className={cn(
          "h-8 w-full justify-between px-2.5 font-sans text-xs font-medium",
          triggerClassName,
        )}
      >
        {emptyLabel}
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between px-2.5 font-sans text-xs font-medium",
            triggerClassName,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 overflow-hidden">
            {showIcon && <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="truncate">{selectedBranch?.name ?? value}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className={cn(
          "w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-md p-0 font-sans",
          compact && "w-[min(24rem,calc(100vw-2rem))]",
        )}
      >
        <div className="border-b bg-card p-2">
          <Tabs value={tab} onValueChange={(value) => setTab(value as "branches" | "stash")}>
            <TabsList className="grid h-8 w-full grid-cols-2 rounded-md bg-muted/70 p-0.5">
              <TabsTrigger
                value="branches"
                className="h-7 justify-center px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                Branches
              </TabsTrigger>
              <TabsTrigger
                value="stash"
                className="h-7 justify-center gap-1.5 px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                Stash
                {stashes.length > 0 ? (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    {stashes.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="border-b bg-card p-1">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder={tab === "branches" ? "Select branch..." : "Select stash..."}
            className="h-7 w-full border-0 bg-transparent px-2 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        {showInlineCreate ? (
          <>
            <div className="p-1">
              <DropdownMenuItem
                onSelect={() => {
                  setOpen(false);
                  onCreateBranch?.(trimmedQuery);
                }}
                className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2 rounded-md px-2 py-1.5 text-xs"
              >
                <PlusIcon className="size-3.5 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">Create Branch: "{trimmedQuery}"</span>
                  <span className="block truncate text-[11px] text-muted-foreground">Based off {value || "current branch"}</span>
                </span>
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator className="my-0" />
          </>
        ) : null}
        <ScrollArea className={cn("h-64", compact && "h-48")}>
          <div className="flex flex-col p-1">
            {tab === "branches" && localBranches.length > 0 ? (
              <div className="flex flex-col">
                {localBranches.map((branch) => {
                  const isCurrent = branch.name === value || branch.is_current;
                  const branchAhead = isCurrent ? (currentAheadBehind?.ahead ?? branch.ahead ?? 0) : (branch.ahead ?? 0);
                  const branchBehind = isCurrent ? (currentAheadBehind?.behind ?? branch.behind ?? 0) : (branch.behind ?? 0);
                  const attachedSessions = sessionsByBranch.get(branch.name) ?? [];
                  const isPending = pendingAction?.endsWith(`:${branch.name}`) || pendingAction === "push" || pendingAction === "pull" || pendingAction === "fetch";
                  const canCreatePr = Boolean(githubToken && onCreatePr);
                  const needsPublish = isCurrent && currentBranchUpstreamStatus !== "tracking";

                  return (
                    <div
                      key={branch.name}
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        if (isCurrent) return;
                        onSelect(branch.name);
                        setOpen(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        if (isCurrent) return;
                        onSelect(branch.name);
                        setOpen(false);
                      }}
                      className={cn(
                        "group/branch relative grid cursor-default grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                        isCurrent && "bg-accent/70 text-foreground",
                      )}
                    >
                      <span className="mt-0.5 flex justify-center">
                        {isCurrent ? (
                          <Check className="size-3.5 text-primary" />
                        ) : (
                          <GitBranch className="size-3.5 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium">{branch.name}</span>
                          {showCurrentBadge && isCurrent ? (
                            <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                              current
                            </Badge>
                          ) : null}
                          {branchAhead > 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--sb-diff-add-fg)]">
                              <ArrowUp className="size-3" />
                              {branchAhead}
                            </span>
                          ) : null}
                          {branchBehind > 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--sb-diff-del-fg)]">
                              <ArrowDown className="size-3" />
                              {branchBehind}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {branch.last_commit_date ? `${branch.last_commit_date} · ` : ""}
                          {branch.last_commit_subject ?? "Local branch"}
                        </span>
                        {attachedSessions.length > 0 ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {attachedSessions.slice(0, 2).map((session) => (
                              <Badge key={session.id} variant="outline" className="h-4 px-1 text-[10px]">
                                {session.worktreePath ? "worktree" : "session"}
                              </Badge>
                            ))}
                            {attachedSessions.length > 2 ? (
                              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                +{attachedSessions.length - 2}
                              </Badge>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="flex shrink-0 items-center gap-0.5"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {hasBranchManagement && isPending ? <RefreshCw className="mt-0.5 size-3.5 animate-spin text-muted-foreground" /> : null}
                        {isCurrent && onPush && (branchAhead > 0 || needsPublish) ? (
                          <BranchActionButton
                            label={needsPublish ? "Publish branch" : "Push branch"}
                            disabled={Boolean(pendingAction)}
                            onClick={() => void onPush()}
                          >
                            <Upload className="size-3" />
                          </BranchActionButton>
                        ) : null}
                        {hasBranchManagement ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/branch:opacity-100 data-[state=open]:opacity-100"
                                disabled={Boolean(pendingAction)}
                              >
                                <MoreHorizontal className="size-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 text-xs">
                              {isCurrent ? (
                                <>
                                  <DropdownMenuItem disabled={!onPush} onSelect={() => void onPush?.()}>
                                    <Upload className="size-3.5" />
                                    {needsPublish ? "Publish branch" : "Push branch"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={!onPull} onSelect={() => void onPull?.()}>
                                    <ArrowDown className="size-3.5" />
                                    Pull branch
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={!onFetch} onSelect={() => void onFetch?.()}>
                                    <RefreshCw className="size-3.5" />
                                    Fetch
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={!canCreatePr} onSelect={() => onCreatePr?.()}>
                                    <GitPullRequest className="size-3.5" />
                                    Create PR
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      onSelect(branch.name);
                                      setOpen(false);
                                    }}
                                  >
                                    <GitBranch className="size-3.5" />
                                    Checkout
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={!onMergeBranch} onSelect={() => void onMergeBranch?.(branch.name)}>
                                    <GitMerge className="size-3.5" />
                                    Merge into {value}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={!onSquashMergeBranch} onSelect={() => void onSquashMergeBranch?.(branch.name)}>
                                    <GitMerge className="size-3.5" />
                                    Squash merge
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={!onRebaseBranch} onSelect={() => void onRebaseBranch?.(branch.name)}>
                                    <ArrowUp className="size-3.5" />
                                    Rebase current onto branch
                                  </DropdownMenuItem>
                                  <DropdownMenuItem disabled={!onCreateWorktree} onSelect={() => onCreateWorktree?.(branch.name)}>
                                    <GitFork className="size-3.5" />
                                    Create worktree/session
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => void navigator.clipboard?.writeText(branch.name)}
                              >
                                <Copy className="size-3.5" />
                                Copy branch name
                              </DropdownMenuItem>
                              {!isCurrent && onDeleteBranch ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => void onDeleteBranch?.(branch.name, false)}
                                  >
                                    <Trash2 className="size-3.5" />
                                    Delete local
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => {
                                      if (window.confirm(`Force delete local branch "${branch.name}"?`)) {
                                        void onDeleteBranch?.(branch.name, true);
                                      }
                                    }}
                                  >
                                    <Trash2 className="size-3.5" />
                                    Force delete local
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              {!isCurrent && onDeleteRemoteBranch ? (
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => {
                                    if (window.confirm(`Delete remote branch "${branch.name}" from origin?`)) {
                                      void onDeleteRemoteBranch?.(branch.name);
                                    }
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete remote
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : tab === "branches" ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No matching branches.
              </div>
            ) : stashesLoading ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">Loading stashes...</div>
            ) : filteredStashes.length > 0 ? (
              <div className="flex flex-col">
                {filteredStashes.map((stash) => {
                  const isExpanded = expandedStash === stash.index;

                  return (
                    <div key={stash.ref_name} className="rounded-md">
                      <div
                        role="menuitem"
                        tabIndex={0}
                        className={cn(
                          "group/stash relative grid cursor-default grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                          isExpanded && "bg-accent/70 text-foreground",
                        )}
                        onClick={() => {
                          if (onStashOpen) {
                            void onStashOpen(stash);
                            setOpen(false);
                            return;
                          }
                          if (!onStashView) return;
                          setExpandedStash((current) =>
                            current === stash.index ? null : stash.index,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          if (onStashOpen) {
                            void onStashOpen(stash);
                            setOpen(false);
                            return;
                          }
                          if (!onStashView) return;
                          setExpandedStash((current) =>
                            current === stash.index ? null : stash.index,
                          );
                        }}
                      >
                        <Archive className="size-3.5 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">#{stash.index}: {stash.message}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{stash.date}</span>
                        </span>
                        <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-background/95 opacity-0 shadow-sm transition-opacity group-hover/stash:pointer-events-auto group-hover/stash:opacity-100 group-focus-within/stash:pointer-events-auto group-focus-within/stash:opacity-100">
                          {onStashView || onStashOpen ? (
                            <StashActionButton
                              label={onStashOpen ? "Open stash diff" : isExpanded ? "Hide stash diff" : "View stash diff"}
                              onClick={() => {
                                if (onStashOpen) {
                                  void onStashOpen(stash);
                                  setOpen(false);
                                  return;
                                }

                                setExpandedStash((current) =>
                                  current === stash.index ? null : stash.index,
                                );
                              }}
                            >
                              <Eye className="size-3" />
                            </StashActionButton>
                          ) : null}
                          {onStashApply ? (
                            <StashActionButton
                              label="Apply stash"
                              onClick={() => void onStashApply(stash.index)}
                            >
                              <CornerDownLeft className="size-3" />
                            </StashActionButton>
                          ) : null}
                          {onStashPop ? (
                            <StashActionButton
                              label="Pop stash"
                              onClick={() => void onStashPop(stash.index)}
                            >
                              <RotateCcw className="size-3" />
                            </StashActionButton>
                          ) : null}
                          {onStashDrop ? (
                            <StashActionButton
                              label="Discard stash"
                              destructive
                              onClick={() => void onStashDrop(stash.index)}
                            >
                              <Trash2 className="size-3" />
                            </StashActionButton>
                          ) : null}
                        </span>
                      </div>
                      {isExpanded ? (
                        <div className="mx-1 mb-1 max-h-52 overflow-auto rounded-md border bg-background">
                          {stashDiffLoading ? (
                            <div className="p-3 text-xs text-muted-foreground">Loading diff...</div>
                          ) : (
                            <StashDiffView diff={stashDiff} />
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                {stashes.length === 0 ? "No stashes." : "No matching stashes."}
              </div>
            )}
          </div>
        </ScrollArea>
        {onCreateBranch && tab === "branches" ? (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="p-1">
              <DropdownMenuItem
                onSelect={() => {
                  setOpen(false);
                  onCreateBranch();
                }}
                className="rounded-md px-2 py-1.5 font-sans text-xs font-medium"
              >
                <PlusIcon />
                {createLabel}
              </DropdownMenuItem>
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface StashActionButtonProps {
  label: string;
  destructive?: boolean;
  children: ReactNode;
  onClick: () => void;
}

interface BranchActionButtonProps {
  label: string;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}

function BranchActionButton({
  label,
  disabled = false,
  children,
  onClick,
}: BranchActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground opacity-0 transition-opacity hover:bg-background/80 hover:text-foreground group-hover/branch:opacity-100"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function StashActionButton({
  label,
  destructive = false,
  children,
  onClick,
}: StashActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "size-6 text-muted-foreground hover:bg-background/80 hover:text-foreground",
            destructive && "hover:text-destructive",
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface StashDiffFile {
  key: string;
  name: string;
  directory: string;
  additions: number;
  deletions: number;
  diff: string;
}

function StashDiffView({ diff }: { diff: string }) {
  const files = useMemo(() => parseStashDiff(diff), [diff]);

  if (!diff.trim()) {
    return <div className="p-3 text-xs text-muted-foreground">No diff to show</div>;
  }

  if (files.length === 0) {
    return <DiffView diff={diff} />;
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {files.map((file) => (
        <div key={file.key} className="overflow-hidden rounded-md border bg-background">
          <div className="flex min-w-0 items-center gap-2 border-b bg-card px-2 py-1.5 text-xs">
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-mono font-medium text-foreground" title={file.key}>
              {file.name}
            </span>
            {file.directory ? (
              <span className="min-w-0 truncate font-mono text-muted-foreground">
                {file.directory}
              </span>
            ) : null}
            <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
              {file.additions > 0 ? (
                <span className="text-[var(--sb-diff-add-fg)]">+{file.additions}</span>
              ) : null}
              {file.deletions > 0 ? (
                <span className="text-[var(--sb-diff-del-fg)]">-{file.deletions}</span>
              ) : null}
            </span>
          </div>
          <DiffView diff={file.diff} />
        </div>
      ))}
    </div>
  );
}

function parseStashDiff(diff: string): StashDiffFile[] {
  const lines = diff.split("\n");
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current.length > 0) {
        sections.push(current);
      }
      current = [line];
      continue;
    }
    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    sections.push(current);
  }

  return sections.map((section, index) => {
    const key = getDiffPath(section[0]) ?? `File ${index + 1}`;
    const slashIndex = key.lastIndexOf("/");
    const name = slashIndex >= 0 ? key.slice(slashIndex + 1) : key;
    const directory = slashIndex >= 0 ? key.slice(0, slashIndex + 1) : "";
    let additions = 0;
    let deletions = 0;

    for (const line of section) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
      if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    }

    return {
      key,
      name,
      directory,
      additions,
      deletions,
      diff: section.join("\n"),
    };
  });
}

function getDiffPath(header: string) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(header);
  if (!match) return null;
  return match[2] || match[1] || null;
}
