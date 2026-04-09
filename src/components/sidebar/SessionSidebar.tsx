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
import { ChevronDown, ChevronRight, FolderGit2, History, MoreHorizontal, Plus } from "lucide-react";
import { useAppState, useAppDispatch } from "../../state/context";
import { SessionCard } from "./SessionCard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  selectedSessionId?: string | null;
  historyOpen?: boolean;
  onHistoryOpenChange?: (open: boolean) => void;
}

interface ProjectSessionGroup {
  path: string;
  name: string;
  sessions: Session[];
}

function getSessionProjectPath(session: Session): string {
  return session.workspace.repoRoot ?? session.cwd;
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

  const totalSessionCount = useMemo(
    () => projectGroups.reduce((count, group) => count + group.sessions.length, 0),
    [projectGroups],
  );

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

  const totalLiveCount = totalSessionCount - totalHistoryCount;

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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide">SWITCHBOARD</h1>
        <Button size="sm" onClick={onNewSession}>
          <Plus data-icon="inline-start" />
          New
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-0.5 p-2">
          <div className="pt-1 pb-2">
            <div className="mb-2 flex items-center justify-between pl-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Projects
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onAddProject}
                title="Add new project"
              >
                <Plus />
              </Button>
            </div>

            <div className="flex flex-col gap-1">
              {projectGroups.map((group) => {
                const isActiveProject = group.path === state.projectPath;
                const isCollapsed = collapsedProjects[group.path] ?? false;
                const activeSessions = group.sessions.filter(
                  (session) => getSessionRailBucket(session.status) === "active",
                );
                const readySessions = group.sessions.filter(
                  (session) => getSessionRailBucket(session.status) === "ready-for-review",
                );
                const liveCount = activeSessions.length + readySessions.length;

                return (
                  <div key={group.path} className="space-y-1">
                    <div
                      className={`group/project flex items-center gap-1 rounded-md py-0.5 transition-colors ${
                        isActiveProject
                          ? "bg-accent/70 text-accent-foreground"
                          : "hover:bg-accent/40"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleProject(group.path)}
                        title={isCollapsed ? "Expand project sessions" : "Collapse project sessions"}
                        className="relative flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <FolderGit2 className="size-3.5 transition-opacity group-hover/project:opacity-0" />
                        {isCollapsed ? (
                          <ChevronRight className="absolute size-3.5 opacity-0 transition-opacity group-hover/project:opacity-100" />
                        ) : (
                          <ChevronDown className="absolute size-3.5 opacity-0 transition-opacity group-hover/project:opacity-100" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSelectProject(group.path)}
                        title={group.path}
                        className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm py-1 text-left text-sm"
                      >
                        <span className="truncate font-medium">{group.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {liveCount}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="mr-1 size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/project:opacity-100 group-focus-within/project:opacity-100 data-[state=open]:opacity-100"
                            onClick={(event) => event.stopPropagation()}
                            title={`${group.name} actions`}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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

                    {!isCollapsed ? (
                      <div className="space-y-1 pl-3">
                        {activeSessions.length > 0 ? (
                          <div className="space-y-1">
                            <div className="px-3 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                              Active
                            </div>
                            {activeSessions.map((session) => (
                              <SessionCard
                                key={session.id}
                                session={session}
                                isActive={effectiveSelectedSessionId === session.id}
                                timestampLabel={formatCompactRelativeTime(
                                  session.createdAt,
                                  now,
                                )}
                                timestampTitle={formatTimestampTitle(session.createdAt)}
                                onStop={
                                  session.status === "running" ||
                                  session.status === "idle" ||
                                  session.status === "needs-input"
                                    ? () => void onStopSession?.(session.id)
                                    : undefined
                                }
                                onRename={() => {
                                  setRenameTarget(session);
                                  setRenameValue(session.label);
                                }}
                                onDelete={() => setDeleteTarget(session)}
                                onClick={() => {
                                  void handleSelectSession(session);
                                }}
                              />
                            ))}
                          </div>
                        ) : null}

                        {readySessions.length > 0 ? (
                          <div className="space-y-1">
                            <div className="px-3 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                              Ready for Review
                            </div>
                            {readySessions.map((session) => (
                              <SessionCard
                                key={session.id}
                                session={session}
                                isActive={effectiveSelectedSessionId === session.id}
                                timestampLabel={formatCompactRelativeTime(
                                  session.createdAt,
                                  now,
                                )}
                                timestampTitle={formatTimestampTitle(session.createdAt)}
                                onStop={
                                  session.status === "running" ||
                                  session.status === "idle" ||
                                  session.status === "needs-input"
                                    ? () => void onStopSession?.(session.id)
                                    : undefined
                                }
                                onRename={() => {
                                  setRenameTarget(session);
                                  setRenameValue(session.label);
                                }}
                                onDelete={() => setDeleteTarget(session)}
                                onClick={() => {
                                  void handleSelectSession(session);
                                }}
                              />
                            ))}
                          </div>
                        ) : null}

                        {liveCount === 0 && group.sessions.length > 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            No live sessions. Open History to review past work.
                          </div>
                        ) : null}

                        {group.sessions.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            No sessions yet.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator className="my-2" />

          {totalSessionCount === 0 && state.sessionsLoaded ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No sessions yet.
            </div>
          ) : null}

          {totalLiveCount === 0 && totalHistoryCount > 0 && state.sessionsLoaded ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No active sessions right now. Open History to revisit previous runs.
            </div>
          ) : null}

          {!state.sessionsLoaded ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Loading sessions...
            </div>
          ) : null}
        </div>
      </div>

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

      <Dialog open={effectiveHistoryOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="flex max-h-[80vh] w-[min(820px,92vw)] max-w-none flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>History</DialogTitle>
            <DialogDescription>
              Past sessions stay here so the main rail can focus on active work.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 overflow-hidden">
            <Input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search history by session, branch, agent, or project"
            />

            <div className="min-h-0 overflow-y-auto">
              {filteredHistoryGroups.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  {totalHistoryCount === 0 ? "No history yet." : "No history matches this search."}
                </div>
              ) : (
                <div className="space-y-4 pr-1">
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

                          return (
                            <SessionCard
                              key={session.id}
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
