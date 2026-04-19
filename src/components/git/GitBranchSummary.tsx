import { Files, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface GitBranchSummaryProps {
  branch: string;
  changedCount?: number;
  ahead?: number;
  behind?: number;
  showIcon?: boolean;
  showBranchLabel?: boolean;
  className?: string;
  branchClassName?: string;
}

export function GitBranchSummary({
  branch,
  changedCount = 0,
  ahead = 0,
  behind = 0,
  showIcon = true,
  showBranchLabel = true,
  className,
  branchClassName,
}: GitBranchSummaryProps) {
  const showChangedCount = changedCount > 0;
  const showAhead = ahead > 0;
  const showBehind = behind > 0;
  const showMetrics = showChangedCount || showAhead || showBehind;

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground", className)}>
      {showBranchLabel ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {showIcon ? <GitBranch className="size-3.5 shrink-0" /> : null}
          <span className={cn("truncate font-mono text-foreground", branchClassName)}>
            {branch}
          </span>
        </span>
      ) : null}

      {showMetrics ? (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          {showChangedCount ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Files className="size-3.5 shrink-0" />
                <span>{changedCount}</span>
              </span>
            </>
          ) : null}
          {showChangedCount && (showAhead || showBehind) ? (
            <span aria-hidden="true">&middot;</span>
          ) : null}
          {showAhead ? (
            <span className="text-[var(--sb-diff-add-fg)]">+{ahead}</span>
          ) : null}
          {showAhead && showBehind ? <span aria-hidden="true">&middot;</span> : null}
          {showBehind ? (
            <span className="text-[var(--sb-diff-del-fg)]">-{behind}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
