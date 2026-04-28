import { useEffect, useMemo, useState } from "react";
import { Archive, Check, GitBranch, PlusIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
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
  compact = false,
}: BranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"branches" | "stash">("branches");

  useEffect(() => {
    if (!open) {
      setQuery("");
      setTab("branches");
    }
  }, [open]);

  useEffect(() => {
    if (open && tab === "stash") {
      onStashTabOpen?.();
    }
  }, [onStashTabOpen, open, tab]);

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
  const selectedBranch = branches.find((branch) => branch.name === value);
  const hasExactBranchMatch = branches.some(
    (branch) => branch.name.toLowerCase() === normalizedQuery,
  );
  const showInlineCreate =
    Boolean(onCreateBranch) &&
    tab === "branches" &&
    trimmedQuery.length > 0 &&
    !hasExactBranchMatch;

  if (loading) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className={cn(
          "h-10 w-full justify-between px-3 font-sans text-xs font-medium",
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
          "h-10 w-full justify-between px-3 font-sans text-xs font-medium",
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
            "h-10 w-full justify-between px-3 font-sans text-xs font-medium",
            triggerClassName,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {showIcon && <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="truncate">{selectedBranch?.name ?? value}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className={cn(
          "w-[min(34rem,calc(100vw-2rem))] p-0 font-sans",
          compact && "w-[min(25rem,calc(100vw-2rem))]",
        )}
      >
        <div className="border-b px-2 pt-2">
          <Tabs value={tab} onValueChange={(value) => setTab(value as "branches" | "stash")}>
            <TabsList className="h-8 rounded-md bg-muted/70 p-0.5">
              <TabsTrigger value="branches" className="h-7 px-3 text-xs">
                Branches
              </TabsTrigger>
              <TabsTrigger value="stash" className="h-7 px-3 text-xs">
                Stash
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="border-b p-1">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder={tab === "branches" ? "Select branch..." : "Select stash..."}
            className="h-9 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
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
                className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 px-2 py-2.5 text-sm"
              >
                <PlusIcon className="size-4 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">Create Branch: "{trimmedQuery}"</span>
                  <span className="block truncate text-xs text-muted-foreground">Based off {value || "current branch"}</span>
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
                      "grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2.5 text-sm",
                      value === branch.name && "bg-muted text-foreground",
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
                      <span className="block truncate text-xs text-muted-foreground">
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
            ) : stashes.length > 0 ? (
              <div className="flex flex-col">
                {stashes
                  .filter((stash) => normalizedQuery.length === 0 || stash.message.toLowerCase().includes(normalizedQuery))
                  .map((stash) => (
                    <DropdownMenuItem
                      key={stash.ref_name}
                      className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 px-2 py-2.5 text-sm"
                      onSelect={(event) => event.preventDefault()}
                    >
                      <Archive className="size-3.5 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">#{stash.index}: {stash.message}</span>
                        <span className="block truncate text-xs text-muted-foreground">{stash.date}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
              </div>
            ) : (
              <div className="px-2 py-3 text-xs text-muted-foreground">No stashes.</div>
            )}
          </div>
        </ScrollArea>
        {onCreateBranch ? (
          <>
            <DropdownMenuSeparator className="my-0" />
            <div className="p-1">
              <DropdownMenuItem
                onSelect={() => {
                  setOpen(false);
                  onCreateBranch();
                }}
                className="px-2 py-1.5 font-mono text-[11px] font-medium"
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
