import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  FileText,
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
  paneLayoutEqual,
  setLeafActiveTab,
  splitLeaf,
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
  const activeSurface =
    (leaf.activeTabId ? surfacesById.get(leaf.activeTabId) : null) ??
    surfacesById.get(leaf.tabIds[0]) ??
    null;
  const canSplit = leaf.tabIds.length > 1 && Boolean(activeSurface);
  const canResumeActiveTranscript =
    activeSurface?.kind === "transcript" &&
    activeSurface.session.agent !== "bash" &&
    Boolean(onResumeTranscript);

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      onMouseDown={() => onFocusPane(leaf.id)}
    >
      {/* Tab bar — sits on top of content, active tab connects seamlessly */}
      <div className="relative shrink-0 bg-muted/50">
        <div className="flex items-center">
          <div className="flex min-w-0 flex-1 items-end gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {leaf.tabIds.map((tabId) => {
              const surface = surfacesById.get(tabId);
              if (!surface) {
                return null;
              }

              const isActive = tabId === leaf.activeTabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => {
                    onSelectTab(leaf.id, tabId);
                    if (surface.kind === "live-session") {
                      onSelectLiveSession(surface.session.id);
                    }
                  }}
                  className={cn(
                    "group/pane-tab relative flex max-w-[260px] shrink-0 items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
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
                  title={canSplit ? "Split pane" : "Open more than one tab in this pane to split it"}
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
          if (!surface) {
            return null;
          }

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

  useEffect(() => {
    setLayout((current) => {
      const next = syncPaneLayout(current, surfaces, preferredTabId);
      return paneLayoutEqual(current, next) ? current : next;
    });
  }, [preferredTabId, surfaces]);

  const paneCount = countLeaves(layout.root);

  if (surfaces.length === 0 || !layout.root) {
    return <InlineNewSession projectPath={projectPath} onSubmit={onInlineNewSession} />;
  }

  return (
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
            if (!current.root) {
              return current;
            }

            const nextRoot = setLeafActiveTab(current.root, paneId, tabId);
            const nextState = {
              root: nextRoot,
              activePaneId: paneId,
            };

            return paneLayoutEqual(current, nextState) ? current : nextState;
          });
        }}
        onSplit={(paneId, direction) => {
          setLayout((current) => {
            if (!current.root) {
              return current;
            }

            const leaf = findLeaf(current.root, paneId);
            const activeTabId = leaf?.activeTabId ?? null;
            if (!leaf || !activeTabId || leaf.tabIds.length < 2) {
              return current;
            }

            const next = splitLeaf(current.root, paneId, direction, activeTabId);
            return {
              root: ensureActiveTabs(next.root),
              activePaneId: next.activePaneId ?? current.activePaneId,
            };
          });
        }}
        onClosePane={(paneId) => {
          setLayout((current) => {
            if (!current.root || countLeaves(current.root) <= 1) {
              return current;
            }

            const next = closeLeaf(current.root, paneId);
            if (!next.node) {
              return current;
            }

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
  );
}
