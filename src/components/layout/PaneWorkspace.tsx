import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eye,
  Plus,
  X,
} from "lucide-react";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { Session } from "@/state/types";
import { SessionTranscriptView } from "../terminal/SessionTranscriptView";
import { XTermContainer } from "../terminal/XTermContainer";

interface PaneWorkspaceProps {
  activeSession: Session | null;
  liveSessions: Session[];
  transcriptSession: Session | null;
  onNewSession: () => void;
  onSelectLiveSession: (sessionId: string) => void;
  onCloseTranscript: () => void;
  onResumeTranscript?: () => void;
  onSessionStart: (sessionId: string) => void;
  onSessionExit: (sessionId: string) => (code: number | null) => void;
}

type SplitDirection = "left" | "right" | "up" | "down";
type PaneAxis = "horizontal" | "vertical";

interface LiveSurface {
  id: string;
  kind: "live-session";
  session: Session;
  title: string;
  closable: false;
}

interface TranscriptSurface {
  id: string;
  kind: "transcript";
  session: Session;
  title: string;
  closable: true;
}

type PaneSurface = LiveSurface | TranscriptSurface;

interface PaneLeafNode {
  kind: "leaf";
  id: string;
  tabIds: string[];
  activeTabId: string | null;
}

interface PaneSplitNode {
  kind: "split";
  id: string;
  axis: PaneAxis;
  children: PaneNode[];
}

type PaneNode = PaneLeafNode | PaneSplitNode;

interface PaneLayoutState {
  root: PaneNode | null;
  activePaneId: string | null;
}

function makeNodeId(prefix: "pane" | "split"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function createLeaf(tabIds: string[] = [], activeTabId?: string | null): PaneLeafNode {
  return {
    kind: "leaf",
    id: makeNodeId("pane"),
    tabIds,
    activeTabId: activeTabId ?? tabIds[0] ?? null,
  };
}

function arrayEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function paneNodeEqual(left: PaneNode | null, right: PaneNode | null): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.kind !== right.kind || left.id !== right.id) {
    return false;
  }

  if (left.kind === "leaf" && right.kind === "leaf") {
    return left.activeTabId === right.activeTabId && arrayEqual(left.tabIds, right.tabIds);
  }

  if (left.kind === "split" && right.kind === "split") {
    return (
      left.axis === right.axis &&
      left.children.length === right.children.length &&
      left.children.every((child, i) => paneNodeEqual(child, right.children[i]))
    );
  }

  return false;
}

function paneLayoutEqual(left: PaneLayoutState, right: PaneLayoutState) {
  return left.activePaneId === right.activePaneId && paneNodeEqual(left.root, right.root);
}

