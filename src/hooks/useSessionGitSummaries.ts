import { useEffect, useRef, useState } from "react";
import { gitCommands } from "../lib/tauri-commands";
import type { Session } from "../state/types";
import type { SessionGitSummary } from "../components/sidebar/SessionCard";

const POLL_INTERVAL_MS = 8000;

/** Polls git status summary for all live sessions that have a launchRoot */
export function useSessionGitSummaries(sessions: Session[]): Map<string, SessionGitSummary> {
  const [summaries, setSummaries] = useState<Map<string, SessionGitSummary>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only poll sessions that are live (not done/stopped) and have a valid path
  const liveSessions = sessions.filter(
    (s) =>
      (s.status === "running" || s.status === "idle" || s.status === "needs-input") &&
      s.workspace.launchRoot,
  );

  useEffect(() => {
    if (liveSessions.length === 0) return;

    const poll = async () => {
      const results = await Promise.allSettled(
        liveSessions.map(async (session) => {
          const summary = await gitCommands.statusSummary(session.workspace.launchRoot);
          return { id: session.id, summary };
        }),
      );

      setSummaries((prev) => {
        const next = new Map(prev);
        for (const result of results) {
          if (result.status === "fulfilled") {
            const { id, summary } = result.value;
            next.set(id, {
              ahead: summary.ahead,
              dirty: summary.dirty_count,
            });
          }
        }
        return next;
      });
    };

    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSessions.map((s) => s.id).join(",")]);

  return summaries;
}
