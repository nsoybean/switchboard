import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useAppState, useAppDispatch } from "../../state/context";
import { useClaudeSessions } from "../../hooks/useSessions";
import { SessionCard } from "./SessionCard";
import { FilePanel } from "../files/FilePanel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Session } from "../../state/types";

interface SessionSidebarProps {
  onNewSession: () => void;
  onResumeSession?: (sessionId: string, projectPath: string) => void;
  onRenameSession?: (sessionId: string, label: string) => Promise<void>;
  onDeleteSession?: (sessionId: string) => Promise<void>;
}

export function SessionSidebar({
  onNewSession,
  onResumeSession,
  onRenameSession,
  onDeleteSession,
}: SessionSidebarProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<"sessions" | "files">("sessions");
  const [renameTarget, setRenameTarget] = useState<Session | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);

  const { sessions: claudeSessions, loading } =
    useClaudeSessions(state.projectPath);

  const activeSessions = Object.values(state.sessions).sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const activeSessionIds = new Set(activeSessions.map((s) => s.id));
  const pastSessions = claudeSessions.filter(
    (cs) => !activeSessionIds.has(cs.session_id),
  );

  const closeRenameDialog = () => {
    setRenameTarget(null);
    setRenameValue("");
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !onRenameSession) return;
    await onRenameSession(renameTarget.id, renameValue);
    closeRenameDialog();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !onDeleteSession) return;
    await onDeleteSession(deleteTarget.id);
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

      {/* Tab switcher */}
      <div className="flex border-b shrink-0">
        <button
          onClick={() => setActiveTab("sessions")}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium transition-colors",
            activeTab === "sessions"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Sessions
        </button>
        <button
          onClick={() => setActiveTab("files")}
          className={cn(
            "flex-1 py-1.5 text-xs font-medium transition-colors",
            activeTab === "files"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Files
        </button>
      </div>

      {/* Content */}
      {activeTab === "files" && state.projectPath ? (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <FilePanel rootPath={state.projectPath} />
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col gap-0.5 p-2">
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
              isActive={state.activeSessionId === session.id}
              onRename={() => {
                setRenameTarget(session);
                setRenameValue(session.label);
              }}
              onDelete={() => setDeleteTarget(session)}
              onClick={() => {
                dispatch({ type: "SET_ACTIVE", id: session.id });
                dispatch({ type: "SET_PREVIEW_FILE", path: null });
              }}
            />
          ))}

          {/* Past Claude sessions */}
          {pastSessions.length > 0 && (
            <>
              <Separator className="my-2" />
              <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Past Sessions
              </div>
              {pastSessions.map((cs) => {
                const pseudoSession: Session = {
                  id: cs.session_id,
                  agent: "claude-code",
                  label: cs.display,
                  status: "done",
                  ptyId: null,
                  worktreePath: null,
                  branch: null,
                  cwd: cs.project_path,
                  createdAt: cs.timestamp,
                  exitCode: null,
                  command: "claude",
                  args: ["--resume", cs.session_id],
                };
                return (
                  <SessionCard
                    key={cs.session_id}
                    session={pseudoSession}
                    isActive={state.activeSessionId === cs.session_id}
                    isPast
                    tokenInfo={{
                      inputTokens: cs.input_tokens,
                      outputTokens: cs.output_tokens,
                      model: cs.model,
                    }}
                    onClick={() => {
                      if (onResumeSession) {
                        onResumeSession(cs.session_id, cs.project_path);
                      }
                    }}
                  />
                );
              })}
            </>
          )}

          {/* Empty state */}
          {activeSessions.length === 0 && pastSessions.length === 0 && !loading && (
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
      )}

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && closeRenameDialog()}>
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
              disabled={!renameValue.trim() || renameValue.trim() === renameTarget?.label}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              This removes the session from Switchboard and stops its terminal process if it is still running.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-foreground">
            Delete <span className="font-medium">{deleteTarget?.label}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteConfirm()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