function getFirstLeaf(node: PaneNode | null): PaneLeafNode | null {
  if (!node) {
    return null;
  }

  if (node.kind === "leaf") {
    return node;
  }

  for (const child of node.children) {
    const leaf = getFirstLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

function countLeaves(node: PaneNode | null): number {
  if (!node) {
    return 0;
  }

  if (node.kind === "leaf") {
    return 1;
  }

  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function findLeaf(node: PaneNode | null, leafId: string | null): PaneLeafNode | null {
  if (!node || !leafId) {
    return null;
  }

  if (node.kind === "leaf") {
    return node.id === leafId ? node : null;
  }

  for (const child of node.children) {
    const found = findLeaf(child, leafId);
    if (found) return found;
  }
  return null;
}

function findLeafContainingTab(node: PaneNode | null, tabId: string | null): PaneLeafNode | null {
  if (!node || !tabId) {
    return null;
  }

  if (node.kind === "leaf") {
    return node.tabIds.includes(tabId) ? node : null;
  }

  for (const child of node.children) {
    const found = findLeafContainingTab(child, tabId);
    if (found) return found;
  }
  return null;
}

function collectAssignedTabIds(node: PaneNode | null): string[] {
  if (!node) {
    return [];
  }

  if (node.kind === "leaf") {
    return node.tabIds;
  }

  return node.children.flatMap(collectAssignedTabIds);
}

function ensureActiveTabs(node: PaneNode): PaneNode {
  if (node.kind === "leaf") {
    const nextActiveTabId =
      node.activeTabId && node.tabIds.includes(node.activeTabId)
        ? node.activeTabId
        : node.tabIds[0] ?? null;

    if (nextActiveTabId === node.activeTabId) {
      return node;
    }

    return { ...node, activeTabId: nextActiveTabId };
  }

  const nextChildren = node.children.map(ensureActiveTabs);
  if (nextChildren.every((child, i) => child === node.children[i])) {
    return node;
  }

  return { ...node, children: nextChildren };
}

function normalizeNode(node: PaneNode | null, availableTabIds: Set<string>): PaneNode | null {
  if (!node) {
    return null;
  }

  if (node.kind === "leaf") {
    const nextTabIds = node.tabIds.filter((tabId) => availableTabIds.has(tabId));
    if (nextTabIds.length === 0) {
      return null;
    }

    const nextActiveTabId =
      node.activeTabId && nextTabIds.includes(node.activeTabId)
        ? node.activeTabId
        : nextTabIds[0];

    if (arrayEqual(nextTabIds, node.tabIds) && nextActiveTabId === node.activeTabId) {
      return node;
    }

    return {
      ...node,
      tabIds: nextTabIds,
      activeTabId: nextActiveTabId,
    };
  }

  const nextChildren = node.children
    .map((child) => normalizeNode(child, availableTabIds))
    .filter((child): child is PaneNode => child !== null);

  if (nextChildren.length === 0) {
    return null;
  }

  if (nextChildren.length === 1) {
    return nextChildren[0];
  }

  if (
    nextChildren.length === node.children.length &&
    nextChildren.every((child, i) => child === node.children[i])
  ) {
    return node;
  }

  return { ...node, children: nextChildren };
}

function appendTabsToLeaf(
  node: PaneNode,
  leafId: string,
  tabIds: string[],
  preferredActiveTabId: string | null,
): PaneNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId || tabIds.length === 0) {
      return node;
    }

    const seen = new Set(node.tabIds);
    const nextTabIds = [...node.tabIds];
    for (const tabId of tabIds) {
      if (!seen.has(tabId)) {
        seen.add(tabId);
        nextTabIds.push(tabId);
      }
    }

    const nextActiveTabId =
      preferredActiveTabId && nextTabIds.includes(preferredActiveTabId)
        ? preferredActiveTabId
        : node.activeTabId ?? nextTabIds[0] ?? null;

    if (arrayEqual(nextTabIds, node.tabIds) && nextActiveTabId === node.activeTabId) {
      return node;
    }

    return {
      ...node,
      tabIds: nextTabIds,
      activeTabId: nextActiveTabId,
    };
  }

  const nextChildren = node.children.map((child) =>
    appendTabsToLeaf(child, leafId, tabIds, preferredActiveTabId),
  );
  if (nextChildren.every((child, i) => child === node.children[i])) {
    return node;
  }

  return { ...node, children: nextChildren };
}

function appendTabsToFirstLeaf(
  node: PaneNode,
  tabIds: string[],
  preferredActiveTabId: string | null,
): PaneNode {
  const firstLeaf = getFirstLeaf(node);
  if (!firstLeaf) {
    return node;
  }

  return appendTabsToLeaf(node, firstLeaf.id, tabIds, preferredActiveTabId);
}

function setLeafActiveTab(node: PaneNode, leafId: string, tabId: string): PaneNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId || !node.tabIds.includes(tabId) || node.activeTabId === tabId) {
      return node;
    }

    return { ...node, activeTabId: tabId };
  }

  const nextChildren = node.children.map((child) =>
    setLeafActiveTab(child, leafId, tabId),
  );
  if (nextChildren.every((child, i) => child === node.children[i])) {
    return node;
  }

  return { ...node, children: nextChildren };
}

function splitLeaf(
  node: PaneNode,
  leafId: string,
  direction: SplitDirection,
  tabId: string,
): { root: PaneNode; activePaneId: string | null } {
  let nextActivePaneId: string | null = null;
  const splitAxis: PaneAxis = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const insertBefore = direction === "left" || direction === "up";

  const visit = (current: PaneNode, parentAxis?: PaneAxis): PaneNode => {
    if (current.kind === "leaf") {
      if (current.id !== leafId) {
        return current;
      }

      const remainingTabIds = current.tabIds.filter((candidate) => candidate !== tabId);
      if (!current.tabIds.includes(tabId) || remainingTabIds.length === 0) {
        return current;
      }

      const movedLeaf = createLeaf([tabId], tabId);
      const currentLeaf: PaneLeafNode = {
        ...current,
        tabIds: remainingTabIds,
        activeTabId:
          current.activeTabId && remainingTabIds.includes(current.activeTabId)
            ? current.activeTabId
            : remainingTabIds[0] ?? null,
      };

      nextActivePaneId = movedLeaf.id;

      // If parent has the same axis, we'll insert as sibling (handled in split branch below)
      // Otherwise, wrap in a new split
      if (parentAxis === splitAxis) {
        // Return a sentinel split that the parent will absorb
        return {
          kind: "split",
          id: "__absorb__",
          axis: splitAxis,
          children: insertBefore
            ? [movedLeaf, currentLeaf]
            : [currentLeaf, movedLeaf],
        };
      }

      return {
        kind: "split",
        id: makeNodeId("split"),
        axis: splitAxis,
        children: insertBefore
          ? [movedLeaf, currentLeaf]
          : [currentLeaf, movedLeaf],
      };
    }

    const nextChildren = current.children.map((child) =>
      visit(child, current.axis),
    );
    if (nextChildren.every((child, i) => child === current.children[i])) {
      return current;
    }

    // Absorb sentinel children: if a child is a split with the same axis and id "__absorb__",
    // splice its children into our children array
    if (current.axis === splitAxis) {
      const absorbed: PaneNode[] = [];
      for (const child of nextChildren) {
        if (child.kind === "split" && child.id === "__absorb__" && child.axis === current.axis) {
          absorbed.push(...child.children);
        } else {
          absorbed.push(child);
        }
      }
      return { ...current, children: absorbed };
    }

    return { ...current, children: nextChildren };
  };

  return {
    root: visit(node),
    activePaneId: nextActivePaneId,
  };
}

