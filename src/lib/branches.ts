import type { AgentType } from "../state/types";

export function getBranchPrefix(agent: AgentType): string {
  if (agent === "codex") return "codex/";
  if (agent === "claude-code") return "claude/";
  return "";
}
