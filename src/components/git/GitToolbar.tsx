import { useState } from "react";
import { flushSync } from "react-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreatePrDialog } from "./CreatePrDialog";
interface GitToolbarProps {
  branchActionPending: boolean;
  cwd: string;
  githubToken: string | null;
  onCommit: (message: string) => Promise<void>;
  onStageAll: () => Promise<void>;
  onPull: () => Promise<void>;
  onPush: () => Promise<void>;
  onRefresh: () => void;
}

export function GitToolbar({
  branchActionPending,
  cwd,
  githubToken,
  onCommit,
  onStageAll,
  onPull,
  onPush,
  onRefresh,
}: GitToolbarProps) {
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [stageAllFirst, setStageAllFirst] = useState(true);
  const [prDialogOpen, setPrDialogOpen] = useState(false);
  const [commitPending, setCommitPending] = useState(false);
  const [pullPending, setPullPending] = useState(false);
  const [pushPending, setPushPending] = useState(false);

  const handleCommit = async () => {
    const message = commitMsg.trim();
    if (!message || commitPending) return;

    flushSync(() => {
      setCommitPending(true);
    });
    try {
      if (stageAllFirst) {
        await onStageAll();
      }
      await onCommit(message);
      setCommitMsg("");
      setCommitOpen(false);
    } finally {
      setCommitPending(false);
    }
  };

  const runPull = async () => {
    if (pullPending || pushPending || commitPending) return;

    flushSync(() => {
      setPullPending(true);
    });

    try {
      await onPull();
    } finally {
      setPullPending(false);
    }
  };

  const handlePullSelect = () => {
    if (pullPending || pushPending || commitPending) return;

    window.setTimeout(() => {
      void runPull();
    }, 0);
  };

  const runPush = async () => {
    if (pushPending || commitPending) return;

    flushSync(() => {
      setPushPending(true);
    });

    try {
      await onPush();
    } finally {
      setPushPending(false);
    }
  };

  const handlePushSelect = () => {
    if (pushPending || commitPending) return;

    window.setTimeout(() => {
      void runPush();
    }, 0);
  };

  return (
    <div className="flex flex-col gap-2 p-3 border-b overflow-hidden">
      {/* Action buttons */}
      <div className="flex gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="flex-1 text-xs"
              disabled={commitPending || pullPending || pushPending || branchActionPending}
            >
              {commitPending || pullPending || pushPending ? (
                <>
                  <Spinner className="size-3" />
                  {commitPending ? "Committing..." : pullPending ? "Pulling..." : "Pushing..."}
                </>
              ) : (
                "Commit"
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setCommitOpen(true)}>
                Commit
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pullPending || pushPending || commitPending || branchActionPending}
                onSelect={handlePullSelect}
              >
                Pull
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pullPending || pushPending || commitPending || branchActionPending}
                onSelect={handlePushSelect}
              >
                Push
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <DropdownMenuItem
                      disabled={!githubToken}
                      onSelect={(e) => {
                        if (!githubToken) {
                          e.preventDefault();
                          return;
                        }
                        setPrDialogOpen(true);
                      }}
                    >
                      Create PR
                    </DropdownMenuItem>
                  </span>
                </TooltipTrigger>
                {!githubToken && (
                  <TooltipContent side="left">
                    Add a GitHub token in Settings to create PRs
                  </TooltipContent>
                )}
              </Tooltip>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={branchActionPending || commitPending || pullPending || pushPending}
            >
              <RefreshCw data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </div>

      {/* Inline commit form */}
      {commitOpen && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="Commit message..."
            rows={3}
            autoFocus
            className="text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleCommit();
              }
              if (e.key === "Escape") {
                setCommitOpen(false);
              }
            }}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={stageAllFirst}
                onCheckedChange={(v) => setStageAllFirst(v === true)}
                className="size-3.5"
              />
              <span className="text-[11px] text-muted-foreground">Stage all</span>
            </label>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setCommitOpen(false)}
                disabled={commitPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs"
                onClick={handleCommit}
                disabled={commitPending || !commitMsg.trim()}
              >
                {commitPending ? (
                  <>
                    <Spinner className="size-3" />
                    Committing...
                  </>
                ) : (
                  "Commit"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create PR dialog */}
      {githubToken && (
        <CreatePrDialog
          open={prDialogOpen}
          onClose={() => setPrDialogOpen(false)}
          cwd={cwd}
          githubToken={githubToken}
        />
      )}
    </div>
  );
}
