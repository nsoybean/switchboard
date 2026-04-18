import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/state/types";

interface StatusDotProps {
  status: SessionStatus | null | undefined;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        status === "running" && "bg-[var(--sb-status-running)]",
        status === "needs-input" && "bg-amber-400",
        status === "idle" && "bg-[var(--sb-status-done)]",
        (status === "done" || status === "error" || status === "stopped" || !status) &&
          "bg-muted-foreground/40",
        className,
      )}
      aria-label={status ?? "unknown"}
    />
  );
}
