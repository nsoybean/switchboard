import type { AgentType } from "../state/types";

interface AgentConfig {
  command: string;
  defaultArgs: string[];
  displayName: string;
}

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  "claude-code": {
    command: "claude",
    defaultArgs: [],
    displayName: "Claude Code",
  },
  codex: {
    command: "codex",
    defaultArgs: [],
    displayName: "Codex",
  },
  bash: {
    command: "/bin/bash",
    defaultArgs: [],
    displayName: "Bash",
  },
};

export function getAgentConfig(agent: AgentType): AgentConfig {
  return AGENT_CONFIGS[agent];
}

/**
 * Build the spawn command + args for an agent session.
 *
 * Claude Code: always interactive. If a task is provided, pass it as a
 * positional arg (first message in the interactive session).
 * Do NOT use --print (non-interactive, exits after response).
 *
 * Codex: pass task as positional arg for interactive mode.
 */
export function buildSpawnArgs(
  agent: AgentType,
  task?: string,
): { command: string; args: string[] } {
  const config = AGENT_CONFIGS[agent];
  const args = [...config.defaultArgs];

  if (task && agent === "claude-code") {
    // Positional arg = first message in interactive session
    args.push(task);
  } else if (task && agent === "codex") {
    args.push(task);
  }

  return { command: config.command, args };
}
