import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Eye, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { TranscriptTimeline } from "./TranscriptTimeline";
import type { SessionTranscriptEvent } from "@/lib/session-transcript";
import type { Session } from "../../state/types";

interface SessionTranscriptViewProps {
  session: Session;
  onClose: () => void;
  onResume?: () => void;
  showHeader?: boolean;
}


export function SessionTranscriptView({
  session,
  onClose,
  onResume,
  showHeader = true,
}: SessionTranscriptViewProps) {
  const [events, setEvents] = useState<SessionTranscriptEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (session.agent === "bash") {
        setEvents([
          {
            id: "bash-placeholder",
            kind: "message",
            timestamp: null,
            role: "assistant",
            title: null,
            text: "Transcript view is not available for bash sessions yet.",
            status: null,
            displayMode: "text",
            callId: null,
            metadata: [],
          },
        ]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const command =
          session.agent === "codex"
            ? "get_codex_session_transcript"
            : "get_claude_session_transcript";
        const transcript = await invoke<SessionTranscriptEvent[]>(command, {
          sessionId: session.resumeTargetId ?? session.id,
        });

        if (!cancelled) {
          setEvents(transcript);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message = String(err);
          if (message.includes("Could not find") || message.includes("session file")) {
            setEvents([]);
            setLoading(false);
          } else {
            setError(message);
            setLoading(false);
          }
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session.agent, session.id, session.resumeTargetId]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background font-sans text-foreground">
      {showHeader ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 text-sm">
          <AgentIcon agent={session.agent} className="size-4 shrink-0" />
          <span
            className="min-w-0 max-w-[40ch] truncate font-semibold"
            title={session.label}
          >
            {session.label}
          </span>
          <Badge variant="outline" className="text-[11px]">
            <Eye data-icon="inline-start" />
            view only
          </Badge>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {onResume && (
              <Button variant="outline" size="sm" onClick={onResume}>
                <RotateCcw data-icon="inline-start" />
                Resume
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X data-icon="inline-start" />
              Close
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex-1 min-h-0 min-w-0">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading transcript...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-6 text-sm text-destructive">
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages in this session
          </div>
        ) : (
          <TranscriptTimeline events={events} />
        )}
      </div>
    </div>
  );
}
