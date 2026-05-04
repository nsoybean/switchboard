import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getAgentState, type AgentState } from "@/lib/session-attention";
import type { Session } from "@/state/types";

export type StatusFilter = "all" | AgentState;

interface AgentStatusFilterProps {
  sessions: Session[];
  value: StatusFilter;
  onChange: (filter: StatusFilter) => void;
}

const CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "idle", label: "Idle" },
  { id: "needs-input", label: "Needs input" },
  { id: "finished", label: "Finished" },
  { id: "failed", label: "Failed" },
];

export function AgentStatusFilter({ sessions, value, onChange }: AgentStatusFilterProps) {
  const counts = useMemo(() => {
    const map: Record<AgentState, number> = {
      running: 0,
      idle: 0,
      "needs-input": 0,
      finished: 0,
      failed: 0,
    };
    for (const s of sessions) {
      map[getAgentState(s.status)]++;
    }
    return map;
  }, [sessions]);

  const needsInputCount = counts["needs-input"];

  return (
    <div className="flex gap-1 overflow-x-auto px-3 pb-1.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CHIPS.map((chip) => {
        const count = chip.id === "all" ? sessions.length : counts[chip.id as AgentState];
        const isActive = value === chip.id;
        const showAttentionDot = chip.id === "needs-input" && needsInputCount > 0 && !isActive;

        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChange(chip.id)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {showAttentionDot && (
              <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-amber-400" />
            )}
            <span>{chip.label}</span>
            {count > 0 && (
              <span className={cn(
                "tabular-nums",
                isActive ? "text-accent-foreground/70" : "text-muted-foreground/60",
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
