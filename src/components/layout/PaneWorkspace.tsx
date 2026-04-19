import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import {
  Eye,
  FileText,
  GripVertical,
  Plus,
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
import { workspaceLayoutCommands } from "@/lib/tauri-commands";
import { getSwitchboardFileDragPath } from "@/lib/file-dnd";
import { cn } from "@/lib/utils";
import type { Session } from "@/state/types";
import {
  appendTabsToLeaf,
  type PaneLayoutState,
  type PaneLeafNode,
  type PaneNode,
  type SplitDirection,
  closeLeaf,
  countLeaves,
  ensureActiveTabs,
  findLeaf,
  findLeafContainingTab,
  getFirstLeaf,
  moveTabBetweenLeaves,
  paneLayoutEqual,
  setLeafActiveTab,
  splitLeaf,
  splitLeafWithExternalTab,
  syncPaneLayout,
} from "@/lib/pane-tree";
import { StatusDot } from "../ui/status-dot";
import { InlineNewSession, type InlineNewSessionConfig } from "../session/InlineNewSession";
import { FilePreview } from "../files/FilePreview";
import { SessionTranscriptView } from "../terminal/SessionTranscriptView";
import { XTermContainer } from "../terminal/XTermContainer";

interface PaneWorkspaceProps {
  activeSession: Session | null;
  liveSessions: Session[];
  transcriptSession: Session | null;
  openFilePath: string | null;
  revealRequest: { tabId: string; nonce: number } | null;
  projectPath: string | null;
  projectPaths: string[];
  onInlineNewSession: (config: InlineNewSessionConfig) => void;
  onInlineProjectSelect?: (projectPath: string) => Promise<void> | void;
  onSelectLiveSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCloseTranscript: () => void;
  onCloseFile: (filePath: string) => void;
  onResumeTranscript?: () => void;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
  onOpenTabIdsChange?: (sessionIds: string[]) => void;
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

function tabIdForFilePath(filePath: string) {
  return `file:${filePath}`;
}

function filePathFromTabId(tabId: string): string | null {
  return tabId.startsWith("file:") ? tabId.slice(5) : null;
}

function resolveDropZoneFromPoint(
  event: Pick<ReactDragEvent<HTMLElement>, "clientX" | "clientY" | "currentTarget">,
): DropZone {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  if (y < 0.25) return "top";
  if (y > 0.75) return "bottom";
  if (x < 0.25) return "left";
  if (x > 0.75) return "right";
  return "center";
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
  if (surface.kind !== "transcript") {
    return null;
  }

  return (
    <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
      <Eye data-icon="inline-start" />
      Transcript
    </Badge>
  );
}

function DropHint({
  icon,
  label,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-lg shadow-black/10 backdrop-blur-sm",
        className,
      )}
    >
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/12 text-primary">
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

/** Drop overlay shown during drag over a pane — 5 zones: center + 4 edges */
function PaneDropOverlay({
  leafId,
  forcedZone = null,
  interactive = true,
}: {
  leafId: string;
  forcedZone?: DropZone | null;
  interactive?: boolean;
}) {
  const { setNodeRef: centerRef, isOver: centerOver } = useDroppable({ id: makeDropId(leafId, "center") });
  const { setNodeRef: topRef, isOver: topOver } = useDroppable({ id: makeDropId(leafId, "top") });
  const { setNodeRef: rightRef, isOver: rightOver } = useDroppable({ id: makeDropId(leafId, "right") });
  const { setNodeRef: bottomRef, isOver: bottomOver } = useDroppable({ id: makeDropId(leafId, "bottom") });
  const { setNodeRef: leftRef, isOver: leftOver } = useDroppable({ id: makeDropId(leafId, "left") });

  const topActive = topOver || forcedZone === "top";
  const rightActive = rightOver || forcedZone === "right";
  const bottomActive = bottomOver || forcedZone === "bottom";
  const leftActive = leftOver || forcedZone === "left";
  const centerActive = centerOver || forcedZone === "center";
  const hitZoneClass = interactive ? "pointer-events-auto" : "pointer-events-none";

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Drop hit zones — keep these generous, but render a larger preview */}
      <div
        ref={topRef}
        className={cn(hitZoneClass, "absolute inset-x-0 top-0 h-1/4")}
      />
      <div
        ref={rightRef}
        className={cn(hitZoneClass, "absolute inset-y-0 right-0 w-1/4")}
      />
      <div
        ref={bottomRef}
        className={cn(hitZoneClass, "absolute inset-x-0 bottom-0 h-1/4")}
      />
      <div
        ref={leftRef}
        className={cn(hitZoneClass, "absolute inset-y-0 left-0 w-1/4")}
      />
      <div
        ref={centerRef}
        className={cn(hitZoneClass, "absolute inset-x-1/4 inset-y-1/4")}
      />
      {/* Visual previews */}
      {topActive && (
        <div className="absolute inset-x-0 top-0 h-1/2 rounded-[14px] bg-primary/10 ring-1 ring-inset ring-primary/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]" />
      )}
      {rightActive && (
        <div className="absolute inset-y-0 right-0 w-1/2 rounded-[14px] bg-primary/10 ring-1 ring-inset ring-primary/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]" />
      )}
      {bottomActive && (
        <div className="absolute inset-x-0 bottom-0 h-1/2 rounded-[14px] bg-primary/10 ring-1 ring-inset ring-primary/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]" />
      )}
      {leftActive && (
        <div className="absolute inset-y-0 left-0 w-1/2 rounded-[14px] bg-primary/10 ring-1 ring-inset ring-primary/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]" />
      )}
      {centerActive && (
        <div className="absolute inset-x-1/4 inset-y-1/4 rounded-[14px] bg-primary/12 ring-1 ring-inset ring-primary/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]" />
      )}
      {/* Direction hints centered within the resulting preview area */}
      {topActive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-1/2 items-center justify-center">
          <DropHint icon={<ArrowLineUp className="size-3.5" weight="bold" />} label="Split up" />
        </div>
      )}
      {rightActive && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-1/2 items-center justify-center">
          <DropHint icon={<ArrowLineRight className="size-3.5" weight="bold" />} label="Split right" />
        </div>
      )}
      {bottomActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-1/2 items-center justify-center">
          <DropHint icon={<ArrowLineDown className="size-3.5" weight="bold" />} label="Split down" />
        </div>
      )}
      {leftActive && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-1/2 items-center justify-center">
          <DropHint icon={<ArrowLineLeft className="size-3.5" weight="bold" />} label="Split left" />
        </div>
      )}
      {centerActive && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <DropHint
            icon={<Plus className="size-3.5" strokeWidth={2.2} />}
            label="Add as tab"
          />
        </div>
      )}
    </div>
  );
}