interface RemoveLeafResult {
  node: PaneNode | null;
  removed: boolean;
  focusLeafId: string | null;
}

function closeLeaf(node: PaneNode, leafId: string): RemoveLeafResult {
  if (node.kind === "leaf") {
    if (node.id !== leafId) {
      return { node, removed: false, focusLeafId: null };
    }
    return { node: null, removed: true, focusLeafId: null };
  }

  // Try removing from each child
  for (let i = 0; i < node.children.length; i++) {
    const result = closeLeaf(node.children[i], leafId);
    if (!result.removed) continue;

    const removedChild = node.children[i];
    const tabsToRedistribute = collectAssignedTabIds(removedChild);

    if (result.node) {
      // Child was pruned but not fully removed — replace in place
      const nextChildren = [...node.children];
      nextChildren[i] = result.node;
      return {
        node: { ...node, children: nextChildren },
        removed: true,
        focusLeafId: getFirstLeaf(result.node)?.id ?? null,
      };
    }

    // Child fully removed — splice it out
    const remaining = node.children.filter((_, idx) => idx !== i);

    if (remaining.length === 0) {
      return { node: null, removed: true, focusLeafId: null };
    }

    // Redistribute tabs from removed child into adjacent sibling
    const adjacentIdx = Math.min(i, remaining.length - 1);
    remaining[adjacentIdx] = appendTabsToFirstLeaf(
      remaining[adjacentIdx],
      tabsToRedistribute,
      null,
    );

    if (remaining.length === 1) {
      // Collapse single-child split
      return {
        node: remaining[0],
        removed: true,
        focusLeafId: getFirstLeaf(remaining[0])?.id ?? null,
      };
    }

    return {
      node: { ...node, children: remaining },
      removed: true,
      focusLeafId: getFirstLeaf(remaining[adjacentIdx])?.id ?? null,
    };
  }

  return { node, removed: false, focusLeafId: null };
}

function syncPaneLayout(
  current: PaneLayoutState,
  surfaces: PaneSurface[],
  preferredTabId: string | null,
): PaneLayoutState {
  if (surfaces.length === 0) {
    return { root: null, activePaneId: null };
  }

  const orderedTabIds = surfaces.map((surface) => surface.id);
  const availableTabIds = new Set(orderedTabIds);
  let root = normalizeNode(current.root, availableTabIds);

  if (!root) {
    root = createLeaf([orderedTabIds[0]], orderedTabIds[0]);
  }

  const shouldFocusPreferred = Boolean(preferredTabId && !findLeafContainingTab(current.root, preferredTabId));
  let activePaneId = findLeaf(root, current.activePaneId)?.id ?? null;
  const assignedTabIds = new Set(collectAssignedTabIds(root));
  const missingTabIds = orderedTabIds.filter((tabId) => !assignedTabIds.has(tabId));

  if (missingTabIds.length > 0) {
    const targetLeafId =
      activePaneId ??
      findLeafContainingTab(root, preferredTabId)?.id ??
      getFirstLeaf(root)?.id;

    if (targetLeafId) {
      root = appendTabsToLeaf(root, targetLeafId, missingTabIds, preferredTabId);
    }
  }

  root = ensureActiveTabs(root);

  if (preferredTabId && shouldFocusPreferred) {
    const preferredLeaf = findLeafContainingTab(root, preferredTabId);
    if (preferredLeaf) {
      root = setLeafActiveTab(root, preferredLeaf.id, preferredTabId);
      activePaneId = preferredLeaf.id;
    }
  }

  if (!findLeaf(root, activePaneId)?.id) {
    activePaneId = getFirstLeaf(root)?.id ?? null;
  }

  return {
    root,
    activePaneId,
  };
}

function EmptyPaneState({
  onNewSession,
}: {
  onNewSession: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="max-w-sm text-center">
        <h2 className="mb-3 text-lg font-semibold">Session Workspace</h2>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Keep sessions in a tabbed center workspace, then split panes left, right, up, or down as
          you need parallel terminal visibility.
        </p>
        <Button onClick={onNewSession}>
          <Plus data-icon="inline-start" />
          Start Session
        </Button>
      </div>
    </div>
  );
}

