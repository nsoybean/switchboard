import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { FolderOpen, Plus, Terminal } from "lucide-react";
import { useAppState } from "@/state/context";
import { AgentIcon } from "@/components/agents/AgentIcon";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import type { Session } from "@/state/types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectSession: (session: Session) => void;
  onNewSessionInProject: (projectPath: string) => void;
}

export function CommandPalette({
  open,
  onClose,
  onSelectSession,
  onNewSessionInProject,
}: CommandPaletteProps) {
  const state = useAppState();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  const liveSessions = useMemo(
    () =>
      Object.values(state.sessions).filter(
        (s) =>
          s.status === "running" || s.status === "idle" || s.status === "needs-input",
      ),
    [state.sessions],
  );

  const historySessions = useMemo(
    () =>
      Object.values(state.sessions)
        .filter(
          (s) =>
            s.status === "done" || s.status === "error" || s.status === "stopped",
        )
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 10),
    [state.sessions],
  );

  const projectPaths = useMemo(
    () =>
      Array.from(
        new Set([...(state.projectPath ? [state.projectPath] : []), ...state.projects]),
      ),
    [state.projectPath, state.projects],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[20vh] supports-backdrop-filter:bg-background/20 supports-backdrop-filter:backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-lg border border-border bg-popover/95 shadow-xl supports-backdrop-filter:backdrop-blur-sm">
        <Command shouldFilter loop>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Terminal className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Jump to session, project, or action..."
              value={query}
              onValueChange={setQuery}
              className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results
            </Command.Empty>

            {liveSessions.length > 0 && (
              <Command.Group heading="Live sessions">
                {liveSessions.map((session) => (
                  <Command.Item
                    key={`live-${session.id}`}
                    value={`live ${session.id} ${session.label} ${session.branch ?? ""} ${session.agent}`}
                    onSelect={() => {
                      onSelectSession(session);
                      onClose();
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                      "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    )}
                  >
                    <AgentIcon agent={session.agent} className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {session.label || "New session"}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      Jump to tab
                    </span>
                    {session.branch && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {session.branch}
                      </span>
                    )}
                    <StatusDot status={session.status} />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {historySessions.length > 0 && (
              <Command.Group heading="Recent history">
                {historySessions.map((session) => (
                  <Command.Item
                    key={`hist-${session.id}`}
                    value={`history ${session.id} ${session.label} ${session.branch ?? ""} ${session.agent}`}
                    onSelect={() => {
                      onSelectSession(session);
                      onClose();
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground",
                      "aria-selected:bg-accent aria-selected:text-accent-foreground",
                    )}
                  >
                    <AgentIcon agent={session.agent} className="size-4 shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 truncate">
                      {session.label || "New session"}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      Open transcript
                    </span>
                    <StatusDot status={session.status} />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {projectPaths.length > 0 && (
              <Command.Group heading="Projects">
                {projectPaths.map((path) => {
                  const name = path.split("/").pop() ?? path;
                  return (
                    <Command.Item
                      key={`proj-${path}`}
                      value={`new session project ${name} ${path}`}
                      onSelect={() => {
                        onNewSessionInProject(path);
                        onClose();
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                        "aria-selected:bg-accent aria-selected:text-accent-foreground",
                      )}
                    >
                      <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Plus className="size-3" />
                        New session
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
