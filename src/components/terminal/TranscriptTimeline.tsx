import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DiffView } from "@/components/git/DiffView";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  buildTranscriptDisplayItems,
  type SessionTranscriptEvent,
  type TranscriptDisplayItem,
  type TranscriptMetadataItem,
} from "@/lib/session-transcript";

interface TranscriptTimelineProps {
  events: SessionTranscriptEvent[];
}

export function TranscriptTimeline({ events }: TranscriptTimelineProps) {
  const items = useMemo(() => buildTranscriptDisplayItems(events), [events]);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  const userSections = useMemo(
    () =>
      items.flatMap((item) =>
        item.kind === "event" && item.event.role === "user"
          ? [
              {
                id: item.event.id,
                preview: summarizeQueryPreview(item.event.text ?? ""),
              },
            ]
          : [],
      ),
    [items],
  );

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;

    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });

    return () => cancelAnimationFrame(frame);
  }, [items.length]);

  useLayoutEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport || userSections.length === 0) {
      setActiveQueryId(null);
      return;
    }

    const updateActiveQuery = () => {
      const scrollTop = viewport.scrollTop;
      let closestId: string | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const section of userSections) {
        const node = sectionRefs.current.get(section.id);
        if (!node) continue;
        const distance = Math.abs(node.offsetTop - scrollTop);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = section.id;
        }
      }

      setActiveQueryId(closestId);
    };

    updateActiveQuery();

    viewport.addEventListener("scroll", updateActiveQuery, { passive: true });
    const resizeObserver = new ResizeObserver(() => {
      updateActiveQuery();
    });
    resizeObserver.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", updateActiveQuery);
      resizeObserver.disconnect();
    };
  }, [userSections]);

  const setSectionRef = (id: string, node: HTMLDivElement | null) => {
    if (node) {
      sectionRefs.current.set(id, node);
    } else {
      sectionRefs.current.delete(id);
    }
  };

  const jumpToQuery = (id: string) => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    const node = sectionRefs.current.get(id);
    if (!viewport || !node) return;

    viewport.scrollTo({
      top: Math.max(node.offsetTop - 16, 0),
      behavior: "smooth",
    });
  };

  return (
    <div className="relative h-full min-w-0 bg-background font-sans text-foreground">
      <ScrollArea
        ref={scrollAreaRef}
        className="h-full [&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:w-3 [&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:border-l-border/60 [&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:bg-background/95 [&_[data-slot=scroll-area-thumb]]:rounded-none [&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/35 hover:[&_[data-slot=scroll-area-thumb]]:bg-muted-foreground/50"
      >
        <div className="w-full min-w-0 px-4 py-5 pr-5 sm:px-5 sm:pr-6">
          {items.length === 0 ? (
            <div className="rounded-none border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
              No transcript events found for this session.
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-0.5">
              {items.map((item) =>
                item.kind === "tool" ? (
                  <ToolTimelineCard key={item.key} item={item} />
                ) : (
                  <div
                    key={item.key}
                    ref={
                      item.event.role === "user"
                        ? (node) => setSectionRef(item.event.id, node)
                        : undefined
                    }
                  >
                    <TimelineEventCard event={item.event} />
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      {userSections.length > 0 && (
        <div className="absolute right-3 top-3 z-10 hidden sm:block">
          <HoverCard openDelay={0} closeDelay={80}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                aria-label="Show query navigation"
                className="flex size-8 items-center justify-center bg-background/90 backdrop-blur"
              >
                <QueryJumpTrigger />
              </button>
            </HoverCardTrigger>
            <HoverCardContent
              side="left"
              align="start"
              sideOffset={8}
              className="w-72 rounded-md border bg-popover p-2 font-sans shadow-md"
            >
              <div className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Jump to section
              </div>
              <div className="flex max-h-72 flex-col overflow-y-auto overscroll-y-contain">
                {userSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={cn(
                      "px-3 py-2 text-left text-sm transition-colors hover:bg-muted/55",
                      activeQueryId === section.id && "bg-muted/55",
                    )}
                    onClick={() => jumpToQuery(section.id)}
                  >
                    <span className="line-clamp-2 text-foreground">
                      {section.preview}
                    </span>
                  </button>
                ))}
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      )}
    </div>
  );
}

function TimelineEventCard({ event }: { event: SessionTranscriptEvent }) {
  if (event.role === "user") {
    return (
      <div className="pb-4">
        <div className="rounded-none border bg-accent/70 px-3.5 py-3">
          <PlainTextBlock text={event.text ?? ""} />
        </div>
      </div>
    );
  }

  if (event.kind === "reasoning") {
    return <ReasoningTimelineCard event={event} />;
  }

  return (
    <TimelineRow tone={eventTone(event.status)}>
      <MarkdownTextBlock text={event.text ?? ""} />
    </TimelineRow>
  );
}

function ReasoningTimelineCard({
  event,
}: {
  event: SessionTranscriptEvent;
}) {
  const text = event.text ?? "";
  const shouldCollapse =
    countLines(text) > 3 || text.length > 220 || text.includes("\n\n");
  const [expanded, setExpanded] = useState(!shouldCollapse);

  return (
    <TimelineRow tone="muted">
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium">{event.title ?? "Thinking"}</span>
            {!expanded && text && (
              <span className="truncate text-xs">
                {stripMarkdownAdornment(text)}
              </span>
            )}
          </div>
          {shouldCollapse && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <ChevronDown data-icon="inline-start" />
              ) : (
                <ChevronRight data-icon="inline-start" />
              )}
              {expanded ? "Collapse" : "Expand"}
            </Button>
          )}
        </div>
        {expanded && text && (
          <div className="text-sm text-muted-foreground">
            <MarkdownTextBlock text={text} />
          </div>
        )}
      </div>
    </TimelineRow>
  );
}

