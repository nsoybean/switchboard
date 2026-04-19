import { memo, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Layers, Plus, Trash2, CornerDownLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GitState, GitActions } from "@/hooks/useGitState";

interface StashPanelProps {
  git: GitState & GitActions;
  cwd: string;
}

export const StashPanel = memo(function StashPanel({ git, cwd }: StashPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [stashMessage, setStashMessage] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (expanded) {
      void git.refreshStashes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, cwd]);

  const handleStash = async () => {
    if (pending) return;
    setPending(true);
    try {
      await git.stash(stashMessage.trim() || undefined);
      setStashMessage("");
      setShowInput(false);
    } finally {
      setPending(false);
    }
  };

  const handlePop = async (index: number) => {
    if (pending) return;
    setPending(true);
    try {
      await git.stashPop(index);
    } finally {
      setPending(false);
    }
  };

  const handleDrop = async (index: number) => {
    if (pending) return;
    setPending(true);
    try {
      await git.stashDrop(index);
    } finally {
      setPending(false);
    }
  };

  const { stashes, stashesLoading } = git;

  return (
    <div className="group/stash border-t">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <Layers className="size-3.5 shrink-0 text-muted-foreground" />
        <span>Stashes</span>
        <span className="ml-auto flex items-center gap-1">
          {expanded ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInput((v) => !v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      setShowInput((v) => !v);
                    }
                  }}
                  className="flex items-center rounded p-0.5 opacity-0 transition-opacity hover:bg-accent/60 group-hover/stash:opacity-100 group-focus-within/stash:opacity-100"
                >
                  <Plus className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Stash current changes</TooltipContent>
            </Tooltip>
          ) : null}
          {stashes.length > 0 ? (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {stashes.length}
            </Badge>
          ) : null}
        </span>
      </button>

      {expanded && (
        <div className="pb-2">
          {/* Stash push input */}
          {showInput && (
            <div className="flex items-center gap-1.5 px-3 pb-2">
              <Input
                autoFocus
                value={stashMessage}
                onChange={(e) => setStashMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleStash();
                  if (e.key === "Escape") { setShowInput(false); setStashMessage(""); }
                }}
                placeholder="Stash message (optional)..."
                className="h-7 text-xs"
                disabled={pending}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={() => void handleStash()}
                disabled={pending}
              >
                <CornerDownLeft className="size-3.5" />
              </Button>
            </div>
          )}

          {stashesLoading && stashes.length === 0 && (
            <div className="px-3 text-[11px] text-muted-foreground">Loading...</div>
          )}

          {!stashesLoading && stashes.length === 0 && (
            <div className="px-3 text-[11px] text-muted-foreground">No stashes</div>
          )}

          {stashes.map((entry) => (
            <div
              key={entry.ref_name}
              className="group flex items-start gap-2 px-3 py-1.5 text-xs hover:bg-accent/40"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {entry.ref_name}
                </span>
                <span className="ml-2 truncate text-foreground">{entry.message}</span>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{entry.date}</div>
              </div>
              <div className={cn(
                "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
              )}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      onClick={() => void handlePop(entry.index)}
                      disabled={pending}
                    >
                      <CornerDownLeft className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Pop (apply + drop)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDrop(entry.index)}
                      disabled={pending}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Drop stash</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
