import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  FileText,
  GripVertical,
  Play,
  X,
} from "lucide-react";
import {
  ArrowLineDown,
  ArrowLineLeft,
  ArrowLineRight,
  ArrowLineUp,
  SplitHorizontal,
} from "@phosphor-icons/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndMonitor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { Session } from "@/state/types";
import {
  type PaneLayoutState,
  type PaneLeafNode,
  type PaneNode,
  type SplitDirection,
  closeLeaf,
  countLeaves,
  ensureActiveTabs,
  findLeaf,
  getFirstLeaf,
  moveTabBetweenLeaves,
  paneLayoutEqual,
  setLeafActiveTab,
  splitLeaf,
  splitLeafWithExternalTab,
  syncPaneLayout,
} from "@/lib/pane-tree";
import { InlineNewSession, type InlineNewSessionConfig } from "../session/InlineNewSession";
import { FilePreview } from "../files/FilePreview";
import { SessionTranscriptView } from "../terminal/SessionTranscriptView";
import { XTermContainer } from "../terminal/XTermContainer";

interface PaneWorkspaceProps {
  activeSession: Session | null;
  liveSessions: Session[];
  transcriptSession: Session | null;
  openFilePath: string | null;
  projectPath: string | null;
  onInlineNewSession: (config: InlineNewSessionConfig) => void;
  onSelectLiveSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCloseTranscript: () => void;
  onCloseFile: () => void;
  onResumeTranscript?: () => void;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
}

interface LiveSurface {
  id: string;
  kind: "live-session";
  session: Session;
  title: string;
  closable: true;
}

interface TranscriptSurface {
  id: string;
  kind: "transcript";
  session: Session;
  title: string;
  closable: true;
}

interface FileSurface {
  id: string;
  kind: "file";
  filePath: string;
  title: string;
  closable: true;
}

type PaneSurface = LiveSurface | TranscriptSurface | FileSurface;

type DropZone = "center" | "top" | "right" | "bottom" | "left";

interface TabDragData {
  type: "tab";
  tabId: string;
  fromLeafId: string;
}

function parseDropId(id: string): { leafId: string; zone: DropZone } | null {
  const parts = id.split("--pane-drop--");
  if (parts.length !== 2) return null;
  const [leafId, zone] = parts;
  if (!leafId || !zone) return null;
  return { leafId, zone: zone as DropZone };
}

function makeDragId(tabId: string, leafId: string) {
  return `tab--drag--${tabId}--${leafId}`;
}

function makeDropId(leafId: string, zone: DropZone) {
  return `${leafId}--pane-drop--${zone}`;
}

function parseDragId(id: string): { tabId: string; fromLeafId: string } | null {
  const prefix = "tab--drag--";
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  // fromLeafId is always "pane-<uuid>"; find the last "--pane-" occurrence
  const sep = "--pane-";
  const sepIdx = rest.lastIndexOf(sep);
  if (sepIdx === -1) return null;
  return { tabId: rest.slice(0, sepIdx), fromLeafId: `pane-${rest.slice(sepIdx + sep.length)}` };
}

function PaneSurfaceBadge({ surface }: { surface: PaneSurface }) {
  if (surface.kind === "live-session") {
    return (
      <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">
        Live
      </Badge>
    );
  }

  if (surface.kind === "file") {
    return null;
  }

  return (
    <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
      <Eye data-icon="inline-start" />
      Transcript
    </Badge>
  );
}