function ToolTimelineCard({
  item,
}: {
  item: Extract<TranscriptDisplayItem, { kind: "tool" }>;
}) {
  const title = item.call?.title ?? item.result?.title ?? "Tool";
  const inputMode = item.call?.displayMode ?? "text";
  const outputMode =
    item.result?.displayMode ?? item.call?.displayMode ?? "code";
  const inputMetadata = item.call?.metadata ?? [];
  const outputMetadata = item.result?.metadata ?? [];
  const primaryText = item.call?.text ?? null;
  const secondaryText = item.result?.text ?? null;
  const summary =
    outputMode === "diff" || inputMode === "diff"
      ? summarizeDiff(item.call?.text ?? item.result?.text)
      : null;
  const headerMetadata = buildHeaderMetadata(inputMetadata, outputMetadata);
  const detailInputMetadata = filterHeaderMetadata(
    inputMetadata,
    headerMetadata,
  );
  const detailOutputMetadata = filterHeaderMetadata(
    outputMetadata,
    headerMetadata,
  );
  const shouldCollapse =
    inputMode === "diff" ||
    outputMode === "diff" ||
    countLines(primaryText) > 8 ||
    countLines(secondaryText) > 10 ||
    (primaryText?.length ?? 0) > 360 ||
    (secondaryText?.length ?? 0) > 520;
  const [expanded, setExpanded] = useState(!shouldCollapse);
  const tone = resultTone(item.result?.status ?? null);

  return (
    <TimelineRow tone={tone}>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span
              className={cn(
                "font-semibold",
                tone === "error" && "text-destructive",
              )}
            >
              {title}
            </span>
            {headerMetadata.map((item) => (
              <span
                key={`${item.label}:${item.value}`}
                className="truncate text-xs text-muted-foreground"
              >
                {item.label === "File" ? basename(item.value) : item.value}
              </span>
            ))}
          </div>
          {shouldCollapse && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <ChevronDown data-icon="inline-start" />
              ) : (
                <ChevronRight data-icon="inline-start" />
              )}
              {expanded ? "Collapse" : "Expand"}
            </Button>
          )}
        </div>

        {(primaryText ||
          secondaryText ||
          detailInputMetadata.length > 0 ||
          detailOutputMetadata.length > 0) &&
          expanded && (
            <div className="overflow-hidden rounded-none border bg-muted/25">
              {summary && (
                <>
                  <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
                    {summary}
                  </div>
                  {(primaryText ||
                    secondaryText ||
                    detailInputMetadata.length > 0 ||
                    detailOutputMetadata.length > 0) && (
                    <div className="h-px bg-border" />
                  )}
                </>
              )}

              {(primaryText || detailInputMetadata.length > 0) && (
                <DetailSection
                  label="IN"
                  metadata={detailInputMetadata}
                  mode={inputMode}
                  text={primaryText}
                />
              )}

              {(secondaryText || detailOutputMetadata.length > 0) && (
                <>
                  {(primaryText || detailInputMetadata.length > 0) && (
                    <div className="h-px bg-border" />
                  )}
                  <DetailSection
                    label="OUT"
                    metadata={detailOutputMetadata}
                    mode={outputMode}
                    text={secondaryText}
                  />
                </>
              )}
            </div>
          )}
      </div>
    </TimelineRow>
  );
}

