import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export interface ClaudeSessionSummary {
  session_id: string;
  display: string;
  timestamp: string;
  project_path: string;
  input_tokens: number;
  output_tokens: number;
  model: string | null;
}

/**
 * Load past Claude Code sessions for a given project path.
 * Returns summaries that can be shown in the sidebar as "past sessions".
 */
export function useClaudeSessions(projectPath: string | null) {
  const [sessions, setSessions] = useState<ClaudeSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = () => {
    setReloadToken((current) => current + 1);
  };

  useEffect(() => {
    if (!projectPath) {
      setSessions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const result = await invoke<ClaudeSessionSummary[]>(
          "get_claude_sessions",
          { projectPath },
        );
        if (!cancelled) {
          setSessions(result);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectPath, reloadToken]);

  return { sessions, loading, error, reload };
}
