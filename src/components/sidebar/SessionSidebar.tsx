import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, History, MoreHorizontal, Pin, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppState, useAppDispatch } from "../../state/context";
import { SessionCard } from "./SessionCard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSessionRailBucket } from "@/lib/session-attention";
import { formatCompactRelativeTime, formatTimestampTitle } from "@/lib/time";
import type { Session } from "../../state/types";

interface SessionSidebarProps {
  onNewSession: () => void;
  onAddProject?: () => void;
  onSelectProject?: (path: string) => Promise<void> | void;
  onOpenProject?: (path: string) => Promise<void> | void;
  onRemoveProject?: (path: string) => Promise<void> | void;
  onViewSession?: (session: Session) => Promise<void> | void;
  onSelectActiveSession?: (sessionId?: string) => void;
  onResumeSession?: (session: Session) => Promise<void> | void;
  onStopSession?: (sessionId: string) => Promise<void>;
  onRenameSession?: (session: Session, label: string) => Promise<void>;
  onDeleteSession?: (session: Session) => Promise<void>;
  onDeleteSessionsBatch?: (sessions: Session[]) => Promise<void>;
  selectedSessionId?: string | null;
  historyOpen?: boolean;
  onHistoryOpenChange?: (open: boolean) => void;
  openTabSessionIds?: string[];
}

interface ProjectSessionGroup {
  path: string;
  name: string;
  sessions: Session[];
}

const PROJECT_SESSION_PREVIEW_LIMIT = 5;

function getSessionProjectPath(session: Session): string {
  return session.workspace.repoRoot ?? session.cwd;
}

/** Letter avatar for a project name */
function ProjectAvatar({ name, isActive }: { name: string; isActive: boolean }) {
  const letter = (name[0] ?? "?").toUpperCase();
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
        isActive
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {letter}
    </span>
  );
}

/** Wrapper that makes a SessionCard draggable via dnd-kit v6 */
function DraggableSessionCard(props: React.ComponentProps<typeof SessionCard> & { dragId: string; isDragActive?: boolean }) {
  const { dragId, isDragActive, ...cardProps } = props;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: dragId });
  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50, position: "relative" as const }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="min-w-0 max-w-full overflow-hidden touch-pan-y"
    >
      <SessionCard {...cardProps} isDragSource={isDragActive} />
    </div>
  );
}

/** Sortable pinned session card with reorder animation */
function SortablePinnedCard(props: React.ComponentProps<typeof SessionCard> & { sortableId: string }) {
  const { sortableId, ...cardProps } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    activeIndex,
    overIndex,
  } = useSortable({ id: sortableId });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    position: "relative" as const,
  };
  const indicatorBelow = isOver && !isDragging && activeIndex !== -1 && activeIndex < overIndex;
  const indicatorAbove = isOver && !isDragging && !indicatorBelow;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative min-w-0 max-w-full overflow-hidden touch-pan-y"
    >
      {indicatorAbove && (
        <div className="absolute top-0 left-0 right-0 h-[2px] -translate-y-[1px] bg-primary rounded-full" />
      )}
      {indicatorBelow && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] translate-y-[1px] bg-primary rounded-full" />
      )}
      <SessionCard {...cardProps} />
    </div>
  );
}

/** Droppable area inside the pinned section */
function PinnedDropArea({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: "pinned-drop-zone" });
  return (
    <div ref={setNodeRef} className="min-w-0 overflow-x-hidden pb-2 pl-4">
      {children}
    </div>
  );
}

