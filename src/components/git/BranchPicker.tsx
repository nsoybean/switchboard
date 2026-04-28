import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Archive, Check, CornerDownLeft, Eye, GitBranch, PlusIcon, RotateCcw, Trash2 } from "lucide-react";
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
  onStashTabOpen?: () => void;
  onStashApply?: (index: number) => Promise<void> | void;
  onStashPop?: (index: number) => Promise<void> | void;
  onStashDrop?: (index: number) => Promise<void> | void;
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
  onStashTabOpen,
  onStashApply,
  onStashPop,
  onStashDrop,
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
  const hasExactBranchMatch = branches.some(
    (branch) => branch.name.toLowerCase() === normalizedQuery,
  );
  const showInlineCreate =
    Boolean(onCreateBranch) &&
    tab === "branches" &&
    trimmedQuery.length > 0 &&
    !hasExactBranchMatch;

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
            {tab === "branches" && filteredBranches.length > 0 ? (
              <div className="flex flex-col">
                {filteredBranches.map((branch) => (
                  <DropdownMenuItem
                    key={branch.name}
                    onSelect={() => {
                      onSelect(branch.name);
                      setOpen(false);
                    }}
                    className={cn(
                      "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                      value === branch.name && "bg-accent/70 text-foreground",
                    )}
                  >
                    <span className="flex justify-center">
                      {branch.is_current ? (
                        <Check className="size-3.5 text-primary" />
                      ) : (
                        <GitBranch className="size-3.5 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{branch.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {branch.last_commit_date ? `${branch.last_commit_date} · ` : ""}
                        {branch.last_commit_subject ?? (branch.is_remote ? "Remote branch" : "Local branch")}
                      </span>
                    </span>
                    {showCurrentBadge && branch.is_current ? (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        current
                      </Badge>
                    ) : null}
                  </DropdownMenuItem>
                ))}
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
                          if (!onStashView) return;
                          setExpandedStash((current) =>
                            current === stash.index ? null : stash.index,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
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
                          {onStashView ? (
                            <StashActionButton
                              label={isExpanded ? "Hide stash diff" : "View stash diff"}
                              onClick={() =>
                                setExpandedStash((current) =>
                                  current === stash.index ? null : stash.index,
                                )
                              }
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
                            <DiffView diff={stashDiff} />
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