/** Drop overlay shown during drag over a pane — 5 zones: center + 4 edges */
function PaneDropOverlay({ leafId }: { leafId: string }) {
  const { setNodeRef: centerRef, isOver: centerOver } = useDroppable({ id: makeDropId(leafId, "center") });
  const { setNodeRef: topRef, isOver: topOver } = useDroppable({ id: makeDropId(leafId, "top") });
  const { setNodeRef: rightRef, isOver: rightOver } = useDroppable({ id: makeDropId(leafId, "right") });
  const { setNodeRef: bottomRef, isOver: bottomOver } = useDroppable({ id: makeDropId(leafId, "bottom") });
  const { setNodeRef: leftRef, isOver: leftOver } = useDroppable({ id: makeDropId(leafId, "left") });

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Edge zones — 25% strips, pointer-events-auto */}
      <div
        ref={topRef}
        className={cn(
          "pointer-events-auto absolute inset-x-0 top-0 h-1/4 transition-colors",
          topOver && "bg-primary/15",
        )}
      />
      <div
        ref={rightRef}
        className={cn(
          "pointer-events-auto absolute inset-y-0 right-0 w-1/4 transition-colors",
          rightOver && "bg-primary/15",
        )}
      />
      <div
        ref={bottomRef}
        className={cn(
          "pointer-events-auto absolute inset-x-0 bottom-0 h-1/4 transition-colors",
          bottomOver && "bg-primary/15",
        )}
      />
      <div
        ref={leftRef}
        className={cn(
          "pointer-events-auto absolute inset-y-0 left-0 w-1/4 transition-colors",
          leftOver && "bg-primary/15",
        )}
      />
      {/* Center zone — remaining 50% middle */}
      <div
        ref={centerRef}
        className={cn(
          "pointer-events-auto absolute inset-x-1/4 inset-y-1/4 transition-colors",
          centerOver && "bg-primary/15",
        )}
      />
      {/* Direction arrows when hovering an edge */}
      {topOver && (
        <div className="pointer-events-none absolute inset-x-0 top-[12.5%] flex -translate-y-1/2 justify-center">
          <ArrowLineUp className="size-5 text-primary drop-shadow" />
        </div>
      )}
      {rightOver && (
        <div className="pointer-events-none absolute inset-y-0 right-[12.5%] flex translate-x-1/2 items-center">
          <ArrowLineRight className="size-5 text-primary drop-shadow" />
        </div>
      )}
      {bottomOver && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[12.5%] flex translate-y-1/2 justify-center">
          <ArrowLineDown className="size-5 text-primary drop-shadow" />
        </div>
      )}
      {leftOver && (
        <div className="pointer-events-none absolute inset-y-0 left-[12.5%] flex -translate-x-1/2 items-center">
          <ArrowLineLeft className="size-5 text-primary drop-shadow" />
        </div>
      )}
      {centerOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-primary/80 px-2 py-1 text-[11px] font-medium text-primary-foreground">
            Add tab
          </span>
        </div>
      )}
    </div>
  );
}

/** Draggable tab button — drag handle only, never the terminal surface */
function DraggableTab({
  tabId,
  leafId,
  isActive,
  surface,
  onSelectTab,
  onCloseSession,
  onCloseFile,
  onCloseTranscript,
  onSelectLiveSession,
}: {
  tabId: string;
  leafId: string;
  isActive: boolean;
  surface: PaneSurface;
  onSelectTab: () => void;
  onCloseSession: (id: string) => void;
  onCloseFile: (id: string) => void;
  onCloseTranscript: () => void;
  onSelectLiveSession: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: makeDragId(tabId, leafId),
    data: { type: "tab", tabId, fromLeafId: leafId } satisfies TabDragData,
  });

  return (
    <button
      ref={setNodeRef}
      key={tabId}
      type="button"
      onClick={() => {
        onSelectTab();
        if (surface.kind === "live-session") {
          onSelectLiveSession(surface.session.id);
        }
      }}
      className={cn(
        "group/pane-tab relative flex max-w-[260px] shrink-0 items-center gap-1.5 pl-1.5 pr-3 py-2 text-left text-xs transition-colors",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        isDragging && "opacity-40",
      )}
    >
      {/* Drag handle — only this area activates the drag sensor */}
      <span
        {...attributes}
        {...listeners}
        className="inline-flex size-4 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/pane-tab:opacity-60 active:cursor-grabbing"
        aria-label="Drag tab"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-3" />
      </span>
      {surface.kind === "file" ? (
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <AgentIcon agent={surface.session.agent} className="size-3.5 shrink-0" />
      )}
      <span className="truncate font-medium">{surface.title}</span>
      <PaneSurfaceBadge surface={surface} />
      {surface.closable ? (
        <span
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/pane-tab:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            if (surface.kind === "live-session") {
              onCloseSession(surface.session.id);
            } else if (surface.kind === "file") {
              onCloseFile(surface.id);
            } else {
              onCloseTranscript();
            }
          }}
          role="button"
          aria-label={`Close ${surface.title}`}
        >
          <X className="size-3" />
        </span>
      ) : null}
      {isActive && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-foreground" />
      )}
    </button>
  );
}