export function SessionSidebar({
  onNewSession,
  onAddProject,
  onSelectProject,
  onOpenProject,
  onRemoveProject,
  onViewSession,
  onSelectActiveSession,
  onResumeSession,
  onStopSession,
  onRenameSession,
  onDeleteSession,
  onDeleteSessionsBatch,
  selectedSessionId,
  historyOpen,
  onHistoryOpenChange,
  openTabSessionIds,
}: SessionSidebarProps) {
  const openTabSet = useMemo(() => new Set(openTabSessionIds ?? []), [openTabSessionIds]);
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [renameTarget, setRenameTarget] = useState<Session | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [historyOpenInternal, setHistoryOpenInternal] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("switchboard-pinned-sessions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [dragOverPinned, setDragOverPinned] = useState(false);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const effectiveSelectedSessionId = selectedSessionId ?? state.activeSessionId;
  const effectiveHistoryOpen = historyOpen ?? historyOpenInternal;

  const setHistoryOpen = useCallback(
    (open: boolean) => {
      if (onHistoryOpenChange) {
        onHistoryOpenChange(open);
        return;
      }
      setHistoryOpenInternal(open);
    },
    [onHistoryOpenChange],
  );

  const persistPinnedIds = useCallback((ids: string[]) => {
    setPinnedIds(ids);
    localStorage.setItem("switchboard-pinned-sessions", JSON.stringify(ids));
  }, []);

  const togglePin = useCallback(
    (sessionId: string) => {
      persistPinnedIds(
        pinnedIds.includes(sessionId)
          ? pinnedIds.filter((id) => id !== sessionId)
          : [...pinnedIds, sessionId],
      );
    },
    [pinnedIds, persistPinnedIds],
  );

  const pinnedSessions = useMemo(
    () =>
      pinnedIds
        .map((id) => state.sessions[id])
        .filter((s): s is Session => s != null),
    [pinnedIds, state.sessions],
  );

  const projectGroups = useMemo<ProjectSessionGroup[]>(() => {
    const sessionsByProject = new Map<string, Session[]>();
    Object.values(state.sessions).forEach((session) => {
      const projectPath = getSessionProjectPath(session);
      const current = sessionsByProject.get(projectPath) ?? [];
      current.push(session);
      sessionsByProject.set(projectPath, current);
    });

    const orderedProjectPaths = state.projectPath
      ? Array.from(new Set([...state.projects, state.projectPath]))
      : state.projects;

    return orderedProjectPaths.map((path) => ({
      path,
      name: path.split("/").pop() ?? path,
      sessions: (sessionsByProject.get(path) ?? []).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));
  }, [state.projectPath, state.projects, state.sessions]);

  const totalHistoryCount = useMemo(
    () =>
      projectGroups.reduce(
        (count, group) =>
          count +
          group.sessions.filter(
            (session) => getSessionRailBucket(session.status) === "history",
          ).length,
        0,
      ),
    [projectGroups],
  );

  const filteredHistoryGroups = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();

    return projectGroups
      .map((group) => ({
        ...group,
        sessions: group.sessions.filter((session) => {
          if (getSessionRailBucket(session.status) !== "history") {
            return false;
          }

          if (!query) {
            return true;
          }

          const haystack = [
            session.label,
            session.branch ?? "",
            session.agent,
            group.name,
          ]
            .join(" ")
            .toLowerCase();

          return haystack.includes(query);
        }),
      }))
      .filter((group) => group.sessions.length > 0)
      .sort((a, b) => {
        if (a.path === state.projectPath) return -1;
        if (b.path === state.projectPath) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [historyQuery, projectGroups, state.projectPath]);

  useEffect(() => {
    const currentProjectPath = state.projectPath;
    if (!currentProjectPath) {
      return;
    }

    setCollapsedProjects((current) => ({
      ...current,
      [currentProjectPath]: false,
    }));
  }, [state.projectPath]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);


  const toggleProject = useCallback((path: string) => {
    setCollapsedProjects((current) => ({
      ...current,
      [path]: !(current[path] ?? false),
    }));
  }, []);

  const handleSelectProject = useCallback(
    async (path: string) => {
      setCollapsedProjects((current) => ({
        ...current,
        [path]: false,
      }));
      await onSelectProject?.(path);
    },
    [onSelectProject],
  );

  const handleSelectSession = useCallback(
    async (session: Session) => {
      const projectPath = getSessionProjectPath(session);
      if (projectPath !== state.projectPath) {
        await handleSelectProject(projectPath);
      }

      onSelectActiveSession?.(session.id);
      dispatch({ type: "SET_ACTIVE", id: session.id });
      dispatch({ type: "SET_PREVIEW_FILE", path: null });
    },
    [dispatch, handleSelectProject, onSelectActiveSession, state.projectPath],
  );

  const handleViewSession = useCallback(
    async (session: Session) => {
      const projectPath = getSessionProjectPath(session);
      if (projectPath !== state.projectPath) {
        await handleSelectProject(projectPath);
      }

      await onViewSession?.(session);
    },
    [handleSelectProject, onViewSession, state.projectPath],
  );

  const handleResumeSessionClick = useCallback(
    async (session: Session) => {
      const projectPath = getSessionProjectPath(session);
      if (projectPath !== state.projectPath) {
        await handleSelectProject(projectPath);
      }

      await onResumeSession?.(session);
    },
    [handleSelectProject, onResumeSession, state.projectPath],
  );

  const closeRenameDialog = () => {
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !onRenameSession) return;
    await onRenameSession(renameTarget, renameValue);
    closeRenameDialog();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !onDeleteSession) return;
    await onDeleteSession(deleteTarget);
    setDeleteTarget(null);
  };

  const toggleHistorySelection = useCallback((sessionId: string) => {
    setSelectedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const allVisibleHistoryIds = useMemo(
    () => filteredHistoryGroups.flatMap((g) => g.sessions.map((s) => s.id)),
    [filteredHistoryGroups],
  );

  const toggleSelectAll = useCallback(() => {
    setSelectedHistoryIds((prev) => {
      const allSelected = allVisibleHistoryIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allVisibleHistoryIds);
    });
  }, [allVisibleHistoryIds]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedHistoryIds.size === 0) return;
    setDeletingSelected(true);
    const sessions = Object.values(state.sessions).filter((s) =>
      selectedHistoryIds.has(s.id),
    );
    try {
      if (onDeleteSessionsBatch) {
        await onDeleteSessionsBatch(sessions);
      } else if (onDeleteSession) {
        for (const session of sessions) {
          await onDeleteSession(session).catch(() => {});
        }
      }
    } catch {
      // Errors are toasted by the parent handler.
    }
    setSelectedHistoryIds(new Set());
    setDeletingSelected(false);
  }, [onDeleteSession, onDeleteSessionsBatch, selectedHistoryIds, state.sessions]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setDragOverPinned(event.over?.id === "pinned-drop-zone");
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const sourceId = String(event.active.id);
    const targetId = event.over ? String(event.over.id) : "";
    const droppedOnPin = targetId === "pinned-drop-zone";
    const isPinnedSource = sourceId.startsWith("pinned-");
    const isPinnedTarget = targetId.startsWith("pinned-");
    const sessionId = isPinnedSource ? sourceId.replace("pinned-", "") : sourceId;

    if (isPinnedSource && isPinnedTarget) {
      const fromId = sourceId.replace("pinned-", "");
      const toId = targetId.replace("pinned-", "");
      const fromIdx = pinnedIds.indexOf(fromId);
      const toIdx = pinnedIds.indexOf(toId);
      if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
        const next = [...pinnedIds];
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, fromId);
        persistPinnedIds(next);
      }
    } else if (!isPinnedSource && isPinnedTarget && sessionId && !pinnedIds.includes(sessionId)) {
      const toId = targetId.replace("pinned-", "");
      const toIdx = pinnedIds.indexOf(toId);
      const next = [...pinnedIds];
      next.splice(toIdx === -1 ? next.length : toIdx, 0, sessionId);
      persistPinnedIds(next);
    } else if (droppedOnPin && sessionId && !pinnedIds.includes(sessionId)) {
      persistPinnedIds([...pinnedIds, sessionId]);
    } else if (isPinnedSource && !droppedOnPin && !isPinnedTarget && sessionId) {
      persistPinnedIds(pinnedIds.filter((id) => id !== sessionId));
    }

    setDragActiveId(null);
    setDragOverPinned(false);
  }, [pinnedIds, persistPinnedIds]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
    <div className="flex h-full w-full flex-col overflow-hidden bg-card overscroll-x-none">
      {/* New session button */}
      <div className="shrink-0 px-3 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-1.5 text-xs"
          onClick={onNewSession}
        >
          <Plus className="size-3.5" />
          New Session
        </Button>
      </div>

      {/* Session list */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-x-none [touch-action:pan-y]">
        <div className="flex min-w-0 flex-col py-2">
          {/* Pinned section */}
          <div className="mb-1">
              <div
                className="flex items-center gap-2 px-3 py-1.5 w-full text-left cursor-pointer"
                onClick={() => setPinnedCollapsed((prev) => !prev)}
              >
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <Pin className="size-3 text-muted-foreground" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Pinned
                </span>
                <ChevronDown
                  className={`size-3 text-muted-foreground transition-transform ${
                    pinnedCollapsed ? "-rotate-90" : ""
                  }`}
                />
              </div>
              {!pinnedCollapsed && (
                <PinnedDropArea>
                  {pinnedSessions.length > 0 ? (
                    <SortableContext
                      items={pinnedSessions.map((s) => `pinned-${s.id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                    <div className="flex min-w-0 flex-col gap-px px-1 overflow-hidden">
                      {pinnedSessions.map((session) => {
                        const isHistorySession =
                          getSessionRailBucket(session.status) === "history";
                        const canResume =
                          isHistorySession &&
                          (session.agent === "claude-code" || session.agent === "codex");

                        return (
                          <SortablePinnedCard
                            sortableId={`pinned-${session.id}`}
                            key={session.id}
                            session={session}
                            isActive={effectiveSelectedSessionId === session.id}
                            isOpenInTab={openTabSet.has(session.id)}
                            isPinned
                            timestampLabel={formatCompactRelativeTime(session.createdAt, now)}
                            timestampTitle={formatTimestampTitle(session.createdAt)}
                            onPin={() => togglePin(session.id)}
                            onResume={
                              canResume && onResumeSession
                                ? () => void handleResumeSessionClick(session)
                                : undefined
                            }
                            onStop={
                              !isHistorySession &&
                              (session.status === "running" ||
                                session.status === "idle" ||
                                session.status === "needs-input")
                                ? () => void onStopSession?.(session.id)
                                : undefined
                            }
                            onRename={() => {
                              setRenameTarget(session);
                              setRenameValue(session.label);
                            }}
                            onDelete={() => setDeleteTarget(session)}
                            onClick={() => {
                              if (isHistorySession) {
                                void handleViewSession(session);
                                return;
                              }
                              void handleSelectSession(session);
                            }}
                          />
                        );
                      })}
                    </div>
                    </SortableContext>
                  ) : dragOverPinned ? (
                    <div className="mx-1 rounded-md border border-dashed border-foreground/30 bg-accent/30 px-3 py-2.5 text-center text-[11px] text-muted-foreground">
                      Drop here to pin
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-muted-foreground">
                      Drag to pin
                    </div>
                  )}
                </PinnedDropArea>
              )}
          </div>

          {projectGroups.map((group) => {
            const isActiveProject = group.path === state.projectPath;
            const isCollapsed = collapsedProjects[group.path] ?? false;
            const unpinnedSessions = group.sessions.filter((s) => !pinnedIds.includes(s.id));
            const visibleSessions = unpinnedSessions.slice(0, PROJECT_SESSION_PREVIEW_LIMIT);

            return (
              <div key={group.path}>
                {/* Project header */}
                <div className="group/project flex items-center gap-2 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => void handleSelectProject(group.path)}
                    className="flex min-w-0 flex-1 items-center gap-2"
                    title={group.path}
                  >
                    <ProjectAvatar name={group.name} isActive={isActiveProject} />
                    <span className="truncate text-sm font-semibold">
                      {group.name}
                    </span>
                    <ChevronDown
                      className={`size-3 shrink-0 text-muted-foreground transition-transform ${
                        isCollapsed ? "-rotate-90" : ""
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProject(group.path);
                      }}
                    />
                  </button>

                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/project:opacity-100 group-focus-within/project:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="size-6 text-muted-foreground hover:text-foreground"
                      onClick={onNewSession}
                      title="New session"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 text-muted-foreground hover:text-foreground data-[state=open]:opacity-100"
                          onClick={(event) => event.stopPropagation()}
                          title={`${group.name} actions`}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={!onAddProject}
                          onSelect={() => void onAddProject?.()}
                        >
                          Add project
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!onOpenProject}
                          onSelect={() => {
                            void onOpenProject?.(group.path);
                          }}
                        >
                          Open in Finder
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!onRemoveProject}
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            void onRemoveProject?.(group.path);
                          }}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Session list */}
                {!isCollapsed && (
                  <div className="pb-2 pl-4">
                    {visibleSessions.length > 0 ? (
                      <div className="flex min-w-0 flex-col gap-px px-1 overflow-hidden">
                        {visibleSessions.map((session) => {
                          const isHistorySession =
                            getSessionRailBucket(session.status) === "history";
                          const canResume =
                            isHistorySession &&
                            (session.agent === "claude-code" ||
                              session.agent === "codex");

                          return (
                            <DraggableSessionCard
                              dragId={session.id}
                              isDragActive={dragActiveId === session.id}
                              key={session.id}
                              session={session}
                              isActive={effectiveSelectedSessionId === session.id}
                              isOpenInTab={openTabSet.has(session.id)}
                              isPinned={pinnedIds.includes(session.id)}
                              timestampLabel={formatCompactRelativeTime(
                                session.createdAt,
                                now,
                              )}
                              timestampTitle={formatTimestampTitle(session.createdAt)}
                              onPin={() => togglePin(session.id)}
                              onResume={
                                canResume && onResumeSession
                                  ? () => {
                                      void handleResumeSessionClick(session);
                                    }
                                  : undefined
                              }
                              onStop={
                                !isHistorySession &&
                                (session.status === "running" ||
                                  session.status === "idle" ||
                                  session.status === "needs-input")
                                  ? () => void onStopSession?.(session.id)
                                  : undefined
                              }
                              onRename={() => {
                                setRenameTarget(session);
                                setRenameValue(session.label);
                              }}
                              onDelete={() => setDeleteTarget(session)}
                              onClick={() => {
                                if (isHistorySession) {
                                  void handleViewSession(session);
                                  return;
                                }
                                void handleSelectSession(session);
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-4 py-2 text-[11px] text-muted-foreground">
                        No sessions yet
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {projectGroups.length === 0 && state.sessionsLoaded && (
            <div className="flex h-32 items-center justify-center px-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">No projects yet</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={onAddProject}
                >
                  <Plus className="size-3.5" />
                  Add project
                </Button>
              </div>
            </div>
          )}

          {!state.sessionsLoaded && (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Loading sessions...
            </div>
          )}
        </div>
      </div>

      {/* Footer: History */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          className="w-full justify-between"
          onClick={() => setHistoryOpen(true)}
        >
          <span className="inline-flex items-center gap-2">
            <History className="size-4" />
            History
          </span>
          <span className="text-xs text-muted-foreground">
            {totalHistoryCount}
          </span>
        </Button>
      </div>

      {/* Rename dialog */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && closeRenameDialog()}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Rename Session</DialogTitle>
            <DialogDescription>
              Update the label shown in the session list and toolbar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Session Label
            </label>
            <Input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleRenameSubmit();
                }
              }}
              placeholder="Session label"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeRenameDialog}>
              Cancel
            </Button>
            <Button onClick={() => void handleRenameSubmit()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Remove this Switchboard session from the sidebar history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog
        open={effectiveHistoryOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedHistoryIds(new Set());
          setHistoryOpen(open);
        }}
      >
        <DialogContent
          className="flex max-h-[80vh] flex-col overflow-hidden"
          style={{
            width: "min(800px, 88vw)",
            maxWidth: "min(800px, 88vw)",
          }}
        >
          <DialogHeader>
            <DialogTitle>History</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center gap-2">
              <Input
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="Search history by session, branch, agent, or project"
                className="flex-1"
              />
              {selectedHistoryIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingSelected}
                  onClick={() => void handleDeleteSelected()}
                >
                  <Trash2 className="size-3.5" />
                  Delete {selectedHistoryIds.size}
                </Button>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto">
              {filteredHistoryGroups.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  {totalHistoryCount === 0 ? "No history yet." : "No history matches this search."}
                </div>
              ) : (
                <div className="space-y-4 pr-1">
                  {allVisibleHistoryIds.length > 0 && (
                    <div className="flex items-center gap-2 px-1">
                      <Checkbox
                        checked={
                          allVisibleHistoryIds.length > 0 &&
                          allVisibleHistoryIds.every((id) => selectedHistoryIds.has(id))
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Select all
                      </span>
                    </div>
                  )}
                  {filteredHistoryGroups.map((group) => (
                    <div key={group.path} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {group.name}
                          {group.path === state.projectPath ? " · Current Project" : ""}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {group.sessions.length}
                        </div>
                      </div>

                      <div className="space-y-1">
                        {group.sessions.map((session) => {
                          const canResume =
                            session.agent === "claude-code" ||
                            session.agent === "codex";
                          const isSelected = selectedHistoryIds.has(session.id);

                          return (
                            <div key={session.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleHistorySelection(session.id)}
                                className="shrink-0 ml-1"
                              />
                              <div className="min-w-0 flex-1">
                                <SessionCard
                                  session={session}
                                  isActive={false}
                                  timestampLabel={formatCompactRelativeTime(
                                    session.createdAt,
                                    now,
                                  )}
                                  timestampTitle={formatTimestampTitle(session.createdAt)}
                                  onResume={
                                    canResume && onResumeSession
                                      ? () => {
                                          setHistoryOpen(false);
                                          void handleResumeSessionClick(session);
                                        }
                                      : undefined
                                  }
                                  onRename={() => {
                                    setHistoryOpen(false);
                                    setRenameTarget(session);
                                    setRenameValue(session.label);
                                  }}
                                  onDelete={() => setDeleteTarget(session)}
                                  onClick={() => {
                                    setHistoryOpen(false);
                                    void handleViewSession(session);
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <DragOverlay dropAnimation={null}>
        {dragActiveId?.startsWith("pinned-") ? (() => {
          const sid = dragActiveId.replace("pinned-", "");
          const session = pinnedSessions.find((s) => s.id === sid);
          return session ? (
            <div className="inline-flex max-w-[240px] items-center rounded bg-card px-1.5 py-0.5 shadow-sm ring-1 ring-border">
              <span className="truncate text-[12px] font-medium">
                {session.label || "New session"}
              </span>
            </div>
          ) : null;
        })() : null}
      </DragOverlay>
    </div>
    </DndContext>
  );
}
