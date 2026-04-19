import { memo, useEffect, useState } from "react";
import { ArrowUp, GitCommit as GitCommitIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { gitCommands } from "@/lib/tauri-commands";
import { DiffView } from "./DiffView";
import { Spinner } from "@/components/ui/spinner";
import type { GitCommit } from "@/lib/tauri-commands";
import type { GitState, GitActions } from "@/hooks/useGitState";

interface GitHistoryProps {
  cwd: string;
  git: GitState & GitActions;
}

export const GitHistory = memo(function GitHistory({ cwd, git }: GitHistoryProps) {
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [commitDiff, setCommitDiff] = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    void git.refreshLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  useEffect(() => {
    setExpandedHash(null);
    setCommitDiff("");
  }, [cwd]);

  useEffect(() => {
    if (!expandedHash) {
      setCommitDiff("");
      return;
    }

    let cancelled = false;
    setDiffLoading(true);
    setCommitDiff("");

    gitCommands
      .showCommit(cwd, expandedHash)
      .then((diff) => {
        if (!cancelled) setCommitDiff(diff);
      })
      .catch((err) => {
        if (!cancelled) setCommitDiff(`Unable to load diff: ${String(err)}`);
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });

    return () => { cancelled = true; };
  }, [expandedHash, cwd]);

  const { log, logLoading } = git;

  if (logLoading && log.length === 0) {
    return (
      <div className="flex items-center justify-center p-6">
        <Spinner className="size-4" />
      </div>
    );
  }

  if (log.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center">
        No commits found
      </div>
    );
  }

  return (
    <div className="py-1">
      {log.map((commit) => (
        <CommitRow
          key={commit.hash}
          commit={commit}
          isExpanded={expandedHash === commit.hash}
          diff={expandedHash === commit.hash ? commitDiff : ""}
          diffLoading={expandedHash === commit.hash && diffLoading}
          onToggle={() =>
            setExpandedHash((prev) => (prev === commit.hash ? null : commit.hash))
          }
        />
      ))}
    </div>
  );
});

interface CommitRowProps {
  commit: GitCommit;
  isExpanded: boolean;
  diff: string;
  diffLoading: boolean;
  onToggle: () => void;
}

function CommitRow({ commit, isExpanded, diff, diffLoading, onToggle }: CommitRowProps) {
  return (
    <div>
      <div
        onClick={onToggle}
        className={cn(
          "flex min-w-0 cursor-pointer items-start gap-2 border-b px-3 py-2 text-xs transition-colors",
          isExpanded ? "bg-accent/60" : "hover:bg-accent/40",
        )}
      >
        <GitCommitIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground shrink-0">
              {commit.short_hash}
            </span>
            {!commit.is_pushed && (
              <span title="Not yet pushed to remote">
                <ArrowUp className="size-3 text-[var(--sb-diff-add-fg)] shrink-0" />
              </span>
            )}
            <span className="truncate font-medium text-foreground">{commit.subject}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {commit.author} · {commit.date}
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="border-b">
          {diffLoading ? (
            <div className="flex items-center justify-center p-4">
              <Spinner className="size-3.5" />
            </div>
          ) : diff ? (
            <DiffView diff={diff} />
          ) : (
            <div className="p-3 text-xs text-muted-foreground">No diff available</div>
          )}
        </div>
      )}
    </div>
  );
}
