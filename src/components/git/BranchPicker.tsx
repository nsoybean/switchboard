import { useEffect, useMemo, useState } from "react";
import { GitBranch, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GitBranchInfo } from "../../lib/tauri-commands";

interface BranchPickerProps {
  branches: GitBranchInfo[];
  loading?: boolean;
  value: string;
  onSelect: (branchName: string) => void;
  onCreateBranch?: () => void;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  triggerClassName?: string;
  createLabel?: string;
  emptyLabel?: string;
  /** Show git branch icon in trigger. Default true. */
  showIcon?: boolean;
  /** Show "current" badge in trigger and dropdown. Default true. */
  showCurrentBadge?: boolean;
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
}: BranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
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

  if (loading) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        className={cn(
          "h-10 w-full justify-between px-3 font-mono text-xs font-normal",
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
          "h-10 w-full justify-between px-3 font-mono text-xs font-normal",
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
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between px-3 font-mono text-xs font-normal",
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
        className="w-[max(var(--radix-dropdown-menu-trigger-width),18rem)] p-0 font-mono"
      >
        <div className="border-b p-1">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search branches..."
            className="h-8 w-full border-0 bg-transparent px-2 font-mono text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="h-48">
          <div className="flex flex-col p-1">
            {filteredBranches.length > 0 ? (
              <div className="flex flex-col">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
                  Branches
                </DropdownMenuLabel>
                {filteredBranches.map((branch) => (
                  <DropdownMenuItem
                    key={branch.name}
                    onSelect={() => {
                      onSelect(branch.name);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex items-center justify-between gap-3 px-2 py-2 font-mono text-xs",
                      value === branch.name && "bg-muted text-foreground",
                    )}
                  >
                    <span className="truncate">{branch.name}</span>
                    {showCurrentBadge && branch.is_current ? (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        current
                      </Badge>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </div>
            ) : (
              <div className="px-2 py-3 font-mono text-xs text-muted-foreground">
                No matching branches.
              </div>
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