function DetailSection({
  label,
  metadata,
  mode,
  text,
}: {
  label: string | null;
  metadata: TranscriptMetadataItem[];
  mode: "text" | "code" | "diff";
  text: string | null;
}) {
  const compact = shouldUseCompactIoRow(mode, text, metadata);

  return (
    <div className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5 px-2.5 py-1.5">
      <div className="pt-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="min-w-0 flex flex-col gap-2">
        {compact ? (
          <div className="flex min-h-8 min-w-0 items-center gap-2 py-0">
            {metadata.length > 0 && (
              <div className="flex max-w-full shrink-0 flex-wrap gap-2 text-xs text-muted-foreground">
                {metadata.map((item) => (
                  <span
                    key={`${item.label}:${item.value}`}
                    className="max-w-full truncate"
                  >
                    {item.label === "File" ? basename(item.value) : item.value}
                  </span>
                ))}
              </div>
            )}
            {text ? (
              <div
                className={cn(
                  "min-w-0 truncate text-xs text-foreground",
                  mode !== "text" && "font-mono",
                )}
                title={text}
              >
                {text}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No content</div>
            )}
          </div>
        ) : (
          <>
            {metadata.length > 0 && (
              <div className="flex max-w-full flex-wrap gap-2 text-xs text-muted-foreground">
                {metadata.map((item) => (
                  <span
                    key={`${item.label}:${item.value}`}
                    className="max-w-full truncate"
                  >
                    {item.label === "File" ? basename(item.value) : item.value}
                  </span>
                ))}
              </div>
            )}
            {text ? (
              <StructuredBlock mode={mode} text={text} embedded />
            ) : (
              <div className="text-xs text-muted-foreground">No content</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TimelineRow({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "success" | "muted" | "error";
}) {
  return (
    <div className="relative min-w-0 pl-8 pb-5">
      <div className="absolute top-0 bottom-0 left-[10px] w-px -translate-x-1/2 bg-border/50" />
      <div
        className={cn(
          "absolute top-1 left-[10px] size-3 -translate-x-1/2 rounded-full border-2 border-background",
          tone === "success" && "bg-primary",
          tone === "error" && "bg-destructive",
          tone === "muted" && "bg-muted-foreground/60",
        )}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function eventTone(status: SessionTranscriptEvent["status"]) {
  if (status === "success") return "success";
  if (status === "error") return "error";
  return "muted";
}

function resultTone(status: SessionTranscriptEvent["status"]) {
  if (status === "error") return "error";
  return "muted";
}

function MarkdownTextBlock({ text }: { text: string }) {
  return (
    <div className="markdown-body flex flex-col gap-2.5 font-sans text-sm leading-6 text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="whitespace-pre-wrap break-words">{children}</p>
          ),
          ul: ({ children }) => <ul className="ml-5 list-disc">{children}</ul>,
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="whitespace-pre-wrap break-words">{children}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded-none bg-muted px-1.5 py-0.5 font-mono text-[0.92em]">
              {children}
            </code>
          ),
          pre: ({ children }) => {
            const code = extractMarkdownCodeBlock(children);
            return <StructuredBlock mode="code" text={code} />;
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function PlainTextBlock({ text }: { text: string }) {
  const sections = text.split(/```/g);

  return (
    <div className="flex flex-col gap-2.5 font-sans text-sm leading-6">
      {sections.map((section, index) => {
        const trimmed = section.trim();
        if (!trimmed) return null;

        if (index % 2 === 1) {
          return (
            <StructuredBlock
              key={`${index}:${trimmed.slice(0, 12)}`}
              mode="code"
              text={trimmed.replace(/^[a-zA-Z0-9_-]+\n/, "")}
            />
          );
        }

        return (
          <Fragment key={`${index}:${trimmed.slice(0, 12)}`}>
            {trimmed.split(/\n{2,}/).map((paragraph) => (
              <p
                key={paragraph.slice(0, 24)}
                className="whitespace-pre-wrap break-words"
              >
                {renderInlineCode(paragraph)}
              </p>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}

function StructuredBlock({
  mode,
  text,
  embedded = false,
}: {
  mode: "text" | "code" | "diff";
  text: string;
  embedded?: boolean;
}) {
  if (looksLikeChecklist(text)) {
    return <ChecklistBlock text={text} />;
  }

  if (mode === "diff") {
    return (
      <div className="min-w-0 max-w-full overflow-hidden">
        <DiffView diff={text} />
      </div>
    );
  }

  if (mode === "text" && looksLikeStructuredPayload(text)) {
    return (
      <pre
        className={cn(
          "min-w-0 max-w-full overflow-x-hidden rounded-none text-xs leading-5 font-mono whitespace-pre-wrap break-all text-foreground",
          embedded ? "px-0.5 py-0" : "border bg-background px-2.5 py-2",
        )}
      >
        {text}
      </pre>
    );
  }

  if (mode === "text") {
    return (
      <div className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
        {text}
      </div>
    );
  }

  return (
    <pre
      className={cn(
        "min-w-0 max-w-full overflow-x-hidden rounded-none text-xs leading-5 font-mono whitespace-pre-wrap break-all text-foreground",
        embedded ? "px-0.5 py-0" : "border bg-background px-2.5 py-2",
      )}
    >
      {text}
    </pre>
  );
}

function ChecklistBlock({ text }: { text: string }) {
  const items = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(":");
      return {
        checked: status === "completed",
        text: rest.join(":").trim(),
      };
    });

  return (
    <div className="flex flex-col gap-2 text-sm">
      {items.map((item) => (
        <div
          key={`${item.checked}:${item.text}`}
          className="flex items-start gap-3"
        >
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border bg-background">
            {item.checked ? <Check className="size-3" /> : null}
          </span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function renderInlineCode(text: string) {
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${index}:${part}`}
          className="rounded-none bg-muted px-1.5 py-0.5 font-mono text-[0.92em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <Fragment key={`${index}:${part}`}>{part}</Fragment>;
  });
}

function summarizeDiff(text: string | null | undefined) {
  if (!text) return null;

  let added = 0;
  let removed = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added += 1;
    if (line.startsWith("-")) removed += 1;
  }

  if (added && removed) return `Added ${added} lines, removed ${removed}`;
  if (added) return `Added ${added} lines`;
  if (removed) return `Removed ${removed} lines`;
  return "Updated file";
}

function filterHeaderMetadata(
  metadata: TranscriptMetadataItem[],
  headerMetadata: TranscriptMetadataItem[],
) {
  return metadata.filter(
    (item) =>
      !headerMetadata.some(
        (headerItem) =>
          headerItem.label === item.label && headerItem.value === item.value,
      ),
  );
}

function buildHeaderMetadata(
  inputMetadata: TranscriptMetadataItem[],
  outputMetadata: TranscriptMetadataItem[],
) {
  const preferredLabels = ["File", "Description", "Pattern", "Path"];
  const combined = [...inputMetadata, ...outputMetadata];
  const header: TranscriptMetadataItem[] = [];

  for (const label of preferredLabels) {
    const match = combined.find((item) => item.label === label);
    if (match) {
      header.push(match);
    }
  }

  return header;
}

function looksLikeChecklist(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.length > 1 &&
    lines.every((line) => /^(completed|pending|in_progress):\s+/i.test(line))
  );
}

function looksLikeStructuredPayload(text: string) {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (/^<[\w-]+>[\s\S]*<\/[\w-]+>$/.test(trimmed) && !trimmed.includes("\n\n"))
  );
}

function shouldUseCompactIoRow(
  mode: "text" | "code" | "diff",
  text: string | null,
  metadata: TranscriptMetadataItem[],
) {
  if (!text) return metadata.length > 0;
  if (mode === "diff") return false;
  if (looksLikeChecklist(text) || looksLikeStructuredPayload(text))
    return false;

  return countLines(text) === 1 && text.trim().length <= 160;
}

function countLines(text: string | null | undefined) {
  if (!text) return 0;
  return text.split("\n").length;
}

function basename(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || path;
}

function stripMarkdownAdornment(text: string) {
  return text.replace(/\*\*/g, "").replace(/`/g, "");
}

function summarizeQueryPreview(text: string) {
  const normalized = stripMarkdownAdornment(text).replace(/\s+/g, " ").trim();

  if (!normalized) return "User query";
  if (normalized.length <= 150) return normalized;
  return `${normalized.slice(0, 147).trimEnd()}...`;
}

function extractMarkdownCodeBlock(children: ReactNode) {
  const child = Children.toArray(children)[0];

  if (isValidElement<{ children?: ReactNode }>(child)) {
    return String(child.props.children ?? "").replace(/\n$/, "");
  }

  return String(children ?? "").replace(/\n$/, "");
}

function QueryJumpTrigger() {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="block h-1 w-5 rounded-full bg-foreground/90" />
      <span className="block h-1 w-5 rounded-full bg-foreground/70" />
      <span className="block h-1 w-5 rounded-full bg-foreground/50" />
      <span className="block h-1 w-5 rounded-full bg-foreground/30" />
    </div>
  );
}
