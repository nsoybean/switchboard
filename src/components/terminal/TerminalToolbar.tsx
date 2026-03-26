import { GitBranch, FolderOpen, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  gitPanelOpen?: boolean;
  onToggleGitPanel?: () => void;
}

export function TerminalToolbar({
  session,
}: TerminalToolbarProps) {
  const state = useAppState();
  const usage = useTokenUsage(
    session?.id ?? null,
    state.projectPath,
    session?.status === "running",
  );
  if (!session) {
    return (
      <div className="flex items-center px-4 py-2 border-b bg-background text-sm text-muted-foreground shrink-0">
        Switchboard v0.1.0
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b bg-background text-sm shrink-0">
      <span className="font-semibold">{session.label}</span>
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
