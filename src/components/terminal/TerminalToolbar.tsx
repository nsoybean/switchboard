import { GitBranch, FolderOpen, Coins, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTokenUsage } from "../../hooks/useTokenUsage";
import { useAppState } from "../../state/context";
import { formatTokens, formatCost } from "../../lib/pricing";
import type { Session } from "../../state/types";

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  bash: "bash",
};

interface TerminalToolbarProps {
  session: Session | null;
  onStopSession?: (sessionId: string) => Promise<void>;
}

export function TerminalToolbar({
  session,
  onStopSession,
}: TerminalToolbarProps) {
  const state = useAppState();
  const usage = useTokenUsage(
    session?.id ?? null,
    state.projectPath,
    session?.status === "running" || session?.status === "idle",
  );
  if (!session) {
    return (
      <div className="flex items-center px-4 py-2 border-b bg-background text-sm text-muted-foreground shrink-0">
        Switchboard v0.1.0
      </div>
    );
  }
  const canStop =
    session.status === "running" ||
    session.status === "idle" ||
    session.status === "needs-input";

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-background text-sm shrink-0">
      <span className="max-w-[15ch] truncate font-semibold" title={session.label}>
        {session.label}
      </span>
      <Badge variant="secondary" className="text-[11px]">
        {AGENT_LABELS[session.agent] ?? session.agent}
      </Badge>
      {session.branch && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <GitBranch className="size-3" />
          {session.branch}
        </span>
      )}
      <div className="ml-auto flex items-center gap-3">
        {session && canStop && onStopSession && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onStopSession(session.id)}
          >
            <Square data-icon="inline-start" />
            Stop
          </Button>
        )}
        {usage && (usage.inputTokens > 0 || usage.outputTokens > 0) && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Coins className="size-3" />
            {formatTokens(usage.inputTokens + usage.outputTokens)} tokens
            <span className="text-muted-foreground/60">{formatCost(usage.cost)}</span>
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <FolderOpen className="size-3" />
          {session.cwd.split("/").slice(-2).join("/")}
        </span>
      </div>
    </div>
  );
}