function PaneSurfaceBadge({ surface }: { surface: PaneSurface }) {
  if (surface.kind === "live-session") {
    return (
      <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">
        Live
      </Badge>
    );
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
  isFocused,
  onFocusPane,
  onSelectTab,
  onSplit,
  onClosePane,
  onCloseTranscript,
  onResumeTranscript,
  onSelectLiveSession,
  onSessionStart,
  onSessionExit,
}: {
  leaf: PaneLeafNode;
  paneCount: number;
  surfacesById: Map<string, PaneSurface>;
  isFocused: boolean;
  onFocusPane: (paneId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onCloseTranscript: () => void;
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

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col bg-background",
        isFocused ? "ring-1 ring-border ring-inset" : "",
      )}
      onMouseDown={() => onFocusPane(leaf.id)}
    >
      <div className="border-b bg-card/85 px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
                    "group/pane-tab flex max-w-[260px] items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                    isActive
                      ? "border-border bg-background text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
                  )}
                >
                  <AgentIcon agent={surface.session.agent} className="size-3.5 shrink-0" />
                  <span className="truncate font-medium">{surface.title}</span>
                  <PaneSurfaceBadge surface={surface} />
                  {surface.closable ? (
                    <span
                      className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-60 transition-opacity hover:bg-accent hover:text-foreground group-hover/pane-tab:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseTranscript();
                      }}
                      role="button"
                      aria-label={`Close ${surface.title}`}
                    >
                      <X className="size-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {([
              { direction: "left", label: "Split left", icon: ArrowLeft },
              { direction: "right", label: "Split right", icon: ArrowRight },
              { direction: "up", label: "Split up", icon: ArrowUp },
              { direction: "down", label: "Split down", icon: ArrowDown },
            ] as const).map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.direction}
                  type="button"
                  onClick={() => onSplit(leaf.id, action.direction)}
                  disabled={!canSplit}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-md border text-muted-foreground transition-colors",
                    canSplit
                      ? "border-transparent hover:border-border hover:bg-background hover:text-foreground"
                      : "cursor-not-allowed border-transparent opacity-40",
                  )}
                  title={canSplit ? action.label : "Open more than one tab in this pane to split it"}
                  aria-label={action.label}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}

            {paneCount > 1 ? (
              <button
                type="button"
                onClick={() => onClosePane(leaf.id)}
                className="inline-flex size-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background hover:text-foreground"
                title="Close pane"
                aria-label="Close pane"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {leaf.tabIds.map((tabId) => {
          const surface = surfacesById.get(tabId);
          if (!surface) {
            return null;
          }

          const isActive = tabId === leaf.activeTabId;

          return (
            <div key={tabId} className={cn("h-full min-h-0", isActive ? "block" : "hidden")}>
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
  onCloseTranscript,
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
  onCloseTranscript: () => void;
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
        isFocused={activePaneId === node.id}
        onFocusPane={onFocusPane}
        onSelectTab={onSelectTab}
        onSplit={onSplit}
        onClosePane={onClosePane}
        onCloseTranscript={onCloseTranscript}
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
              onCloseTranscript={onCloseTranscript}
              onResumeTranscript={onResumeTranscript}
              onSelectLiveSession={onSelectLiveSession}
              onSessionStart={onSessionStart}
              onSessionExit={onSessionExit}
            />
          </ResizablePanel>
        );
        return index === 0
          ? [panel]
          : [<ResizableHandle key={`handle-${child.id}`} withHandle />, panel];
      })}
    </ResizablePanelGroup>
  );
}

export function PaneWorkspace({
  activeSession,
  liveSessions,
  transcriptSession,
  onNewSession,
  onSelectLiveSession,
  onCloseTranscript,
  onResumeTranscript,
  onSessionStart,
  onSessionExit,
}: PaneWorkspaceProps) {
  const surfaces = useMemo<PaneSurface[]>(() => {
    const nextSurfaces: PaneSurface[] = liveSessions.map((session) => ({
      id: `live:${session.id}`,
      kind: "live-session",
      session,
      title: session.label,
      closable: false,
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

    return nextSurfaces;
  }, [liveSessions, transcriptSession]);

  const surfacesById = useMemo(
    () => new Map(surfaces.map((surface) => [surface.id, surface])),
    [surfaces],
  );
  const preferredTabId = transcriptSession
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
    return <EmptyPaneState onNewSession={onNewSession} />;
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
        onCloseTranscript={onCloseTranscript}
        onResumeTranscript={onResumeTranscript}
        onSelectLiveSession={onSelectLiveSession}
        onSessionStart={onSessionStart}
        onSessionExit={onSessionExit}
      />
    </div>
  );
}