function PaneLeafView({
  leaf,
  paneCount,
  surfacesById,
  onFocusPane,
  onSelectTab,
  onSplit,
  onClosePane,
  onCloseSession,
  onCloseTranscript,
  onCloseFile,
  onResumeTranscript,
  onSelectLiveSession,
  onSessionStart,
  onSessionExit,
}: {
  leaf: PaneLeafNode;
  paneCount: number;
  surfacesById: Map<string, PaneSurface>;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCloseTranscript: () => void;
  onCloseFile: (surfaceId: string) => void;
  onResumeTranscript?: () => void;
  onSelectLiveSession: (sessionId: string) => void;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
}) {
  const [isDragActive, setIsDragActive] = useState(false);

  useDndMonitor({
    onDragStart: () => setIsDragActive(true),
    onDragEnd: () => setIsDragActive(false),
    onDragCancel: () => setIsDragActive(false),
  });

  const activeSurface =
    (leaf.activeTabId ? surfacesById.get(leaf.activeTabId) : null) ??
    surfacesById.get(leaf.tabIds[0]) ??
    null;
  const canSplit = Boolean(activeSurface);
  const canResumeActiveTranscript =
    activeSurface?.kind === "transcript" &&
    activeSurface.session.agent !== "bash" &&
    Boolean(onResumeTranscript);

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col"
      onMouseDown={() => onFocusPane(leaf.id)}
    >
      {/* Drop overlay — shown during any drag */}
      {isDragActive && <PaneDropOverlay leafId={leaf.id} />}

      {/* Tab bar */}
      <div className="relative shrink-0 bg-muted/50">
        <div className="flex items-center">
          <div className="flex min-w-0 flex-1 items-end gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {leaf.tabIds.map((tabId) => {
              const surface = surfacesById.get(tabId);
              if (!surface) return null;
              const isActive = tabId === leaf.activeTabId;
              return (
                <DraggableTab
                  key={tabId}
                  tabId={tabId}
                  leafId={leaf.id}
                  isActive={isActive}
                  surface={surface}
                  onSelectTab={() => onSelectTab(leaf.id, tabId)}
                  onCloseSession={onCloseSession}
                  onCloseFile={onCloseFile}
                  onCloseTranscript={onCloseTranscript}
                  onSelectLiveSession={onSelectLiveSession}
                />
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-0.5 px-2">
            {canResumeActiveTranscript ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1.5 px-2 text-[11px]"
                onClick={() => onResumeTranscript?.()}
              >
                <Play className="size-3.5" />
                Resume
              </Button>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={!canSplit}
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors",
                    canSplit
                      ? "hover:bg-accent hover:text-foreground"
                      : "cursor-not-allowed opacity-30",
                  )}
                  title="Split pane"
                  aria-label="Split pane"
                >
                  <SplitHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {([
                  { direction: "right", label: "Split right", icon: ArrowLineRight },
                  { direction: "left", label: "Split left", icon: ArrowLineLeft },
                  { direction: "down", label: "Split down", icon: ArrowLineDown },
                  { direction: "up", label: "Split up", icon: ArrowLineUp },
                ] as const).map((action) => {
                  const Icon = action.icon;
                  return (
                    <DropdownMenuItem
                      key={action.direction}
                      onClick={() => onSplit(leaf.id, action.direction)}
                    >
                      <Icon className="size-3.5" />
                      {action.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {paneCount > 1 ? (
              <button
                type="button"
                onClick={() => onClosePane(leaf.id)}
                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Close pane"
                aria-label="Close pane"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-border" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {leaf.tabIds.map((tabId) => {
          const surface = surfacesById.get(tabId);
          if (!surface) return null;
          const isActive = tabId === leaf.activeTabId;

          return (
            <div key={tabId} className={cn(
              "h-full min-h-0",
              isActive ? "block" : "hidden",
              surface.kind !== "live-session" && "p-1",
            )}>
              {surface.kind === "live-session" ? (
                <XTermContainer
                  tileId={surface.session.id}
                  command={surface.session.command}
                  args={surface.session.args}
                  cwd={surface.session.cwd}
                  env={surface.session.env}
                  onStart={() => onSessionStart(surface.session.id)}
                  onExit={onSessionExit(surface.session.id)}
                  closeOnUnmount={false}
                />
              ) : surface.kind === "file" ? (
                <FilePreview
                  filePath={surface.filePath}
                  onClose={() => onCloseFile(surface.id)}
                  showHeader={false}
                />
              ) : (
                <SessionTranscriptView
                  session={surface.session}
                  onClose={onCloseTranscript}
                  onResume={onResumeTranscript}
                  showHeader={false}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaneTreeView({
  node,
  paneCount,
  surfacesById,
  activePaneId,
  onFocusPane,
  onSelectTab,
  onSplit,
  onClosePane,
  onCloseSession,
  onCloseTranscript,
  onCloseFile,
  onResumeTranscript,
  onSelectLiveSession,
  onSessionStart,
  onSessionExit,
}: {
  node: PaneNode;
  paneCount: number;
  surfacesById: Map<string, PaneSurface>;
  activePaneId: string | null;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCloseTranscript: () => void;
  onCloseFile: (surfaceId: string) => void;
  onResumeTranscript?: () => void;
  onSelectLiveSession: (sessionId: string) => void;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
}) {
  if (node.kind === "leaf") {
    return (
      <PaneLeafView
        leaf={node}
        paneCount={paneCount}
        surfacesById={surfacesById}
        onFocusPane={onFocusPane}
        onSelectTab={onSelectTab}
        onSplit={onSplit}
        onClosePane={onClosePane}
        onCloseSession={onCloseSession}
        onCloseTranscript={onCloseTranscript}
        onCloseFile={onCloseFile}
        onResumeTranscript={onResumeTranscript}
        onSelectLiveSession={onSelectLiveSession}
        onSessionStart={onSessionStart}
        onSessionExit={onSessionExit}
      />
    );
  }

  const defaultSize = 100 / node.children.length;

  return (
    <ResizablePanelGroup orientation={node.axis}>
      {node.children.flatMap((child, index) => {
        const panel = (
          <ResizablePanel key={child.id} defaultSize={defaultSize} minSize={10}>
            <PaneTreeView
              node={child}
              paneCount={paneCount}
              surfacesById={surfacesById}
              activePaneId={activePaneId}
              onFocusPane={onFocusPane}
              onSelectTab={onSelectTab}
              onSplit={onSplit}
              onClosePane={onClosePane}
              onCloseSession={onCloseSession}
              onCloseTranscript={onCloseTranscript}
              onCloseFile={onCloseFile}
              onResumeTranscript={onResumeTranscript}
              onSelectLiveSession={onSelectLiveSession}
              onSessionStart={onSessionStart}
              onSessionExit={onSessionExit}
            />
          </ResizablePanel>
        );
        return index === 0
          ? [panel]
          : [<ResizableHandle key={`handle-${child.id}`} />, panel];
      })}
    </ResizablePanelGroup>
  );
}

export function PaneWorkspace({
  activeSession,
  liveSessions,
  transcriptSession,
  openFilePath,
  projectPath,
  onInlineNewSession,
  onSelectLiveSession,
  onCloseSession,
  onCloseTranscript,
  onCloseFile,
  onResumeTranscript,
  onSessionStart,
  onSessionExit,
}: PaneWorkspaceProps) {
  const surfaces = useMemo<PaneSurface[]>(() => {
    const nextSurfaces: PaneSurface[] = liveSessions.map((session) => ({
      id: `live:${session.id}`,
      kind: "live-session",
      session,
      title: session.label || "New session",
      closable: true,
    }));

    if (transcriptSession) {
      nextSurfaces.push({
        id: `transcript:${transcriptSession.resumeTargetId ?? transcriptSession.id}`,
        kind: "transcript",
        session: transcriptSession,
        title: transcriptSession.label,
        closable: true,
      });
    }

    if (openFilePath) {
      const fileName = openFilePath.split("/").pop() ?? openFilePath;
      nextSurfaces.push({
        id: `file:${openFilePath}`,
        kind: "file",
        filePath: openFilePath,
        title: fileName,
        closable: true,
      });
    }

    return nextSurfaces;
  }, [liveSessions, transcriptSession, openFilePath]);

  const surfacesById = useMemo(
    () => new Map(surfaces.map((surface) => [surface.id, surface])),
    [surfaces],
  );
  const preferredTabId = openFilePath
    ? `file:${openFilePath}`
    : transcriptSession
      ? `transcript:${transcriptSession.resumeTargetId ?? transcriptSession.id}`
      : activeSession
        ? `live:${activeSession.id}`
        : null;
  const [layout, setLayout] = useState<PaneLayoutState>({ root: null, activePaneId: null });
  const [dragSurface, setDragSurface] = useState<PaneSurface | null>(null);

  useEffect(() => {
    setLayout((current) => {
      const next = syncPaneLayout(current, surfaces, preferredTabId);
      return paneLayoutEqual(current, next) ? current : next;
    });
  }, [preferredTabId, surfaces]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const parsed = parseDragId(String(event.active.id));
    if (parsed) {
      setDragSurface(surfacesById.get(parsed.tabId) ?? null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragSurface(null);

    const { active, over } = event;
    if (!over) return;

    const drag = parseDragId(String(active.id));
    const drop = parseDropId(String(over.id));
    if (!drag || !drop) return;

    const { tabId, fromLeafId } = drag;
    const { leafId: toLeafId, zone } = drop;

    setLayout((current) => {
      if (!current.root) return current;

      let nextRoot = current.root;
      let nextActivePaneId = current.activePaneId;

      if (zone === "center") {
        if (fromLeafId === toLeafId) return current;
        nextRoot = moveTabBetweenLeaves(nextRoot, fromLeafId, tabId, toLeafId);
        nextRoot = ensureActiveTabs(nextRoot);
        nextActivePaneId = toLeafId;
      } else {
        const directionMap: Record<Exclude<DropZone, "center">, SplitDirection> = {
          top: "up",
          right: "right",
          bottom: "down",
          left: "left",
        };
        const direction = directionMap[zone];
        const result = splitLeafWithExternalTab(nextRoot, toLeafId, direction, tabId, fromLeafId);
        nextRoot = ensureActiveTabs(result.root);
        nextActivePaneId = result.activePaneId ?? current.activePaneId;
      }

      const next = { root: nextRoot, activePaneId: nextActivePaneId };
      return paneLayoutEqual(current, next) ? current : next;
    });
  };

  const paneCount = countLeaves(layout.root);

  if (surfaces.length === 0 || !layout.root) {
    return <InlineNewSession projectPath={projectPath} onSubmit={onInlineNewSession} />;
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
        <PaneTreeView
          node={layout.root}
          paneCount={paneCount}
          surfacesById={surfacesById}
          activePaneId={layout.activePaneId}
          onFocusPane={(paneId) => {
            setLayout((current) =>
              current.activePaneId === paneId ? current : { ...current, activePaneId: paneId },
            );
          }}
          onSelectTab={(paneId, tabId) => {
            setLayout((current) => {
              if (!current.root) return current;
              const nextRoot = setLeafActiveTab(current.root, paneId, tabId);
              const nextState = { root: nextRoot, activePaneId: paneId };
              return paneLayoutEqual(current, nextState) ? current : nextState;
            });
          }}
          onSplit={(paneId, direction) => {
            setLayout((current) => {
              if (!current.root) return current;
              const leaf = findLeaf(current.root, paneId);
              const activeTabId = leaf?.activeTabId ?? null;
              if (!leaf || !activeTabId || leaf.tabIds.length < 2) return current;
              const next = splitLeaf(current.root, paneId, direction, activeTabId);
              return {
                root: ensureActiveTabs(next.root),
                activePaneId: next.activePaneId ?? current.activePaneId,
              };
            });
          }}
          onClosePane={(paneId) => {
            setLayout((current) => {
              if (!current.root || countLeaves(current.root) <= 1) return current;
              const next = closeLeaf(current.root, paneId);
              if (!next.node) return current;
              return {
                root: ensureActiveTabs(next.node),
                activePaneId: next.focusLeafId ?? getFirstLeaf(next.node)?.id ?? null,
              };
            });
          }}
          onCloseSession={onCloseSession}
          onCloseTranscript={onCloseTranscript}
          onCloseFile={onCloseFile}
          onResumeTranscript={onResumeTranscript}
          onSelectLiveSession={onSelectLiveSession}
          onSessionStart={onSessionStart}
          onSessionExit={onSessionExit}
        />
      </div>

      {/* Drag preview ghost */}
      <DragOverlay dropAnimation={null}>
        {dragSurface ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs shadow-lg">
            {dragSurface.kind === "file" ? (
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <AgentIcon agent={dragSurface.session.agent} className="size-3.5 shrink-0" />
            )}
            <span className="font-medium">{dragSurface.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