/** Draggable tab button — the whole tab header acts as the drag target */
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
      {...attributes}
      {...listeners}
      onClick={() => {
        onSelectTab();
        if (surface.kind === "live-session") {
          onSelectLiveSession(surface.session.id);
        }
      }}
      className={cn(
        "group/pane-tab relative flex max-w-[260px] shrink-0 cursor-pointer items-center gap-1.5 pl-1.5 pr-3 py-2 text-left text-xs transition-colors active:cursor-grabbing",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        isDragging && "opacity-40",
      )}
    >
      <span
        className="inline-flex size-4 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/pane-tab:opacity-60 active:cursor-grabbing"
        aria-label="Drag tab"
      >
        <GripVertical className="size-3" />
      </span>
      {surface.kind === "file" ? (
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <AgentIcon agent={surface.session.agent} className="size-3.5 shrink-0" />
      )}
      <span className="truncate font-medium">{surface.title}</span>
      {surface.kind !== "file" && (
        <StatusDot status={surface.session.status} />
      )}
      <PaneSurfaceBadge surface={surface} />
      {surface.closable ? (
        <span
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/pane-tab:opacity-100"
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
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
  onExternalFileDrop,
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
  onExternalFileDrop: (leafId: string, zone: DropZone, filePath: string) => void;
  onResumeTranscript?: () => void;
  onSelectLiveSession: (sessionId: string) => void;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [externalDropZone, setExternalDropZone] = useState<DropZone | null>(null);

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

  const handleBodyDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const filePath = getSwitchboardFileDragPath(event.dataTransfer);
    if (!filePath) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setExternalDropZone(resolveDropZoneFromPoint(event));
  }, []);

  const handleBodyDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const filePath = getSwitchboardFileDragPath(event.dataTransfer);
    if (!filePath) return;

    event.preventDefault();
    event.stopPropagation();

    const zone = resolveDropZoneFromPoint(event);
    setExternalDropZone(null);
    onExternalFileDrop(leaf.id, zone, filePath);
  }, [leaf.id, onExternalFileDrop]);

  const handleBodyDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const filePath = getSwitchboardFileDragPath(event.dataTransfer);
    if (!filePath) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (outside) {
      setExternalDropZone(null);
    }
  }, []);

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col"
      onMouseDown={() => onFocusPane(leaf.id)}
    >
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

      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-background"
        onDragOver={handleBodyDragOver}
        onDrop={handleBodyDrop}
        onDragLeave={handleBodyDragLeave}
      >
        {/* Drop overlay — shown during drag only over the pane body, not the tab strip */}
        {(isDragActive || externalDropZone !== null) && (
          <PaneDropOverlay
            leafId={leaf.id}
            forcedZone={externalDropZone}
            interactive={isDragActive}
          />
        )}
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
                  isVisible={isActive}
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
  sizesByGroupId,
  onFocusPane,
  onSelectTab,
  onSplit,
  onClosePane,
  onCloseSession,
  onCloseTranscript,
  onCloseFile,
  onExternalFileDrop,
  onResumeTranscript,
  onSelectLiveSession,
  onSessionStart,
  onSessionExit,
  onSizeChange,
}: {
  node: PaneNode;
  paneCount: number;
  surfacesById: Map<string, PaneSurface>;
  activePaneId: string | null;
  sizesByGroupId: Record<string, Record<string, number>>;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCloseTranscript: () => void;
  onCloseFile: (surfaceId: string) => void;
  onExternalFileDrop: (leafId: string, zone: DropZone, filePath: string) => void;
  onResumeTranscript?: () => void;
  onSelectLiveSession: (sessionId: string) => void;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
  onSizeChange: (groupId: string, sizes: Record<string, number>) => void;
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
        onExternalFileDrop={onExternalFileDrop}
        onResumeTranscript={onResumeTranscript}
        onSelectLiveSession={onSelectLiveSession}
        onSessionStart={onSessionStart}
        onSessionExit={onSessionExit}
      />
    );
  }

  const storedSizes = sizesByGroupId[node.id];
  const defaultEqualSize = 100 / node.children.length;

  return (
    <ResizablePanelGroup orientation={node.axis} onLayoutChange={(sizes) => onSizeChange(node.id, sizes)}>
      {node.children.flatMap((child, index) => {
        const defaultSize = storedSizes?.[child.id] ?? defaultEqualSize;
        const panel = (
          <ResizablePanel key={child.id} id={child.id} defaultSize={defaultSize} minSize={10}>
            <PaneTreeView
              node={child}
              paneCount={paneCount}
              surfacesById={surfacesById}
              activePaneId={activePaneId}
              sizesByGroupId={sizesByGroupId}
              onFocusPane={onFocusPane}
              onSelectTab={onSelectTab}
              onSplit={onSplit}
              onClosePane={onClosePane}
              onCloseSession={onCloseSession}
              onCloseTranscript={onCloseTranscript}
              onCloseFile={onCloseFile}
              onExternalFileDrop={onExternalFileDrop}
              onResumeTranscript={onResumeTranscript}
              onSelectLiveSession={onSelectLiveSession}
              onSessionStart={onSessionStart}
              onSessionExit={onSessionExit}
              onSizeChange={onSizeChange}
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
  revealRequest,
  projectPath,
  projectPaths,
  onInlineNewSession,
  onInlineProjectSelect,
  onSelectLiveSession,
  onCloseSession,
  onCloseTranscript,
  onCloseFile,
  onResumeTranscript,
  onSessionStart,
  onSessionExit,
  onOpenTabIdsChange,
}: PaneWorkspaceProps) {
  const [fileSurfacePaths, setFileSurfacePaths] = useState<string[]>([]);
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

    for (const filePath of fileSurfacePaths) {
      const fileName = filePath.split("/").pop() ?? filePath;
      nextSurfaces.push({
        id: tabIdForFilePath(filePath),
        kind: "file",
        filePath,
        title: fileName,
        closable: true,
      });
    }

    return nextSurfaces;
  }, [fileSurfacePaths, liveSessions, transcriptSession]);

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
  const [sizesByGroupId, setSizesByGroupId] = useState<Record<string, Record<string, number>>>({});
  const [hydrated, setHydrated] = useState(false);
  const [dragSurface, setDragSurface] = useState<PaneSurface | null>(null);

  const pendingSaveRef = useRef<{ layout: PaneLayoutState; sizesByGroupId: Record<string, Record<string, number>> } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRevealNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!openFilePath) return;
    setFileSurfacePaths((current) =>
      current.includes(openFilePath) ? current : [...current, openFilePath],
    );
  }, [openFilePath]);

  useEffect(() => {
    if (!projectPath) {
      setFileSurfacePaths([]);
      return;
    }

    setFileSurfacePaths((current) =>
      current.filter((path) => path === projectPath || path.startsWith(`${projectPath}/`)),
    );

    if (openFilePath && openFilePath !== projectPath && !openFilePath.startsWith(`${projectPath}/`)) {
      onCloseFile(openFilePath);
    }
  }, [onCloseFile, openFilePath, projectPath]);

  const flushSave = useCallback(() => {
    if (!pendingSaveRef.current) return;
    const { layout: l, sizesByGroupId: s } = pendingSaveRef.current;
    pendingSaveRef.current = null;
    workspaceLayoutCommands.save(JSON.stringify({ root: l.root, activePaneId: l.activePaneId, sizesByGroupId: s }));
  }, []);

  const scheduleSave = useCallback((l: PaneLayoutState, s: Record<string, Record<string, number>>) => {
    pendingSaveRef.current = { layout: l, sizesByGroupId: s };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      flushSave();
    }, 500);
  }, [flushSave]);

  // Load persisted layout on mount
  useEffect(() => {
    workspaceLayoutCommands.load().then((raw) => {
      if (raw) {
        try {
          const persisted = JSON.parse(raw);
          if (persisted.root) {
            setLayout({ root: persisted.root, activePaneId: persisted.activePaneId ?? null });
          }
          if (persisted.sizesByGroupId) {
            setSizesByGroupId(persisted.sizesByGroupId);
          }
        } catch { /* corrupt — start fresh */ }
      }
    }).catch(() => { /* ignore */ }).finally(() => setHydrated(true));
  }, []);

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushSave();
    };
  }, [flushSave]);

  // Sync layout against live surfaces (runs after hydration to preserve persisted tree)
  useEffect(() => {
    if (!hydrated) return;
    setLayout((current) => {
      const next = syncPaneLayout(current, surfaces, preferredTabId);
      return paneLayoutEqual(current, next) ? current : next;
    });
  }, [hydrated, preferredTabId, surfaces]);

  useEffect(() => {
    if (!hydrated || !revealRequest?.tabId) return;
    if (handledRevealNonceRef.current === revealRequest.nonce) return;

    handledRevealNonceRef.current = revealRequest.nonce;
    setLayout((current) => {
      const next = syncPaneLayout(current, surfaces, revealRequest.tabId, {
        forceFocusPreferred: true,
      });
      return paneLayoutEqual(current, next) ? current : next;
    });
  }, [hydrated, revealRequest, surfaces]);

  // Persist layout + sizes whenever they change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    scheduleSave(layout, sizesByGroupId);
  }, [hydrated, layout, sizesByGroupId, scheduleSave]);

  // Report open tab session IDs to parent whenever layout changes
  useEffect(() => {
    if (!onOpenTabIdsChange) return;
    const allTabIds = layout.root
      ? (() => {
          const ids: string[] = [];
          const visit = (node: typeof layout.root): void => {
            if (!node) return;
            if (node.kind === "leaf") {
              for (const tabId of node.tabIds) {
                if (tabId.startsWith("live:")) ids.push(tabId.slice(5));
              }
            } else {
              for (const child of node.children) visit(child);
            }
          };
          visit(layout.root);
          return ids;
        })()
      : [];
    onOpenTabIdsChange(allTabIds);
  }, [layout, onOpenTabIdsChange]);

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

  const handleCloseFileSurface = useCallback((surfaceId: string) => {
    const filePath = filePathFromTabId(surfaceId);
    if (!filePath) return;

    setFileSurfacePaths((current) => current.filter((path) => path !== filePath));

    if (openFilePath === filePath) {
      onCloseFile(filePath);
    }
  }, [onCloseFile, openFilePath]);

  const handleExternalFileDrop = useCallback((leafId: string, zone: DropZone, filePath: string) => {
    const tabId = tabIdForFilePath(filePath);

    setFileSurfacePaths((current) =>
      current.includes(filePath) ? current : [...current, filePath],
    );

    setLayout((current) => {
      if (!current.root) return current;

      let nextRoot = current.root;
      let nextActivePaneId = current.activePaneId;
      const sourceLeaf = findLeafContainingTab(nextRoot, tabId);
      const directionMap: Record<Exclude<DropZone, "center">, SplitDirection> = {
        top: "up",
        right: "right",
        bottom: "down",
        left: "left",
      };

      if (zone === "center") {
        if (sourceLeaf) {
          nextRoot =
            sourceLeaf.id === leafId
              ? setLeafActiveTab(nextRoot, leafId, tabId)
              : moveTabBetweenLeaves(nextRoot, sourceLeaf.id, tabId, leafId);
        } else {
          nextRoot = appendTabsToLeaf(nextRoot, leafId, [tabId], tabId);
        }
        nextRoot = ensureActiveTabs(nextRoot);
        nextActivePaneId = leafId;
      } else if (sourceLeaf?.id === leafId) {
        const leaf = findLeaf(nextRoot, leafId);
        if (!leaf || leaf.tabIds.length < 2) return current;
        const result = splitLeaf(nextRoot, leafId, directionMap[zone], tabId);
        nextRoot = ensureActiveTabs(result.root);
        nextActivePaneId = result.activePaneId ?? current.activePaneId;
      } else {
        const result = splitLeafWithExternalTab(
          nextRoot,
          leafId,
          directionMap[zone],
          tabId,
          sourceLeaf?.id ?? null,
        );
        nextRoot = ensureActiveTabs(result.root);
        nextActivePaneId = result.activePaneId ?? current.activePaneId;
      }

      const next = { root: nextRoot, activePaneId: nextActivePaneId };
      return paneLayoutEqual(current, next) ? current : next;
    });
  }, []);

  const paneCount = countLeaves(layout.root);

  if (surfaces.length === 0 || !layout.root) {
    return (
      <InlineNewSession
        projectPath={projectPath}
        projectPaths={projectPaths}
        onProjectSelect={onInlineProjectSelect}
        onSubmit={onInlineNewSession}
      />
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
        <PaneTreeView
          node={layout.root}
          paneCount={paneCount}
          surfacesById={surfacesById}
          activePaneId={layout.activePaneId}
          sizesByGroupId={sizesByGroupId}
          onSizeChange={(groupId, sizes) => setSizesByGroupId((prev) => ({ ...prev, [groupId]: sizes }))}
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
          onCloseFile={handleCloseFileSurface}
          onExternalFileDrop={handleExternalFileDrop}
          onResumeTranscript={onResumeTranscript}
          onSelectLiveSession={onSelectLiveSession}
          onSessionStart={onSessionStart}
          onSessionExit={onSessionExit}
        />
      </div>

      {/* Drag preview ghost */}
      <DragOverlay dropAnimation={null}>
        {dragSurface ? (
          <div className="flex max-w-[360px] min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border bg-background px-3 py-1.5 text-xs shadow-lg">
            {dragSurface.kind === "file" ? (
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <AgentIcon agent={dragSurface.session.agent} className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0 truncate font-medium">{dragSurface.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
