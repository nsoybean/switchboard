export interface TranscriptMetadataItem {
  label: string;
  value: string;
}

export interface SessionTranscriptEvent {
  id: string;
  kind: "message" | "reasoning" | "tool_call" | "tool_result";
  timestamp: string | null;
  role: "user" | "assistant" | "developer" | "system" | null;
  title: string | null;
  text: string | null;
  status: "success" | "error" | null;
  displayMode: "text" | "code" | "diff" | null;
  callId: string | null;
  metadata: TranscriptMetadataItem[];
}

export interface TranscriptToolGroup {
  kind: "tool";
  key: string;
  call: SessionTranscriptEvent | null;
  result: SessionTranscriptEvent | null;
}

export interface TranscriptEventGroup {
  kind: "event";
  key: string;
  event: SessionTranscriptEvent;
}

export type TranscriptDisplayItem = TranscriptToolGroup | TranscriptEventGroup;

export function buildTranscriptDisplayItems(
  events: SessionTranscriptEvent[],
): TranscriptDisplayItem[] {
  const items: TranscriptDisplayItem[] = [];
  const resultsByCallId = new Map<string, SessionTranscriptEvent>();
  const consumedResultIds = new Set<string>();

  for (const event of events) {
    if (
      event.kind === "tool_result" &&
      event.callId &&
      !resultsByCallId.has(event.callId)
    ) {
      resultsByCallId.set(event.callId, event);
    }
  }

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) continue;

    if (event.kind === "tool_call") {
      const result = event.callId
        ? (resultsByCallId.get(event.callId) ?? null)
        : null;
      if (result) {
        consumedResultIds.add(result.id);
        items.push({
          kind: "tool",
          key: `${event.id}:${result.id}`,
          call: event,
          result,
        });
        continue;
      }

      items.push({
        kind: "tool",
        key: event.id,
        call: event,
        result: null,
      });
      continue;
    }

    if (event.kind === "tool_result") {
      if (consumedResultIds.has(event.id)) {
        continue;
      }

      items.push({
        kind: "tool",
        key: event.id,
        call: null,
        result: event,
      });
      continue;
    }

    items.push({
      kind: "event",
      key: event.id,
      event,
    });
  }

  return items;
}
