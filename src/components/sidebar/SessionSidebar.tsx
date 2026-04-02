import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FolderGit2, Plus } from "lucide-react";
import { useAppState, useAppDispatch } from "../../state/context";
import { useClaudeSessions, useCodexSessions } from "../../hooks/useSessions";
import { SessionCard } from "./SessionCard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCompactRelativeTime, formatTimestampTitle } from "@/lib/time";
import type { Session } from "../../state/types";

interface SessionSidebarProps {
  onNewSession: () => void;
  onAddProject?: () => void;
  onSelectProject?: (path: string) => void;
  onViewSession?: (session: Session) => void;
  onSelectActiveSession?: (sessionId?: string) => void;
  onResumeSession?: (session: Session) => Promise<void> | void;
  onStopSession?: (sessionId: string) => Promise<void>;
  onRenameSession?: (session: Session, label: string) => Promise<void>;
  onDeleteSession?: (session: Session) => Promise<void>;
  selectedSessionId?: string | null;
}

interface SessionTarget {
  session: Session;
  source: "local" | "history";
}

interface PastSessionItem {
  key: string;
  session: Session;
  source: "local" | "history";
  tokenInfo?: {
    inputTokens: number;
    outputTokens: number;
    model: string | null;
  };
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
  const [renameTarget, setRenameTarget] = useState<SessionTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SessionTarget | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const {
    sessions: claudeSessions,
    loading: claudeLoading,
    reload: reloadClaudeSessions,
  } = useClaudeSessions(state.projectPath);
  const {
    sessions: codexSessions,
    loading: codexLoading,
    reload: reloadCodexSessions,
  } = useCodexSessions(state.projectPath);
  const loading = claudeLoading || codexLoading;
  const effectiveSelectedSessionId = selectedSessionId ?? state.activeSessionId;

  const allLocalSessions = Object.values(state.sessions)
    .filter((session) => {
      if (!state.projectPath) return true;
      return (
        session.workspace.repoRoot === state.projectPath ||
        session.cwd === state.projectPath ||
        session.cwd.startsWith(`${state.projectPath}/`)
      );
    })
    .sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const activeSessions = allLocalSessions.filter(
    (session) =>
      session.status === "running" ||
      session.status === "idle" ||
      session.status === "needs-input",
  );
  const endedSessions = allLocalSessions.filter(
    (session) =>
      session.status === "done" ||
      session.status === "stopped" ||
      session.status === "error",
  );
  const representedHistoryKeys = new Set(
    allLocalSessions.flatMap((session) => {
      if (session.agent === "claude-code") {
        return [`claude-code:${session.resumeTargetId ?? session.id}`];
      }
      if (session.agent === "codex" && session.resumeTargetId) {
        return [`codex:${session.resumeTargetId}`];
      }
      return [];
    }),
  );

