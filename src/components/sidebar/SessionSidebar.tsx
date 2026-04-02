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
import { ChevronDown, ChevronRight, FolderGit2, Plus } from "lucide-react";
import { useAppState, useAppDispatch } from "../../state/context";
import { SessionCard } from "./SessionCard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCompactRelativeTime, formatTimestampTitle } from "@/lib/time";
import type { Session } from "../../state/types";

interface SessionSidebarProps {
  onNewSession: () => void;
  onAddProject?: () => void;
  onSelectProject?: (path: string) => Promise<void> | void;
  onViewSession?: (session: Session) => void;
  onSelectActiveSession?: (sessionId?: string) => void;
  onResumeSession?: (session: Session) => Promise<void> | void;
  onStopSession?: (sessionId: string) => Promise<void>;
  onRenameSession?: (session: Session, label: string) => Promise<void>;
  onDeleteSession?: (session: Session) => Promise<void>;
  selectedSessionId?: string | null;
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
  onViewSession,
  onSelectActiveSession,
  onResumeSession,
  onStopSession,
  onRenameSession,
  onDeleteSession,
  selectedSessionId,
}: SessionSidebarProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [renameTarget, setRenameTarget] = useState<Session | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const effectiveSelectedSessionId = selectedSessionId ?? state.activeSessionId;

  const projectGroups = useMemo<ProjectSessionGroup[]>(() => {
    const sessionsByProject = new Map<string, Session[]>();
    Object.values(state.sessions).forEach((session) => {
      const projectPath = getSessionProjectPath(session);
      const current = sessionsByProject.get(projectPath) ?? [];
      current.push(session);
      sessionsByProject.set(projectPath, current);
    });

    const orderedProjectPaths = [
      ...state.projects,
      ...Array.from(sessionsByProject.keys()).filter(
        (path) => !state.projects.includes(path),
      ),
    ];

    return orderedProjectPaths.map((path) => ({
      path,
      name: path.split("/").pop() ?? path,
      sessions: (sessionsByProject.get(path) ?? []).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));
  }, [state.projects, state.sessions]);

  const totalSessionCount = useMemo(
    () => projectGroups.reduce((count, group) => count + group.sessions.length, 0),
    [projectGroups],
  );

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

      onViewSession?.(session);
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
                  (session) =>
                    session.status === "running" ||
                    session.status === "idle" ||
                    session.status === "needs-input",
                );
                const pastSessions = group.sessions.filter(
                  (session) =>
                    session.status === "done" ||
                    session.status === "stopped" ||
                    session.status === "error",
                );

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
                          {group.sessions.length}
                        </span>
                      </button>
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

                        {pastSessions.length > 0 ? (
                          <div className="space-y-1">
                            <div className="px-3 pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                              {activeSessions.length > 0 ? "Past Sessions" : "Sessions"}
                            </div>
                            {pastSessions.map((session) => {
                              const canResume =
                                session.agent === "claude-code" ||
                                session.agent === "codex";

                              return (
                                <SessionCard
                                  key={session.id}
                                  session={session}
                                  isActive={effectiveSelectedSessionId === session.id}
                                  timestampLabel={formatCompactRelativeTime(
                                    session.createdAt,
                                    now,
                                  )}
                                  timestampTitle={formatTimestampTitle(
                                    session.createdAt,
                                  )}
                                  onResume={
                                    canResume && onResumeSession
                                      ? () => void handleResumeSessionClick(session)
                                      : undefined
                                  }
                                  onRename={() => {
                                    setRenameTarget(session);
                                    setRenameValue(session.label);
                                  }}
                                  onDelete={() => setDeleteTarget(session)}
                                  onClick={() => {
                                    void handleViewSession(session);
                                  }}
                                />
                              );
                            })}
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

          {!state.sessionsLoaded ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Loading sessions...
            </div>
          ) : null}
        </div>
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
    </div>
  );
}
