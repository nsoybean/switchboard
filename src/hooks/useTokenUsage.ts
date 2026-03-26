import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeSessionSummary } from "./useSessions";
import { estimateCost } from "../lib/pricing";

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  cost: number;
}

/**
 * Poll Claude session data for live token usage.
 * Only polls while the session status is "running".
 */
export function useTokenUsage(
  sessionId: string | null,
  projectPath: string | null,
  isRunning: boolean,
): TokenUsage | null {
  const [usage, setUsage] = useState<TokenUsage | null>(null);

  useEffect(() => {
    if (!sessionId || !projectPath || !isRunning) return;

    let cancelled = false;

    async function poll() {
      try {
        const sessions = await invoke<ClaudeSessionSummary[]>(
          "get_claude_sessions",
          { projectPath },
        );
        if (cancelled) return;
        const match = sessions.find((s) => s.session_id === sessionId);
        if (match) {
          setUsage({
            inputTokens: match.input_tokens,
            outputTokens: match.output_tokens,
            model: match.model,
            cost: estimateCost(
              match.model,
              match.input_tokens,
              match.output_tokens,
            ),
          });
        }
      } catch {
        // Silently fail — session data may not exist yet
      }
    }

    poll();
    const interval = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, projectPath, isRunning]);

  return usage;
}
