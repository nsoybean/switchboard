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
import { ChevronDown, History, MoreHorizontal, Plus, Trash2 } from "lucide-react";
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
}: SessionSidebarProps) {
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
      const switchedProject = projectPath !== state.projectPath;
      if (switchedProject) {
        await handleSelectProject(projectPath);
      }

      if (!switchedProject) {
        onSelectActiveSession?.(session.id);
      }
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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card">
      {/* Session list */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col py-2">
          {projectGroups.map((group) => {
            const isActiveProject = group.path === state.projectPath;
            const isCollapsed = collapsedProjects[group.path] ?? false;
            const visibleSessions = group.sessions.slice(0, PROJECT_SESSION_PREVIEW_LIMIT);

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
                      <div className="flex flex-col gap-px px-1">
                        {visibleSessions.map((session) => {
                          const isHistorySession =
                            getSessionRailBucket(session.status) === "history";
                          const canResume =
                            isHistorySession &&
                            (session.agent === "claude-code" ||
                              session.agent === "codex");

                          return (
                            <SessionCard
                              key={session.id}
                              session={session}
                              isActive={effectiveSelectedSessionId === session.id}
                              timestampLabel={formatCompactRelativeTime(
                                session.createdAt,
                                now,
                              )}
                              timestampTitle={formatTimestampTitle(session.createdAt)}
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
    </div>
  );
}
