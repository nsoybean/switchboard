import { File } from "@phosphor-icons/react";
import { FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilePanel } from "../files/FilePanel";
import { GitPanel } from "../git/GitPanel";
import type { GitState, GitActions } from "@/hooks/useGitState";
import type { Session } from "@/state/types";

export type WorkspaceTab = "files" | "changes";

export interface WorkspaceContext {
  sessionId?: string | null;
  kind: "project" | "session";
  rootPath: string | null;
  label: string;
  branch: string | null;
  availability: "resolving" | "ready" | "missing";
  source: "project" | "cwd" | "worktreePath" | "history";
  isWorktree: boolean;
}

interface WorkspacePanelProps {
  activeTab: WorkspaceTab;
  context: WorkspaceContext | null;
  /** Fallback path when no session is selected (project root) */
  projectPath?: string | null;
  git: GitState & GitActions;
  branchSessions?: Session[];
  githubToken?: string | null;
  onFileSelect?: (filePath: string) => void;
  onTabChange: (tab: WorkspaceTab) => void;
}

function EmptyWorkspaceState({
  title,
  description,
  icon = false,
}: {
  title: string;
  description: string;
  icon?: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="flex max-w-xs flex-col items-center gap-2 text-center">
        {icon ? <FolderTree className="size-4 text-muted-foreground" /> : null}
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function WorkspacePanel({
  activeTab,
  context,
  projectPath,
  git,
  branchSessions = [],
  githubToken,
  onFileSelect,
  onTabChange,
}: WorkspacePanelProps) {
  const renderUnavailableState = (currentContext: WorkspaceContext, tab: WorkspaceTab) => {
    if (currentContext.availability === "resolving") {
      return (
        <EmptyWorkspaceState
          title="Resolving workspace"
          description="Switchboard is validating the selected session's workspace root."
        />
      );
    }

    if (currentContext.availability === "missing") {
      return (
        <EmptyWorkspaceState
          title={tab === "changes" ? "Cannot load changes" : "Workspace unavailable"}
          description={`Switchboard can still show ${currentContext.label}, but the saved workspace path is no longer available on disk.`}
          icon
        />
      );
    }

    if (!currentContext.rootPath) {
      return (
        <EmptyWorkspaceState
          title="No workspace selected"
          description="Open a project or select a session to inspect its workspace."
          icon
        />
      );
    }

    return null;
  };

  // Fall back to project root when no session is selected
  if (!context) {
    if (!projectPath) return null;
    const projectContext: WorkspaceContext = {
      sessionId: null,
      kind: "project",
      rootPath: projectPath,
      label: projectPath.split("/").pop() ?? projectPath,
      branch: null,
      availability: "ready",
      source: "project",
      isWorktree: false,
    };
    return (
      <WorkspacePanel
        activeTab={activeTab}
        context={projectContext}
        git={git}
        branchSessions={branchSessions}
        githubToken={githubToken}
        onFileSelect={onFileSelect}
        onTabChange={onTabChange}
      />
    );
  }

  const unavailableState = renderUnavailableState(context, activeTab);
  const changedFileCount = git.files.length;
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-card">
      <div>
        <div className="flex items-start justify-between gap-2 px-2 py-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {([
              { key: "changes" as const, label: "Changes" },
              { key: "files" as const, label: "Files" },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={cn(
                  "inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  activeTab === tab.key
                    ? "border-border bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
                )}
              >
                {tab.label}
                {tab.key === "changes" && changedFileCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
                    <File className="size-3" />
                    {changedFileCount}
                  </span>
                )}
                {tab.key === "changes" && (git.stats.additions > 0 || git.stats.deletions > 0) && (
                  <span className="flex items-center gap-0.5 font-mono text-[10px]">
                    {git.stats.additions > 0 && (
                      <span className="text-[var(--sb-diff-add-fg)]">+{git.stats.additions}</span>
                    )}
                    {git.stats.deletions > 0 && (
                      <span className="text-[var(--sb-diff-del-fg)]">-{git.stats.deletions}</span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content: full-height panel */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {unavailableState ? (
          unavailableState
        ) : (
          <>
            {activeTab === "files" ? (
              <FilePanel
                rootPath={context.rootPath!}
                onFileSelect={onFileSelect}
              />
            ) : null}

            {activeTab === "changes" ? (
              <GitPanel
                cwd={context.rootPath!}
                git={git}
                sessions={branchSessions}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
