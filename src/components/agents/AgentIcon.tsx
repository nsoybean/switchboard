import { Bot, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon";
import { CodexDark } from "@/components/ui/svgs/codexDark";
import { CodexLight } from "@/components/ui/svgs/codexLight";
import type { AgentType } from "../../state/types";

interface AgentIconProps {
  agent: AgentType;
  className?: string;
}

export function AgentIcon({ agent, className }: AgentIconProps) {
  const wrapperClassName = cn(
    "inline-flex shrink-0 items-center justify-center",
    className,
  );

  switch (agent) {
    case "claude-code":
      return (
        <span aria-hidden="true" className={wrapperClassName}>
          <ClaudeAiIcon className="size-full" />
        </span>
      );
    case "codex":
      return (
        <span aria-hidden="true" className={wrapperClassName}>
          <CodexLight className="size-full dark:hidden" />
          <CodexDark className="hidden size-full dark:block" />
        </span>
      );
    case "bash":
      return (
        <span aria-hidden="true" className={wrapperClassName}>
          <Terminal className="size-full text-muted-foreground" />
        </span>
      );
    default:
      return (
        <span aria-hidden="true" className={wrapperClassName}>
          <Bot className="size-full text-muted-foreground" />
        </span>
      );
  }
}