  const pastSessions: PastSessionItem[] = [
    ...endedSessions.map((session) => ({
      key: `local:${session.id}`,
      session,
      source: "local" as const,
    })),
    ...claudeSessions
      .filter(
        (cs) => !representedHistoryKeys.has(`claude-code:${cs.session_id}`),
      )
      .map((cs) => ({
        key: `claude:${cs.session_id}`,
        source: "history" as const,
        tokenInfo: {
          inputTokens: cs.input_tokens,
          outputTokens: cs.output_tokens,
          model: cs.model,
        },
        session: {
          id: cs.session_id,
          agent: "claude-code" as const,
          label: cs.display,
          status: "done" as const,
          resumeTargetId: cs.session_id,
          worktreePath: null,
          branch: null,
          workspace: {
            repoRoot: state.projectPath,
            launchRoot: cs.project_path,
            displayPath:
              state.projectPath && cs.project_path === state.projectPath
                ? "."
                : cs.project_path.split("/").slice(-2).join("/"),
            worktreePath: null,
            workspaceKind: "project" as const,
            branchName: null,
            baseBranchName: null,
            headKind: "unknown" as const,
          },
          cwd: cs.project_path,
          createdAt: cs.timestamp,
          exitCode: null,
          command: "claude",
          args: ["--resume", cs.session_id],
        },
      })),
    ...codexSessions
      .filter((cs) => !representedHistoryKeys.has(`codex:${cs.session_id}`))
      .map((cs) => ({
        key: `codex:${cs.session_id}`,
        source: "history" as const,
        session: {
          id: cs.session_id,
          agent: "codex" as const,
          label: cs.display,
          status: "done" as const,
          resumeTargetId: cs.session_id,
          worktreePath: null,
          branch: null,
          workspace: {
            repoRoot: state.projectPath,
            launchRoot: cs.project_path,
            displayPath:
              state.projectPath && cs.project_path === state.projectPath
                ? "."
                : cs.project_path.split("/").slice(-2).join("/"),
            worktreePath: null,
            workspaceKind: "project" as const,
            branchName: null,
            baseBranchName: null,
            headKind: "unknown" as const,
          },
          cwd: cs.project_path,
          createdAt: cs.timestamp,
          exitCode: null,
          command: "codex",
          args: ["resume", cs.session_id],
        },
      })),
  ].sort(
    (a, b) =>
      new Date(b.session.createdAt).getTime() -
      new Date(a.session.createdAt).getTime(),
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const closeRenameDialog = () => {
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !onRenameSession) return;
    await onRenameSession(renameTarget.session, renameValue);
    if (renameTarget.source === "history") {
      if (renameTarget.session.agent === "codex") {
        reloadCodexSessions();
      } else {
        reloadClaudeSessions();
      }
    }
    closeRenameDialog();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !onDeleteSession) return;
    await onDeleteSession(deleteTarget.session);
    if (deleteTarget.source === "history") {
      if (deleteTarget.session.agent === "codex") {
        reloadCodexSessions();
      } else {
        reloadClaudeSessions();
      }
    }
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col h-full w-full bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="text-sm font-semibold tracking-wide">SWITCHBOARD</h1>
        <Button size="sm" onClick={onNewSession}>
          <Plus data-icon="inline-start" />
          New
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-0.5 p-2">
          <div className="px-3 pt-1 pb-2">
            <div className="mb-2 flex items-center justify-between">
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
              {state.projects.map((path) => {
                const name = path.split("/").pop() ?? path;
                const isActive = path === state.projectPath;
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => onSelectProject?.(path)}
                    title={path}
                    className={
                      `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`
                    }
                  >
                    <FolderGit2 className="size-3.5 shrink-0" />
                    <span className="truncate font-medium">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className="my-2" />

          {/* Active sessions */}
          {activeSessions.length > 0 && pastSessions.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Active
            </div>
          )}
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
                (session.status === "running" ||
                  session.status === "idle" ||
                  session.status === "needs-input")
                  ? () => void onStopSession?.(session.id)
                  : undefined
              }
              onRename={() => {
                setRenameTarget({ session, source: "local" });
                setRenameValue(session.label);
              }}
              onDelete={() => setDeleteTarget({ session, source: "local" })}
              onClick={() => {
                onSelectActiveSession?.(session.id);
                dispatch({ type: "SET_ACTIVE", id: session.id });
                dispatch({ type: "SET_PREVIEW_FILE", path: null });
              }}
            />
          ))}

          {/* Past sessions */}
          {pastSessions.length > 0 && (
            <>
              <Separator className="my-2" />
              <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Past Sessions
              </div>
              {pastSessions.map((item) => {
                const canResume =
                  item.session.agent === "claude-code" ||
                  item.session.agent === "codex";
                return (
                  <SessionCard
                    key={item.key}
                    session={item.session}
                    isActive={effectiveSelectedSessionId === item.session.id}
                    timestampLabel={formatCompactRelativeTime(
                      item.session.createdAt,
                      now,
                    )}
                    timestampTitle={formatTimestampTitle(
                      item.session.createdAt,
                    )}
                    tokenInfo={item.tokenInfo}
                    onResume={
                      canResume && onResumeSession
                        ? () => void onResumeSession(item.session)
                        : undefined
                    }
                    onRename={() => {
                      setRenameTarget({
                        session: item.session,
                        source: item.source,
                      });
                      setRenameValue(item.session.label);
                    }}
                    onDelete={() => {
                      setDeleteTarget({
                        session: item.session,
                        source: item.source,
                      });
                    }}
                    onClick={() => {
                      onViewSession?.(item.session);
                    }}
                  />
                );
              })}
            </>
          )}

          {/* Empty state */}
          {activeSessions.length === 0 &&
            pastSessions.length === 0 &&
            !loading && (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                No sessions yet.
              </div>
            )}

          {/* Loading state */}
          {loading && activeSessions.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Loading sessions...
            </div>
          )}
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
              placeholder="e.g. auth-refactor"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeRenameDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleRenameSubmit()}
              disabled={
                !renameValue.trim() ||
                renameValue.trim() === renameTarget?.session.label
              }
            >
              Save
            </Button>
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
              This removes the session from Switchboard and stops its terminal
              process if it is still running.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-foreground">
            Delete{" "}
            <span className="font-medium">{deleteTarget?.session.label}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
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
